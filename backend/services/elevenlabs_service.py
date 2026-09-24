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
    """Upload an audio sample to ElevenLabs Instant Voice Cloning."""
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{_BASE}/voices/add",
            headers=_HEADERS,
            files={"files": (filename, audio_bytes, "application/octet-stream")},
            data={"name": voice_name},
        )
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
        "model_id": "eleven_multilingual_v2",
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
            f"{_BASE}/text-to-speech/{voice_id}/stream?output_format=mp3_44100_128",
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
    """Deletes a cloned voice from ElevenLabs; preserve local profile on failure."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.delete(f"{_BASE}/voices/{voice_id}", headers=_HEADERS)
        if resp.status_code not in {200, 204}:
            resp.raise_for_status()
            raise httpx.HTTPStatusError("Voice deletion was not confirmed", request=resp.request, response=resp)
        return True
