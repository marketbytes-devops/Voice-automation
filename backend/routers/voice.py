"""Protected voice-profile administration endpoints."""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import httpx

from database.connection import get_db
from database.models import VoiceProfile
from security import require_admin
from services.elevenlabs_service import clone_voice, delete_voice, tts_stream

router = APIRouter(prefix="/api", tags=["Voice"], dependencies=[Depends(require_admin)])
MAX_AUDIO_BYTES = 20 * 1024 * 1024
ALLOWED_AUDIO = {"audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a", "audio/ogg", "audio/webm", "video/webm"}


@router.post("/clone-voice")
async def clone_voice_endpoint(file: UploadFile = File(...), voice_name: str = Form(...), db: Session = Depends(get_db)):
    label = voice_name.strip()
    if not label or len(label) > 100:
        raise HTTPException(400, "Voice label must contain 1–100 characters")
    if file.content_type not in ALLOWED_AUDIO:
        raise HTTPException(415, "Unsupported audio type. Upload MP3, WAV, M4A, OGG, or WebM.")
    audio_bytes = await file.read(MAX_AUDIO_BYTES + 1)
    if not audio_bytes or len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "Audio sample must be between 1 byte and 20 MiB")
    try:
        result = await clone_voice(audio_bytes, file.filename or "sample.webm", label)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(502, f"Voice provider rejected the sample (HTTP {exc.response.status_code})") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Voice provider is unavailable") from exc
    profile = db.query(VoiceProfile).filter_by(elevenlabs_voice_id=result["voice_id"]).first()
    try:
        if profile:
            profile.name = label
        else:
            profile = VoiceProfile(name=label, elevenlabs_voice_id=result["voice_id"], is_active=False)
            db.add(profile)
        db.flush()
        db.query(VoiceProfile).update({VoiceProfile.is_active: False})
        profile.is_active = True
        db.commit()
        db.refresh(profile)
    except Exception:
        db.rollback()
        raise HTTPException(500, "Could not save voice profile")
    return {"success": True, "id": profile.id, "name": profile.name, "isActive": True}


@router.get("/voices")
def list_voices(db: Session = Depends(get_db)):
    return [{"id": p.id, "name": p.name, "isActive": p.is_active,
             "createdAt": p.created_at.isoformat()} for p in db.query(VoiceProfile).order_by(VoiceProfile.created_at.desc()).all()]


@router.put("/voices/{profile_id}/activate")
def activate_voice(profile_id: int, db: Session = Depends(get_db)):
    profile = db.query(VoiceProfile).filter_by(id=profile_id).first()
    if not profile:
        raise HTTPException(404, "Voice profile not found")
    try:
        db.query(VoiceProfile).update({VoiceProfile.is_active: False})
        profile.is_active = True
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(500, "Could not activate voice")
    return {"success": True, "id": profile.id, "name": profile.name, "isActive": True}


@router.get("/voices/{profile_id}/preview")
async def preview_voice(profile_id: int, db: Session = Depends(get_db)):
    profile = db.query(VoiceProfile).filter_by(id=profile_id).first()
    if not profile:
        raise HTTPException(404, "Voice not found")
    text = f"Hello, welcome to SmileCare. I am {profile.name}, and I am ready to help you today."
    return StreamingResponse(tts_stream(text, profile.elevenlabs_voice_id), media_type="audio/mpeg")


@router.get("/active-voice")
def get_active_voice(db: Session = Depends(get_db)):
    profile = db.query(VoiceProfile).filter_by(is_active=True).order_by(VoiceProfile.created_at.desc()).first()
    return {"name": profile.name if profile else None, "available": bool(profile)}


@router.delete("/voices/{profile_id}")
async def remove_voice(profile_id: int, db: Session = Depends(get_db)):
    profile = db.query(VoiceProfile).filter_by(id=profile_id).first()
    if not profile:
        raise HTTPException(404, "Voice profile not found")
    if profile.is_active:
        raise HTTPException(409, "Activate another voice before deleting the active voice")
    try:
        await delete_voice(profile.elevenlabs_voice_id)
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Voice provider could not delete the profile") from exc
    db.delete(profile)
    db.commit()
    return {"success": True, "message": f"Voice '{profile.name}' deleted."}
