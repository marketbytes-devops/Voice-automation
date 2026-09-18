"""
routers/audio_ws.py – The heart of the voice receptionist.

WebSocket endpoint: /ws/audio
─────────────────────────────────────────────────────────────────────────────
FLOW:
  Browser ──[binary PCM]──► Backend ──► Deepgram (real-time STT)
                                              │
                                       Transcript events
                                              │
                                    if FINAL + state==LISTENING
                                              │
                                         OpenAI LLM
                                              │
                                          AI reply
                                              │
                                      ElevenLabs TTS
                                              │
                                    MP3 chunks (base64)
                                              │
  Browser ◄──[JSON tts_chunk]──────────── Backend

STATE MACHINE:
  idle → listening → thinking → speaking → listening (loop)
  speaking → listening  (barge-in: user speaks while AI is talking)

MESSAGES (browser → backend):
  { type: "config",   voiceId: "..." }   – sent after voice clone
  { type: "barge_in" }                   – user spoke during AI speech
  { type: "stop" }                       – end session
  <binary>                               – raw PCM audio frames

MESSAGES (backend → browser):
  { type: "state",      state: "listening|thinking|speaking" }
  { type: "transcript", text: "...", isFinal: bool, role: "user" }
  { type: "reply",      text: "...", role: "assistant" }
  { type: "tts_start" }
  { type: "tts_chunk",  data: "<base64 mp3>" }
  { type: "tts_end" }
  { type: "tts_cancelled" }
  { type: "error",      message: "..." }
"""
import asyncio
import base64
import json
import uuid
from datetime import datetime

import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from config import settings
from database.connection import SessionLocal
from database.models import CallLog
from services.openai_service import build_db_context, get_ai_response
from services.elevenlabs_service import tts_stream

router = APIRouter(tags=["Audio WebSocket"])

# Deepgram streaming URL for linear16 PCM at 16 kHz
_DG_URL = (
    "wss://api.deepgram.com/v1/listen"
    "?encoding=linear16"
    "&sample_rate=16000"
    "&channels=1"
    "&interim_results=true"
    "&endpointing=1200"
    "&utterance_end_ms=3000"
    "&vad_events=true"
    "&language=en-US"
    "&model=nova-2"
)


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

async def _safe_send(ws: WebSocket, payload: dict):
    """Send JSON without raising if the socket is already closed."""
    try:
        await ws.send_json(payload)
    except Exception:
        pass


async def _stream_tts(
    ws: WebSocket,
    text: str,
    voice_id: str | None,
    barge_in: asyncio.Event,
):
    """
    Streams ElevenLabs TTS back to the browser as base64-encoded MP3 chunks.
    Stops early if barge_in is set.
    """
    if not voice_id:
        await _safe_send(ws, {"type": "error", "message": "No voice configured."})
        return

    try:
        await _safe_send(ws, {"type": "tts_start"})
        async for chunk in tts_stream(text, voice_id):
            if barge_in.is_set():
                break
            encoded = base64.b64encode(chunk).decode("utf-8")
            await _safe_send(ws, {"type": "tts_chunk", "data": encoded})

        if barge_in.is_set():
            await _safe_send(ws, {"type": "tts_cancelled"})
        else:
            await _safe_send(ws, {"type": "tts_end"})

    except asyncio.CancelledError:
        await _safe_send(ws, {"type": "tts_cancelled"})
        raise


# ──────────────────────────────────────────────────────────────────────────────
# WebSocket Handler
# ──────────────────────────────────────────────────────────────────────────────

