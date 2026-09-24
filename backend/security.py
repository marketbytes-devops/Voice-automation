"""Minimal shared-key gate for prototype administrative APIs."""
import hmac

from fastapi import Header, HTTPException

from config import settings


def require_admin(x_admin_key: str | None = Header(default=None)) -> None:
    """Reject admin calls unless a configured key matches in constant time."""
    configured = settings.ADMIN_API_KEY
    if not configured:
        raise HTTPException(status_code=503, detail="Admin API is not configured")
    if not x_admin_key or not hmac.compare_digest(x_admin_key, configured):
        raise HTTPException(status_code=401, detail="Admin key required or invalid")


def supported_language_map() -> dict[str, str]:
    """Return operator-verified language code -> Deepgram language mappings.

    Configure as comma-separated pairs, e.g. en:en-US,ta:ta. This opt-in is
    an operator assertion that STT has been tested; it does not certify TTS.
    """
    result = {}
    for entry in (settings.DEEPGRAM_SUPPORTED_LANGUAGES or "en").split(","):
        code, separator, provider_language = entry.strip().partition(":")
        if not separator:
            code, provider_language = entry.strip(), "en-US" if entry.strip() == "en" else ""
        if code and provider_language:
            result[code.strip().lower()] = provider_language.strip()
    return result
