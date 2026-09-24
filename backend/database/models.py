"""
database/models.py – SQLAlchemy ORM models for the dental clinic.
Tables: doctors, services, faqs, voice_profiles, call_logs
"""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, JSON, LargeBinary
)
from sqlalchemy.dialects.mysql import MEDIUMBLOB
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


class Appointment(Base):
    __tablename__ = "appointments"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    name       = Column(String(100), nullable=False)
    phone      = Column(String(50), nullable=False)
    date       = Column(String(50), nullable=False)
    time       = Column(String(50), nullable=False)
    status     = Column(String(50), default="Pending staff confirmation", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<Appointment {self.name} on {self.date} at {self.time}>"


class LanguageSetting(Base):
    """Configured language options; provider support is evaluated separately."""
    __tablename__ = "language_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(12), nullable=False, unique=True)
    name = Column(String(40), nullable=False)
    deepgram_language = Column(String(40), nullable=False)
    enabled = Column(Boolean, nullable=False, default=False)


class KnowledgeDocument(Base):
    """Small prototype knowledge store. Original bytes are retained in DB."""
    __tablename__ = "knowledge_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    filename = Column(String(255), nullable=False)
    content_type = Column(String(100), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    extracted_text = Column(Text, nullable=False)
    original_bytes = Column(LargeBinary().with_variant(MEDIUMBLOB(), "mysql"), nullable=False)
    status = Column(String(20), nullable=False, default="ready")
    error = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