@router.websocket("/ws/audio")
async def audio_websocket(ws: WebSocket, lang: str = "en-US"):
    await ws.accept()
    
    # Dynamically build Deepgram URL based on selected language
    # Deepgram streaming currently does not support Tamil or Bahasa Malaysia.
    # To prevent WebSocket 400 crashes, we force Deepgram to transcribe phonetically in English.
    # We will pass the selected language to the AI so it knows what language to reply in.
    
    dg_url = (
        "wss://api.deepgram.com/v1/listen"
        "?encoding=linear16"
        "&sample_rate=16000"
        "&channels=1"
        "&interim_results=true"
        "&endpointing=4000"
        "&utterance_end_ms=5000"
        "&vad_events=true"
        "&language=en-US"
        "&model=nova-2"
        "&keywords=Akshay:3"
        "&keywords=SmileCare:3"
    )

    # ── Session state ──────────────────────────────────────────────────────────
    session_id          = str(uuid.uuid4())
    voice_id: str | None = None
    state               = "idle"         # idle | listening | thinking | speaking
    conversation_history: list           = []
    transcript_log: list                 = []   # for DB call log

    # ── Async primitives ───────────────────────────────────────────────────────
    audio_q      = asyncio.Queue(maxsize=200)   # PCM chunks → Deepgram
    transcript_q = asyncio.Queue()              # Deepgram events → conversation handler
    stop_evt     = asyncio.Event()
    barge_in_evt = asyncio.Event()

    # ── Load clinic data once (sync DB call) ───────────────────────────────────
    db = SessionLocal()
    try:
        db_context = build_db_context(db)
        db_context["target_language"] = lang
    finally:
        db.close()

    # ══════════════════════════════════════════════════════════════════════════
    # Task 1: Deepgram bridge
    #   - Reads PCM from audio_q, forwards to Deepgram WS
    #   - Receives transcript events, puts them on transcript_q
    # ══════════════════════════════════════════════════════════════════════════
    async def deepgram_bridge():
        headers = {"Authorization": f"Token {settings.DEEPGRAM_API_KEY}"}
        try:
            async with websockets.connect(dg_url, extra_headers=headers) as dg:

                async def _send():
                    while not stop_evt.is_set():
                        try:
                            chunk = await asyncio.wait_for(audio_q.get(), timeout=0.5)
                        except asyncio.TimeoutError:
                            continue
                        if chunk is None:
                            break
                        try:
                            await dg.send(chunk)
                        except Exception:
                            break

                async def _recv():
                    try:
                        async for raw in dg:
                            if stop_evt.is_set():
                                break
                            try:
                                msg  = json.loads(raw)
                                if msg.get("type") != "Results":
                                    continue
                                alt  = msg.get("channel", {}).get("alternatives", [{}])[0]
                                text = alt.get("transcript", "").strip()
                                if not text:
                                    continue
                                is_final = msg.get("is_final", False) or msg.get("speech_final", False)
                                await transcript_q.put({"text": text, "isFinal": is_final})
                            except Exception:
                                pass
                    except Exception:
                        pass

                await asyncio.gather(_send(), _recv())
        except Exception as e:
            print(f"[deepgram] Connection error: {e}")

    # ══════════════════════════════════════════════════════════════════════════
    # Task 2: Conversation handler
    #   - Consumes transcript events
    #   - On final transcript (while LISTENING): calls OpenAI → ElevenLabs
    #   - On any transcript (while SPEAKING): triggers barge-in
    # ══════════════════════════════════════════════════════════════════════════
    async def conversation_handler():
        nonlocal state, voice_id

        current_tts: asyncio.Task | None = None

        while not stop_evt.is_set():
            # ── Wait for next transcript event ─────────────────────────────────
            try:
                event = await asyncio.wait_for(transcript_q.get(), timeout=0.3)
            except asyncio.TimeoutError:
                continue

            text     = event["text"]
            is_final = event["isFinal"]

            # Forward transcript to browser (both interim and final)
            await _safe_send(ws, {
                "type":    "transcript",
                "text":    text,
                "isFinal": is_final,
                "role":    "user",
            })

            # ── Barge-in: user spoke while AI was speaking ─────────────────────
            if state == "speaking" and text:
                barge_in_evt.set()
                if current_tts and not current_tts.done():
                    current_tts.cancel()
                    try:
                        await current_tts
                    except (asyncio.CancelledError, Exception):
                        pass
                state = "listening"
                await _safe_send(ws, {"type": "state", "state": "listening"})
                continue

            # ── Process final transcript (only when LISTENING) ─────────────────
            if not (is_final and state == "listening" and text):
                continue

            # Save to transcript log
            transcript_log.append({"role": "user", "text": text, "ts": datetime.utcnow().isoformat()})

            # Transition: listening → thinking
            state = "thinking"
            await _safe_send(ws, {"type": "state", "state": "thinking"})

            try:
                res_data = await get_ai_response(text, conversation_history, db_context)
                if isinstance(res_data, dict):
                    reply = res_data.get("reply", "")
                    wa_msg = res_data.get("whatsapp_message")
                else:
                    reply = res_data
                    wa_msg = None
            except Exception as e:
                print(f"[openai] Error: {e}")
                await _safe_send(ws, {"type": "error", "message": "Sorry, I had trouble processing that."})
                state = "listening"
                await _safe_send(ws, {"type": "state", "state": "listening"})
                continue

            # Update conversation history
            conversation_history.append({"role": "user",      "content": text})
            conversation_history.append({"role": "assistant", "content": reply})
            transcript_log.append({"role": "assistant", "text": reply, "ts": datetime.utcnow().isoformat()})

            # Send reply text to browser (for transcript display)
            await _safe_send(ws, {"type": "reply", "text": reply, "role": "assistant"})
            
            # Send mock WhatsApp message if generated
            if wa_msg:
                await _safe_send(ws, {"type": "whatsapp", "message": wa_msg})

            # Transition: thinking → speaking
            state = "speaking"
            await _safe_send(ws, {"type": "state", "state": "speaking"})
            barge_in_evt.clear()

            # Stream TTS
            current_tts = asyncio.create_task(
                _stream_tts(ws, reply, voice_id, barge_in_evt)
            )
            try:
                await current_tts
            except (asyncio.CancelledError, Exception):
                pass

            # Transition back: speaking → listening (unless barge-in redirected us)
            if not barge_in_evt.is_set():
                state = "listening"
                await _safe_send(ws, {"type": "state", "state": "listening"})

    # ── Spawn background tasks ─────────────────────────────────────────────────
    tasks = [
        asyncio.create_task(deepgram_bridge(),      name="deepgram"),
        asyncio.create_task(conversation_handler(), name="conversation"),
    ]

    # ══════════════════════════════════════════════════════════════════════════
    # Main receive loop – reads messages from the browser
    # ══════════════════════════════════════════════════════════════════════════
    try:
        while True:
            try:
                data = await ws.receive()
            except (WebSocketDisconnect, RuntimeError):
                break

            # Binary = raw PCM audio from mic
            if "bytes" in data and data["bytes"]:
                try:
                    audio_q.put_nowait(data["bytes"])
                except asyncio.QueueFull:
                    pass   # drop frame – backpressure protection

            # Text = control messages
            elif "text" in data and data["text"]:
                try:
                    msg = json.loads(data["text"])
                except json.JSONDecodeError:
                    continue

                mtype = msg.get("type")

                if mtype == "config":
                    # Browser sends this after voice clone succeeds
                    voice_id = msg.get("voiceId")
                    state    = "listening"
                    await _safe_send(ws, {"type": "state", "state": "listening"})

                elif mtype == "barge_in":
                    # VAD detected speech during AI playback
                    barge_in_evt.set()
                    state = "listening"
                    await _safe_send(ws, {"type": "state", "state": "listening"})

                elif mtype == "stop":
                    break

    finally:
        # ── Cleanup ────────────────────────────────────────────────────────────
        stop_evt.set()
        try:
            audio_q.put_nowait(None)   # signal Deepgram sender to exit
        except asyncio.QueueFull:
            pass

        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

        # Save call log to DB
        db = SessionLocal()
        try:
            log = CallLog(
                session_id = session_id,
                voice_name = voice_id or "none",
                transcript = transcript_log,
                started_at = datetime.utcnow(),
                ended_at   = datetime.utcnow(),
            )
            db.add(log)
            db.commit()
        except Exception as e:
            print(f"[calllog] Failed to save: {e}")
        finally:
            db.close()

        print(f"[ws] Session {session_id} ended. Turns: {len(transcript_log)}")
