"""
services/openai_service.py – Builds the clinic knowledge-base system prompt
and calls OpenAI chat completion, including function calling for appointments.
"""
import json
from openai import AsyncOpenAI
from config import settings
from database.connection import SessionLocal
from database.models import Appointment

_client = AsyncOpenAI(
    api_key=settings.OPENAI_API_KEY,
    base_url=settings.OPENAI_BASE_URL
)

# ──────────────────────────────────────────────────────────────────────────────
# Clinic meta-data
# ──────────────────────────────────────────────────────────────────────────────
CLINIC_META = {
    "name":    "SmileCare Dental Clinic",
    "address": "42, MG Road, Bengaluru – 560001",
    "phone":   "+91 98765 43210",
    "hours":   "Monday to Saturday, 9:00 AM – 6:00 PM. Closed on Sundays and public holidays.",
}

def build_db_context(db) -> dict:
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
1. Always keep your answers extremely concise and conversational (1-2 short sentences max).
2. DO NOT use formatting like bold (**), italics, bullet points, or lists.
3. If the user's speech is cut off, partial, or sounds like background noise (e.g. they only say "is there" or "hello are you"), politely say "Pardon me?" or "Could you repeat that?" instead of making assumptions.
4. You are a voice assistant. Speak naturally.
5. Answer ONLY from the information above. Never invent prices, names, or policies.
6. If the user asks multiple questions at once, answer them together concisely, or gently ask them to take it one step at a time.
7. Be warm, polite, and professional.
8. If the patient asks something you don't have an answer for, say exactly:
   "I don't have that information right now — I'll have someone from our team call you back."
6. If the transcript seems garbled or unclear, just say: "I'm sorry, I didn't quite catch that. Could you repeat it?"
7. Never reveal that you are an AI unless the patient directly asks.
8. If the patient wants to book an appointment, use the `check_availability` tool to see if a time is free. 
9. Once a time is agreed upon, use the `book_appointment` tool to officially book it. You must collect their name, phone number, date, and time.
10. The patient's chosen language is '{target_language}'. The transcription engine might mistakenly transcribe their speech into English phonetic gibberish (e.g., 'in a car appointment venom' -> Tamil 'Enakku oru appointment venum'). Ignore the spelling and sound out what they meant!
11. You MUST reply ONLY in the language code '{target_language}' (e.g., if 'ta', reply in Tamil).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""".strip()

# ──────────────────────────────────────────────────────────────────────────────
# Tools Definition
# ──────────────────────────────────────────────────────────────────────────────
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "check_availability",
            "description": "Check if a doctor is available on a specific date and time.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "The date they want to book, e.g., 'tomorrow' or 'Oct 12'"},
                    "time": {"type": "string", "description": "The time they want to book, e.g., '10:00 AM'"}
                },
                "required": ["date", "time"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "book_appointment",
            "description": "Book a dental appointment after confirming availability.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "The patient's full name"},
                    "phone": {"type": "string", "description": "The patient's phone number"},
                    "date": {"type": "string", "description": "The date of the appointment"},
                    "time": {"type": "string", "description": "The time of the appointment"}
                },
                "required": ["name", "phone", "date", "time"]
            }
        }
    }
]

async def execute_tool_call(tool_call):
    """Executes a local python function based on the tool call request."""
    func_name = tool_call.function.name
    args = json.loads(tool_call.function.arguments)

    if func_name == "check_availability":
        # Mock logic: anything between 9 AM and 6 PM is "available" for the MVP demo
        return json.dumps({"status": "available", "message": f"The slot on {args['date']} at {args['time']} is available."})
    
    elif func_name == "book_appointment":
        db = SessionLocal()
        try:
            appt = Appointment(
                name=args["name"],
                phone=args["phone"],
                date=args["date"],
                time=args["time"]
            )
            db.add(appt)
            db.commit()
            
            # Formulate the WhatsApp message mock
            wa_msg = f"Hello {args['name']}, your dental appointment at SmileCare is confirmed for {args['date']} at {args['time']}."
            
            return json.dumps({"status": "success", "message": "Appointment booked successfully in the database!", "whatsapp_message": wa_msg})
        except Exception as e:
            return json.dumps({"status": "error", "message": str(e)})
        finally:
            db.close()
    
    return json.dumps({"error": "Unknown function"})


async def get_ai_response(
    user_message: str,
    conversation_history: list,
    db_context: dict,
) -> dict:
    """
    Calls OpenAI with the full conversation history.
    Handles function calls automatically and returns the final spoken reply.
    """
    system_prompt = _SYSTEM_PROMPT.format(**db_context)

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(conversation_history[-10:])
    messages.append({"role": "user", "content": user_message})

    response = await _client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=messages,
        tools=TOOLS,
        max_tokens=150,
        temperature=0.6,
    )

    msg = response.choices[0].message
    whatsapp_msg = None

    # Handle Tool Calls
    if msg.tool_calls:
        # Append the assistant's tool call request to history
        messages.append(msg)
        
        for tool_call in msg.tool_calls:
            print(f"[Tool Call] Executing {tool_call.function.name} with {tool_call.function.arguments}")
            tool_result = await execute_tool_call(tool_call)
            
            # Extract WhatsApp message if available
            try:
                res_dict = json.loads(tool_result)
                if "whatsapp_message" in res_dict:
                    whatsapp_msg = res_dict["whatsapp_message"]
            except Exception:
                pass
            
            # Append the tool's response
            messages.append({
                "tool_call_id": tool_call.id,
                "role": "tool",
                "name": tool_call.function.name,
                "content": tool_result,
            })
            
            # Let the assistant know the tool result so it can speak to the user
            # Also update conversation history for future turns (if needed, but our websocket handles UI side)

        # Ask OpenAI for the final natural language response based on the tool result
        second_response = await _client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=messages,
            max_tokens=150,
            temperature=0.6,
        )
        return {
            "reply": second_response.choices[0].message.content.strip(),
            "whatsapp_message": whatsapp_msg
        }

    return {
        "reply": msg.content.strip(),
        "whatsapp_message": None
    }
