"""Public voice session: English language selection then verified-language conversation."""
import asyncio
import base64
import json
import uuid
import time
from datetime import datetime
from urllib.parse import urlencode

import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from config import settings
from database.connection import SessionLocal
from database.models import CallLog, LanguageSetting, VoiceProfile
from security import supported_language_map
from services.openai_service import build_db_context, get_ai_response, retrieve_knowledge
from services.elevenlabs_service import tts_stream

router = APIRouter(tags=["Audio WebSocket"])
# Per-process concurrent-session cap keyed only by the peer socket address;
# forwarded headers are deliberately not trusted without a configured proxy chain.
_sessions_by_ip: dict[str, int] = {}
def _origin_allowed(origin: str | None, configured: str) -> bool:
    allowed = {item.strip().rstrip("/") for item in configured.split(",") if item.strip()}
    return bool(origin and origin.rstrip("/") in allowed)


LANGUAGE_NAMES = {"en": "English", "ta": "Tamil", "zh": "Mandarin", "ms": "Malay"}
LANGUAGE_GREETINGS = {
    "en": "Thank you. How may I help you today?",
    "ta": "நன்றி. இன்று நான் உங்களுக்கு எப்படி உதவலாம்?",
    "zh": "谢谢您。今天我能为您做些什么？",
    "ms": "Terima kasih. Bagaimana saya boleh membantu anda hari ini?",
}
LANGUAGE_ERROR_FALLBACKS = {
    "en": "I'm sorry, I couldn't process that just now. Please repeat your question or contact the clinic.",
    "ta": "மன்னிக்கவும், இப்போது உங்கள் கேள்வியைப் புரிந்துகொள்ள முடியவில்லை. தயவுசெய்து மீண்டும் கூறுங்கள் அல்லது கிளினிக்கைத் தொடர்புகொள்ளுங்கள்.",
    "zh": "抱歉，我现在无法处理您的问题。请重复您的问题或联系诊所。",
    "ms": "Maaf, saya tidak dapat memproses soalan anda sekarang. Sila ulangi atau hubungi klinik.",
}


def _deepgram_url(language: str, keywords: list[str] | None = None) -> str:
    params = {"encoding": "linear16", "sample_rate": "16000", "channels": "1",
              "interim_results": "true", "endpointing": "1200", "utterance_end_ms": "3000",
              "vad_events": "true", "language": language}
    # Use nova-2 for English and nova-3 for other languages
    if language.startswith("en"):
        params["model"] = "nova-2"
    else:
        params["model"] = "nova-3"
    qs = urlencode(params)
    if keywords:
        qs += "&" + "&".join(f"keywords={k}" for k in keywords)
    return "wss://api.deepgram.com/v1/listen?" + qs


async def _send(ws, payload):
    try:
        await ws.send_json(payload)
    except Exception:
        pass


async def _speak(ws, text: str, voice_id: str):
    await _send(ws, {"type": "tts_start"})
    try:
        async for chunk in tts_stream(text, voice_id):
            await _send(ws, {"type": "tts_chunk", "data": base64.b64encode(chunk).decode("ascii")})
        await _send(ws, {"type": "tts_end"})
    except Exception:
        await _send(ws, {"type": "error", "message": "Speech output is unavailable. You can still read the transcript or end the call."})


