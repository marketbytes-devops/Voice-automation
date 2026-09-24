"""Unit tests for configuration gates and safe document extraction/retrieval."""
import os
import sys
from types import SimpleNamespace

os.environ.setdefault("OPENAI_API_KEY", "")
os.environ.setdefault("ELEVENLABS_API_KEY", "")
os.environ.setdefault("DEEPGRAM_API_KEY", "")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from config import settings
from security import require_admin, supported_language_map
from routers.audio_ws import _origin_allowed
from services.openai_service import _validate_appointment_args, execute_tool_call
from database.connection import get_db
from database.models import Base, LanguageSetting
from routers.admin_data import _extract, router as admin_data_router
from routers.voice import router as voice_router
from services.openai_service import retrieve_knowledge


def test_admin_key_fails_closed_when_unconfigured(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_API_KEY", "")
    with pytest.raises(HTTPException) as error:
        require_admin("anything")
    assert error.value.status_code == 503


def test_admin_key_requires_match(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_API_KEY", "non-secret-test-key")
    with pytest.raises(HTTPException) as error:
        require_admin("wrong")
    assert error.value.status_code == 401
    assert require_admin("non-secret-test-key") is None


def test_supported_languages_default_mapping(monkeypatch):
    monkeypatch.setattr(settings, "DEEPGRAM_SUPPORTED_LANGUAGES", "en:en-US,ta:ta")
    assert supported_language_map() == {"en": "en-US", "ta": "ta"}


def test_text_extract_accepts_utf8_and_rejects_binary():
    assert _extract("clinic.md", "text/markdown", "Hours are weekdays".encode()) == "Hours are weekdays"
    with pytest.raises(HTTPException) as error:
        _extract("clinic.txt", "text/plain", bytes([0xff]))
    assert error.value.status_code == 400


def test_unsupported_document_format_is_rejected():
    with pytest.raises(HTTPException) as error:
        _extract("scan.png", "image/png", b"not text")
    assert error.value.status_code == 415


def test_lexical_retrieval_returns_only_matching_excerpts():
    doc_a = SimpleNamespace(filename="hours.txt", extracted_text="Clinic opens at nine on weekdays.\nClosed Sundays.", status="ready")
    doc_b = SimpleNamespace(filename="fees.txt", extracted_text="Cleaning price starts at 1000 INR.", status="ready")

    class Query:
        def filter(self, *_args):
            return self
        def all(self):
            return [doc_a, doc_b]

    class FakeDB:
        def query(self, _model):
            return Query()

    result = retrieve_knowledge(FakeDB(), "clinic weekdays hours")
    assert "hours.txt" in result
    assert "fees.txt" not in result


def test_admin_routes_require_key_and_allow_authorized_request(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_API_KEY", "test-only-key")
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    with TestingSession() as session:
        session.add(LanguageSetting(code="en", name="English", deepgram_language="en-US", enabled=True))
        session.commit()

    def override_db():
        session = TestingSession()
        try:
            yield session
        finally:
            session.close()

    app = FastAPI()
    app.include_router(voice_router)
    app.include_router(admin_data_router)
    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as client:
        assert client.get("/api/voices").status_code == 401
        assert client.get("/api/admin/languages").status_code == 401
        response = client.get("/api/voices", headers={"X-Admin-Key": "test-only-key"})
        assert response.status_code == 200 and response.json() == []
        languages = client.get("/api/admin/languages", headers={"X-Admin-Key": "test-only-key"})
        assert languages.status_code == 200
        assert languages.json()["languages"][0]["code"] == "en"
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def test_websocket_origin_allowlist_is_exact_and_supports_local_origins():
    configured = "http://localhost:5173,http://127.0.0.1:3010,https://voice.example.test"
    assert _origin_allowed("http://localhost:5173", configured)
    assert _origin_allowed("http://localhost:5173/", configured)
    assert not _origin_allowed("https://localhost:5173", configured)
    assert not _origin_allowed("http://localhost.evil.test:5173", configured)
    assert not _origin_allowed(None, configured)


def test_appointment_fields_are_minimally_validated():
    from datetime import date, timedelta

    future_date = (date.today() + timedelta(days=1)).isoformat()
    valid, error = _validate_appointment_args({
        "name": "  Sample Patient ", "phone": "+1 (555) 123-4567",
        "date": future_date, "time": "10:30 AM",
    })
    assert error is None
    assert valid == {"name": "Sample Patient", "phone": "+1 (555) 123-4567", "date": future_date, "time": "10:30 AM"}
    for invalid in (
        {"name": "", "phone": "1234567", "date": future_date, "time": "10:30"},
        {"name": "Valid", "phone": "123", "date": future_date, "time": "10:30"},
        {"name": "Valid", "phone": "1234567", "date": "tomorrow", "time": "10:30"},
        {"name": "Valid", "phone": "1234567", "date": future_date, "time": "soon"},
    ):
        assert _validate_appointment_args(invalid)[1]


def test_appointment_request_persists_pending_and_never_confirms(monkeypatch):
    import asyncio
    import json
    from datetime import date, timedelta

    from services import openai_service

    captured = {}

    class FakeDB:
        def add(self, appointment):
            captured["appointment"] = appointment
        def commit(self):
            captured["committed"] = True
        def rollback(self):
            captured["rolled_back"] = True
        def close(self):
            captured["closed"] = True

    monkeypatch.setattr(openai_service, "SessionLocal", FakeDB)
    future_date = (date.today() + timedelta(days=1)).isoformat()
    tool_call = SimpleNamespace(function=SimpleNamespace(
        name="book_appointment",
        arguments=json.dumps({"name": "Sample Patient", "phone": "1234567890", "date": future_date, "time": "10:30"}),
    ))
    result = json.loads(asyncio.run(execute_tool_call(tool_call)))
    assert result["status"] == "pending_staff_confirmation"
    assert "not confirmed" in result["message"]
    assert captured["appointment"].status == "Pending staff confirmation"
    assert captured["committed"] and captured["closed"]


def test_availability_tool_does_not_claim_a_slot(monkeypatch):
    import asyncio
    import json

    tool_call = SimpleNamespace(function=SimpleNamespace(
        name="check_availability", arguments='{"date":"2030-01-01","time":"10:00"}',
    ))
    result = json.loads(asyncio.run(execute_tool_call(tool_call)))
    assert result["status"] == "pending_staff_confirmation"
    assert "cannot be verified" in result["message"]
