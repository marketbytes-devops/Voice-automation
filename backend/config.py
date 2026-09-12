"""
config.py – Loads all environment variables from .env
All other modules import `settings` from here.
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # OpenAI
    OPENAI_API_KEY: str
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    OPENAI_MODEL: str = "gpt-4o-mini"

    # ElevenLabs
    ELEVENLABS_API_KEY: str

    # Deepgram
    DEEPGRAM_API_KEY: str

    # MySQL
    DATABASE_URL: str = "mysql+pymysql://root:password@localhost:3306/dental_ai"

    # Server
    PORT: int = 8000

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