@router.websocket("/ws/audio")
async def audio_websocket(ws: WebSocket):
    origin = ws.headers.get("origin")
    if not _origin_allowed(origin, settings.ALLOWED_ORIGINS):
        await ws.accept()
        await _send(ws, {"type": "error", "message": "This browser origin is not allowed to start a call."})
        await ws.close(code=1008, reason="Origin not allowed")
        return

    await ws.accept()
    client_ip = ws.client.host if ws.client else "unknown"
    current_sessions = _sessions_by_ip.get(client_ip, 0)
    if current_sessions >= max(1, settings.MAX_CONCURRENT_SESSIONS_PER_IP):
        await _send(ws, {"type": "error", "message": "Too many active calls from this network. End another call or try again shortly."})
        await ws.close(code=1013, reason="Concurrent call limit")
        return
    _sessions_by_ip[client_ip] = current_sessions + 1
    session_released = False

    def release_session():
        nonlocal session_released
        if not session_released:
            remaining = _sessions_by_ip.get(client_ip, 1) - 1
            if remaining > 0:
                _sessions_by_ip[client_ip] = remaining
            else:
                _sessions_by_ip.pop(client_ip, None)
            session_released = True

    deadline = time.monotonic() + max(60, settings.MAX_CALL_DURATION_SECONDS)
    if not settings.DEEPGRAM_API_KEY or not settings.ELEVENLABS_API_KEY or not settings.OPENAI_API_KEY:
        await _send(ws, {"type": "error", "message": "A required speech, voice, or assistant provider is not configured. Please contact the clinic."})
        await ws.close(code=1011, reason="Required provider unavailable")
        release_session()
        return
    session_id = str(uuid.uuid4())
    stop_evt = asyncio.Event()
    reconnect_evt = asyncio.Event()
    ready_evt = asyncio.Event()
    ready_evt.set()  # initially ready
    audio_q = asyncio.Queue(maxsize=max(1, settings.MAX_AUDIO_QUEUE_FRAMES))
    transcript_q = asyncio.Queue(maxsize=max(1, settings.MAX_TRANSCRIPT_QUEUE_ITEMS))
    transcript_log = []
    history = []
    active_language = {"code": "en", "dg": "en-US"}
    phase = {"value": "language_select"}
    voice = {"id": None, "name": None}
    db = SessionLocal()
    try:
        enabled_rows = db.query(LanguageSetting).filter_by(enabled=True).all()
        dg_languages = supported_language_map()
        tts_languages = {x.strip().lower() for x in settings.TESTED_TTS_LANGUAGES.split(",") if x.strip()}
        if "en" not in dg_languages or "en" not in tts_languages:
            await _send(ws, {"type": "error", "message": "English recognition and speech output are required for spoken language selection, but are not marked tested."})
            await ws.close(code=1011, reason="Required language providers unavailable")
            release_session()
            return
        choices = {row.code: row for row in enabled_rows
                   if row.code in dg_languages and row.code in tts_languages}
        profile = db.query(VoiceProfile).filter_by(is_active=True).order_by(VoiceProfile.created_at.desc()).first()
        context = build_db_context(db)
        if not profile:
            await _send(ws, {"type": "error", "message": "SmileCare voice service is not configured. Please contact the clinic."})
            await ws.close(code=1011, reason="Voice service unavailable")
            release_session()
            return
        voice.update(id=profile.elevenlabs_voice_id, name=profile.name)
        context["target_language"] = "English"
    except Exception:
        release_session()
        raise
    finally:
        db.close()

    if not choices:
        await _send(ws, {"type": "error", "message": "No voice languages are enabled and verified. Please contact the clinic."})
        await ws.close(code=1011, reason="No enabled voice languages")
        release_session()
        return
    selectable = [LANGUAGE_NAMES.get(code, code) for code in choices]
    prompt = "Welcome to SmileCare. ... Please say your preferred language: ... " + ". ... ".join(selectable) + "."
    await _send(ws, {"type": "state", "state": "speaking"})
    try:
        await asyncio.wait_for(_speak(ws, prompt, voice["id"]), timeout=max(0.1, deadline - time.monotonic()))
    except asyncio.TimeoutError:
        await _send(ws, {"type": "error", "message": "This call reached its maximum duration. Please start a new call if you need more help."})
        await ws.close(code=1008, reason="Maximum call duration reached")
        release_session()
        return
    await _send(ws, {"type": "state", "state": "language_select"})

    async def deepgram_bridge():
        dg_retries = 0
        max_retries = 3
        while not stop_evt.is_set():
            # Wait until the greeting has finished before connecting
            try:
                await asyncio.wait_for(ready_evt.wait(), timeout=15)
            except asyncio.TimeoutError:
                continue
            if stop_evt.is_set():
                break
            # Boost recognition of language names during selection phase
            kw_boost = ["Tamil:2", "English:2", "Mandarin:2", "Malay:2", "Chinese:2"] if phase["value"] == "language_select" else None
            dg_url = _deepgram_url(active_language["dg"], keywords=kw_boost)
            try:
                async with websockets.connect(
                    dg_url,
                    extra_headers={"Authorization": f"Token {settings.DEEPGRAM_API_KEY}"},
                    open_timeout=10,
                    close_timeout=5,
                ) as dg:
                    dg_retries = 0
                    # Clear any previous error on successful connection
                    await _send(ws, {"type": "error_clear"})
                    print(f"[deepgram] Connected successfully for lang={active_language['dg']}")
                    async def send_audio():
                        while not stop_evt.is_set() and not reconnect_evt.is_set():
                            try:
                                chunk = await asyncio.wait_for(audio_q.get(), timeout=0.25)
                            except asyncio.TimeoutError:
                                continue
                            if chunk is None:
                                return
                            await dg.send(chunk)
                    async def receive_transcripts():
                        async for raw in dg:
                            if stop_evt.is_set() or reconnect_evt.is_set():
                                break
                            try:
                                msg = json.loads(raw)
                                if msg.get("type") != "Results":
                                    continue
                                alt = msg.get("channel", {}).get("alternatives", [{}])[0]
                                text = alt.get("transcript", "").strip()
                                if text:
                                    try:
                                        transcript_q.put_nowait({"text": text[:2000], "isFinal": bool(msg.get("is_final") or msg.get("speech_final"))})
                                    except asyncio.QueueFull:
                                        await _send(ws, {"type": "error", "message": "Transcript processing is overloaded. Please retry the call."})
                                        stop_evt.set()
                                        await ws.close(code=1013, reason="Transcript queue full")
                                        return
                            except (ValueError, IndexError, TypeError):
                                continue
                    send_task = asyncio.create_task(send_audio())
                    recv_task = asyncio.create_task(receive_transcripts())
                    done, pending = await asyncio.wait({send_task, recv_task}, return_when=asyncio.FIRST_COMPLETED)
                    for task in pending:
                        task.cancel()
                    await asyncio.gather(*pending, return_exceptions=True)
            except Exception as exc:
                dg_retries += 1
                print(f"[deepgram] Connection attempt {dg_retries}/{max_retries} failed for lang={active_language['dg']}: {type(exc).__name__}: {exc}")
                if dg_retries >= max_retries:
                    await _send(ws, {"type": "error", "message": "Speech recognition is unavailable. Please retry in English or end the call."})
                    dg_retries = 0
                await asyncio.sleep(min(2 ** dg_retries, 5))
            if reconnect_evt.is_set():
                reconnect_evt.clear()
                dg_retries = 0

    async def handle_transcripts():
        while not stop_evt.is_set():
            try:
                event = await asyncio.wait_for(transcript_q.get(), timeout=0.4)
            except asyncio.TimeoutError:
                continue
            text, final = event["text"], event["isFinal"]
            await _send(ws, {"type": "transcript", "text": text, "isFinal": final, "role": "user"})
            if not final:
                continue
            if len(transcript_log) >= max(1, settings.MAX_TRANSCRIPT_ENTRIES):
                await _send(ws, {"type": "error", "message": "This call reached its transcript limit. Please end the call and contact the clinic if you need more help."})
                stop_evt.set()
                await ws.close(code=1008, reason="Transcript limit reached")
                break
            transcript_log.append({"role": "user", "text": text[:2000], "ts": datetime.utcnow().isoformat()})
            if phase["value"] == "language_select":
                normalized = " ".join(text.lower().strip().split())
                print(f"[lang-select] Heard: '{normalized}' (raw: '{text}')")
                # Fuzzy language matching: exact match first, then substring/phonetic fallback
                _LANG_ALIASES = {
                    "en": ["english", "eng", "ingles"],
                    "ta": ["tamil", "tami", "tamul", "tumil", "tumul", "thamil"],
                    "zh": ["mandarin", "chinese", "mandrin", "mandarim"],
                    "ms": ["malay", "melayu", "malai", "maley"],
                }
                code = None
                # Pass 1: check if the transcript contains any known language keyword
                for lang_code, kws in _LANG_ALIASES.items():
                    for kw in kws:
                        if kw in normalized:
                            code = lang_code
                            break
                    if code:
                        break
                if not code or code not in choices:
                    names = ". ... ".join(selectable)
                    retry_text = f"Sorry, I didn't catch that. ... Please say your preferred language: ... {names}."
                    await _send(ws, {"type": "state", "state": "speaking"})
                    await _send(ws, {"type": "reply", "text": retry_text, "role": "assistant"})
                    await _speak(ws, retry_text, voice["id"])
                    await _send(ws, {"type": "state", "state": "language_select"})
                    continue
                active_language.update(code=code, dg=dg_languages[code])
                phase["value"] = "conversation"
                while not audio_q.empty():
                    try:
                        audio_q.get_nowait()
                    except asyncio.QueueEmpty:
                        break
                while not transcript_q.empty():
                    try:
                        transcript_q.get_nowait()
                    except asyncio.QueueEmpty:
                        break
                # Signal bridge to disconnect; block reconnection until greeting finishes
                ready_evt.clear()
                reconnect_evt.set()
                context["target_language"] = LANGUAGE_NAMES.get(code, code)
                await _send(ws, {"type": "language", "code": code, "name": LANGUAGE_NAMES.get(code, code)})
                await _send(ws, {"type": "state", "state": "speaking"})
                greeting = LANGUAGE_GREETINGS.get(code, LANGUAGE_GREETINGS["en"])
                await _send(ws, {"type": "reply", "text": greeting, "role": "assistant"})
                await _speak(ws, greeting, voice["id"])
                await _send(ws, {"type": "state", "state": "listening"})
                # Now allow the bridge to connect with the new language
                ready_evt.set()
                continue
            await _send(ws, {"type": "state", "state": "thinking"})
            session_db = SessionLocal()
            try:
                knowledge = retrieve_knowledge(session_db, text)
            finally:
                session_db.close()
            turn_context = {**context, "retrieved_knowledge": knowledge}
            try:
                result = await get_ai_response(text, history, turn_context)
                reply = result.get("reply", "") if isinstance(result, dict) else str(result)
            except Exception as exc:
                print(f"[openai] Request failed ({type(exc).__name__}): {exc}")
                reply = LANGUAGE_ERROR_FALLBACKS.get(active_language["code"], LANGUAGE_ERROR_FALLBACKS["en"])
                await _send(ws, {"type": "error", "message": "The assistant service is temporarily unavailable."})
            history.extend([{"role": "user", "content": text[:2000]}, {"role": "assistant", "content": reply[:2000]}])
            del history[:-10]
            if len(transcript_log) < max(1, settings.MAX_TRANSCRIPT_ENTRIES):
                transcript_log.append({"role": "assistant", "text": reply[:2000], "ts": datetime.utcnow().isoformat()})
            await _send(ws, {"type": "reply", "text": reply, "role": "assistant"})
            await _send(ws, {"type": "state", "state": "speaking"})
            await _speak(ws, reply, voice["id"])
            await _send(ws, {"type": "state", "state": "listening"})

    # Discard microphone frames collected while the initial spoken prompt played.
    while not audio_q.empty():
        try:
            audio_q.get_nowait()
        except asyncio.QueueEmpty:
            break
    tasks = [asyncio.create_task(deepgram_bridge()), asyncio.create_task(handle_transcripts())]
    try:
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                await _send(ws, {"type": "error", "message": "This call reached its maximum duration. Please start a new call if you need more help."})
                await ws.close(code=1008, reason="Maximum call duration reached")
                break
            try:
                data = await asyncio.wait_for(ws.receive(), timeout=remaining)
            except asyncio.TimeoutError:
                await _send(ws, {"type": "error", "message": "This call reached its maximum duration. Please start a new call if you need more help."})
                await ws.close(code=1008, reason="Maximum call duration reached")
                break
            if data.get("bytes"):
                if len(data["bytes"]) > max(1024, settings.MAX_AUDIO_FRAME_BYTES):
                    await _send(ws, {"type": "error", "message": "An audio frame exceeded the allowed size. Please retry the call."})
                    await ws.close(code=1009, reason="Audio frame too large")
                    break
                try:
                    audio_q.put_nowait(data["bytes"])
                except asyncio.QueueFull:
                    # Drop audio frames during brief reconnections instead of crashing
                    pass
            elif data.get("text"):
                try:
                    msg = json.loads(data["text"])
                except ValueError:
                    continue
                if msg.get("type") == "stop":
                    break
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        stop_evt.set()
        ready_evt.set()  # unblock bridge if it's waiting
        release_session()
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        call_db = SessionLocal()
        try:
            call_db.add(CallLog(session_id=session_id, voice_name=voice["name"], transcript=transcript_log,
                                started_at=datetime.utcnow(), ended_at=datetime.utcnow()))
            call_db.commit()
        except Exception as exc:
            call_db.rollback()
            print(f"[calllog] Save failed ({type(exc).__name__})")
        finally:
            call_db.close()

