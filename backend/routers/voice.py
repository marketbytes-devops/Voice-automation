"""
routers/voice.py – Voice cloning endpoints.

POST /api/clone-voice   → Upload audio, clone voice via ElevenLabs, save to DB
GET  /api/voices        → List all cloned voices stored in DB
DELETE /api/voices/{id} → Remove a voice profile from DB and ElevenLabs
"""
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from sqlalchemy.orm import Session

from database.connection import get_db
from database.models import VoiceProfile
from services.elevenlabs_service import clone_voice, delete_voice
import httpx

router = APIRouter(prefix="/api", tags=["Voice"])


@router.post("/clone-voice")
async def clone_voice_endpoint(
    file: UploadFile = File(..., description="Audio sample (mp3/wav/m4a, 10–60s)"),
    voice_name: str = Form("Receptionist Voice"),
    db: Session = Depends(get_db),
):
    """
    Uploads the audio sample to ElevenLabs Instant Voice Cloning.
    Stores the returned voice_id in MySQL so we can reference it later.
    """
    # Validate file type
    allowed = {"audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4",
               "audio/x-m4a", "audio/ogg", "video/webm", "audio/webm"}
    if file.content_type not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Use mp3, wav, or m4a.",
        )

    audio_bytes = await file.read()

    try:
        result = await clone_voice(
            audio_bytes=audio_bytes,
            filename=file.filename or "sample.mp3",
            voice_name=voice_name,
        )
    except httpx.HTTPStatusError as e:
        detail = e.response.text
        if e.response.status_code == 422:
            raise HTTPException(
                status_code=422,
                detail="Voice cloning failed. ElevenLabs requires a Starter plan or above for Instant Voice Cloning.",
            )
        raise HTTPException(status_code=502, detail=f"ElevenLabs error: {detail}")

    # Check if voice already exists (happens during free-tier fallback reuse)
    profile = db.query(VoiceProfile).filter(VoiceProfile.elevenlabs_voice_id == result["voice_id"]).first()
    if profile:
        profile.name = voice_name
        db.commit()
        db.refresh(profile)
    else:
        # Save new to DB
        profile = VoiceProfile(
            name=voice_name,
            elevenlabs_voice_id=result["voice_id"],
            is_active=True,
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)

    return {
        "success": True,
        "id": profile.id,
        "voiceId": profile.elevenlabs_voice_id,
        "name": profile.name,
        "message": "Voice cloned successfully ✓",
    }


@router.get("/voices")
def list_voices(db: Session = Depends(get_db)):
    """Returns all voice profiles stored in the database."""
    profiles = db.query(VoiceProfile).order_by(VoiceProfile.created_at.desc()).all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "voiceId": p.elevenlabs_voice_id,
            "isActive": p.is_active,
            "createdAt": p.created_at.isoformat(),
        }
        for p in profiles
    ]


@router.delete("/voices/{profile_id}")
async def remove_voice(profile_id: int, db: Session = Depends(get_db)):
    """Deletes a voice profile from the DB and from ElevenLabs."""
    profile = db.query(VoiceProfile).filter(VoiceProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Voice profile not found.")

    await delete_voice(profile.elevenlabs_voice_id)
    db.delete(profile)
    db.commit()
    return {"success": True, "message": f"Voice '{profile.name}' deleted."}
