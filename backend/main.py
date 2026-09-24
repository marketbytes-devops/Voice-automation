"""
main.py – FastAPI application entry point.

Start with:
    cd backend
    uvicorn main:app --reload --port 8000
"""
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from config import settings
from database.connection import engine
from database.models import Base
from database.seed import seed_db
from routers import audio_ws, voice, admin_data

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="SmileCare AI Receptionist",
    description="Voice-cloned AI receptionist for dental clinic",
    version="1.0.0",
)

# ── CORS: use the same explicit origin allowlist as the public WebSocket ──────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Admin-Key"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(voice.router)
app.include_router(audio_ws.router)
app.include_router(admin_data.router)
app.include_router(admin_data.public_router)




# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "service": "SmileCare AI Receptionist"}


# ── Startup event ─────────────────────────────────────────────────────────────
@app.on_event("startup")
def startup():
    print("[startup] Creating database tables…")
    Base.metadata.create_all(bind=engine)
    print("[startup] Seeding clinic data…")
    seed_db()
    from database.models import LanguageSetting
    from database.connection import SessionLocal
    db = SessionLocal()
    try:
        for code, name, provider in [("en", "English", "en-US"), ("ta", "Tamil", "ta"), ("zh", "Mandarin", "zh-CN"), ("ms", "Malay", "ms-MY")]:
            if not db.query(LanguageSetting).filter_by(code=code).first():
                db.add(LanguageSetting(code=code, name=name, deepgram_language=provider, enabled=(code == "en")))
        db.commit()
    finally:
        db.close()
    print("[startup] Ready. Visit http://localhost:8000")


# ── Dev entry point ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=True,
    )
