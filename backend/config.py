"""
config.py – Loads all environment variables from .env
All other modules import `settings` from here.
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Provider keys are optional at startup; dependent operations return a clear outage.
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    OPENAI_MODEL: str = "gpt-4o-mini"

    # ElevenLabs
    ELEVENLABS_API_KEY: str = ""

    # Deepgram
    DEEPGRAM_API_KEY: str = ""

    # Required database connection, supplied by the runtime environment.
    DATABASE_URL: str

    # Public browser endpoints: explicit origins only (scheme + host + optional port).
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3010,http://127.0.0.1:3010"
    MAX_CALL_DURATION_SECONDS: int = 900
    MAX_CONCURRENT_SESSIONS_PER_IP: int = 2
    MAX_AUDIO_FRAME_BYTES: int = 65536
    MAX_AUDIO_QUEUE_FRAMES: int = 50
    MAX_TRANSCRIPT_QUEUE_ITEMS: int = 100
    MAX_TRANSCRIPT_ENTRIES: int = 500

    # Server and prototype capability flags.
    PORT: int = 8000
    ADMIN_API_KEY: str = ""
    # Operator-tested Deepgram mappings; default is English only.
    DEEPGRAM_SUPPORTED_LANGUAGES: str = "en"
    # Operator-tested voice output codes; not automatically certified.
    TESTED_TTS_LANGUAGES: str = "en"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
