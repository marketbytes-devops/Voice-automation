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
from routers import audio_ws, voice

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="SmileCare AI Receptionist",
    description="Voice-cloned AI receptionist for dental clinic",
    version="1.0.0",
)

# ── CORS (allow browser to call from any origin during dev) ───────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(voice.router)
app.include_router(audio_ws.router)




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
    print("[startup] Ready. Visit http://localhost:8000")


# ── Dev entry point ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=True,
    )
