"""
services/elevenlabs_service.py – ElevenLabs API wrapper.

Two operations:
  1. clone_voice()       – POST /v1/voices/add  (Instant Voice Cloning)
  2. tts_stream()        – POST /v1/text-to-speech/{voice_id}/stream
                           Returns an async generator of MP3 byte chunks.
"""
import httpx
from config import settings

_BASE = "https://api.elevenlabs.io/v1"
_HEADERS = {"xi-api-key": settings.ELEVENLABS_API_KEY}


async def clone_voice(audio_bytes: bytes, filename: str, voice_name: str) -> dict:
    """
    Uploads an audio sample to ElevenLabs Instant Voice Cloning.
    If the account is on a free tier (missing voices_write permission),
    it mocks the cloning process by returning a pre-made voice ID.
    Returns: { "voice_id": "...", "name": "..." }
    """
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{_BASE}/voices/add",
            headers=_HEADERS,
            files={"files": (filename, audio_bytes, "audio/mpeg")},
            data={"name": voice_name},
        )
        
        # Automatic fallback for free-tier users
        if resp.status_code == 401:
            try:
                err_data = resp.json()
                msg = err_data.get("detail", {}).get("message", "")
                if "voices_write" in msg:
                    print(f"[ElevenLabs] Free tier detected. Mocking clone for '{voice_name}' with Rachel's voice.")
                    return {"voice_id": "21m00Tcm4TlvDq8ikWAM", "name": f"{voice_name} (Free Fallback)"}
            except Exception:
                pass
                
        resp.raise_for_status()
        data = resp.json()
        return {"voice_id": data["voice_id"], "name": voice_name}



async def tts_stream(text: str, voice_id: str):
    """
    Async generator that yields raw MP3 byte chunks from ElevenLabs TTS.
    Uses eleven_turbo_v2 for lowest latency.

    Usage:
        async for chunk in tts_stream(text, voice_id):
            # send chunk to browser
    """
    payload = {
        "text": text,
        "model_id": "eleven_turbo_v2",
        "voice_settings": {
            "stability": 0.50,
            "similarity_boost": 0.80,
            "style": 0.00,
            "use_speaker_boost": True,
        },
    }

    async with httpx.AsyncClient(timeout=30) as client:
        async with client.stream(
            "POST",
            f"{_BASE}/text-to-speech/{voice_id}/stream",
            headers={**_HEADERS, "Content-Type": "application/json"},
            json=payload,
        ) as resp:
            resp.raise_for_status()
            async for chunk in resp.aiter_bytes(chunk_size=4096):
                if chunk:
                    yield chunk


async def list_voices() -> list:
    """Returns all voices in the ElevenLabs account."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{_BASE}/voices", headers=_HEADERS)
        resp.raise_for_status()
        return resp.json().get("voices", [])


async def delete_voice(voice_id: str) -> bool:
    """Deletes a cloned voice from ElevenLabs."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.delete(f"{_BASE}/voices/{voice_id}", headers=_HEADERS)
        return resp.status_code == 200
