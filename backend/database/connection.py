"""
database/connection.py – SQLAlchemy engine and session factory.
Uses pymysql (sync) driver since FastAPI sync endpoints are fine for DB.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,   # auto-reconnect on stale connections
    pool_recycle=300,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """FastAPI dependency – yields a DB session and closes it after use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
