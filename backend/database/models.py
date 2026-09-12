"""
database/models.py – SQLAlchemy ORM models for the dental clinic.
Tables: doctors, services, faqs, voice_profiles, call_logs
"""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, JSON
)
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class Doctor(Base):
    __tablename__ = "doctors"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    name            = Column(String(100), nullable=False)
    specialization  = Column(String(255), nullable=False)
    available_days  = Column(String(200), nullable=False)
    created_at      = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<Doctor {self.name}>"


class Service(Base):
    __tablename__ = "services"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    name        = Column(String(200), nullable=False)
    price_range = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<Service {self.name}>"


class FAQ(Base):
    __tablename__ = "faqs"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    question   = Column(Text, nullable=False)
    answer     = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<FAQ {self.id}>"


class VoiceProfile(Base):
    """Stores ElevenLabs voice IDs created via voice cloning."""
    __tablename__ = "voice_profiles"

    id                   = Column(Integer, primary_key=True, autoincrement=True)
    name                 = Column(String(100), nullable=False)
    elevenlabs_voice_id  = Column(String(200), nullable=False, unique=True)
    is_active            = Column(Boolean, default=True)
    created_at           = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<VoiceProfile {self.name}>"


class CallLog(Base):
    """Logs each browser conversation session with full transcript."""
    __tablename__ = "call_logs"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(100), nullable=False, unique=True)
    voice_name = Column(String(100), nullable=True)
    transcript = Column(JSON, default=list)     # list of {role, text, ts}
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at   = Column(DateTime, nullable=True)

    def __repr__(self):
        return f"<CallLog {self.session_id}>"
