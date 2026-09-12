"""
services/openai_service.py – Builds the clinic knowledge-base system prompt
and calls OpenAI chat completion.

The LLM is strictly instructed to answer ONLY from the clinic data.
"""
from openai import AsyncOpenAI
from config import settings

_client = AsyncOpenAI(
    api_key=settings.OPENAI_API_KEY,
    base_url=settings.OPENAI_BASE_URL
)

# ──────────────────────────────────────────────────────────────────────────────
# Clinic meta-data (mirrors the DB seed so the prompt is always accurate)
# ──────────────────────────────────────────────────────────────────────────────
CLINIC_META = {
    "name":    "SmileCare Dental Clinic",
    "address": "42, MG Road, Bengaluru – 560001",
    "phone":   "+91 98765 43210",
    "hours":   "Monday to Saturday, 9:00 AM – 6:00 PM. Closed on Sundays and public holidays.",
}


def build_db_context(db) -> dict:
    """
    Reads doctors, services, and FAQs from MySQL and returns a dict
    used to format the system prompt.
    """
    from database.models import Doctor, Service, FAQ

    doctors  = db.query(Doctor).all()
    services = db.query(Service).all()
    faqs     = db.query(FAQ).all()

    doctor_text = "\n".join(
        f"  • {d.name} – {d.specialization} (available: {d.available_days})"
        for d in doctors
    )
    service_text = "\n".join(
        f"  • {s.name}: {s.price_range}" for s in services
    )
    faq_text = "\n".join(
        f"  Q: {f.question}\n  A: {f.answer}" for f in faqs
    )

    return {
        **CLINIC_META,
        "doctors":  doctor_text  or "No doctors on record.",
        "services": service_text or "No services on record.",
        "faqs":     faq_text     or "No FAQs on record.",
    }


# ──────────────────────────────────────────────────────────────────────────────
# System prompt template
# ──────────────────────────────────────────────────────────────────────────────
_SYSTEM_PROMPT = """
You are the friendly AI voice receptionist for {name}, a dental clinic.

CLINIC DETAILS:
- Name    : {name}
- Address : {address}
- Phone   : {phone}
- Hours   : {hours}

DOCTORS:
{doctors}

SERVICES & PRICING (INR):
{services}

FREQUENTLY ASKED QUESTIONS:
{faqs}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT RULES — follow these always:
1. Answer ONLY from the information above. Never invent prices, names, or policies.
2. Keep every response to 1–2 sentences. It will be spoken aloud over the phone.
3. Be warm, polite, and professional.
4. If the patient asks something you don't have an answer for, say exactly:
   "I don't have that information right now — I'll have someone from our team call you back."
5. Never reveal that you are an AI unless the patient directly asks.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""".strip()


async def get_ai_response(
    user_message: str,
    conversation_history: list,
    db_context: dict,
) -> str:
    """
    Calls OpenAI with the full conversation history.
    Returns a short spoken-style reply grounded in clinic data only.
    """
    system_prompt = _SYSTEM_PROMPT.format(**db_context)

    messages = [{"role": "system", "content": system_prompt}]
    # Keep last 10 turns to avoid token bloat
    messages.extend(conversation_history[-10:])
    messages.append({"role": "user", "content": user_message})

    response = await _client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=messages,
        max_tokens=120,
        temperature=0.6,
    )

    return response.choices[0].message.content.strip()
