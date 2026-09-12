"""
database/seed.py – Seeds the database with initial SmileCare clinic data.
Skips seeding if data already exists (safe to call on every startup).
"""
from database.connection import SessionLocal
from database.models import Doctor, Service, FAQ


DOCTORS = [
    {
        "name": "Dr. Priya Sharma",
        "specialization": "General & Cosmetic Dentistry",
        "available_days": "Monday, Wednesday, Friday",
    },
    {
        "name": "Dr. Arjun Mehta",
        "specialization": "Orthodontics & Dental Implants",
        "available_days": "Tuesday, Thursday, Saturday",
    },
]

SERVICES = [
    {"name": "Routine Cleaning & Scaling",    "price_range": "₹800 – ₹1,200"},
    {"name": "Tooth Extraction",              "price_range": "₹500 – ₹1,500"},
    {"name": "Root Canal Treatment",          "price_range": "₹4,000 – ₹7,000"},
    {"name": "Teeth Whitening",               "price_range": "₹3,500 – ₹5,000"},
    {"name": "Braces (Metal / Ceramic)",      "price_range": "₹18,000 – ₹35,000"},
    {"name": "Dental Implant (single tooth)", "price_range": "₹25,000 – ₹40,000"},
]

FAQS = [
    {
        "question": "Do I need an appointment?",
        "answer": "Appointments are preferred, but walk-ins are welcome subject to availability.",
    },
    {
        "question": "Do you accept insurance?",
        "answer": "Yes, we accept most major dental insurance plans. Please carry your insurance card.",
    },
    {
        "question": "Is root canal treatment painful?",
        "answer": "Modern root canal treatment is performed under local anaesthesia and is largely pain-free.",
    },
    {
        "question": "How long does a routine cleaning take?",
        "answer": "A routine cleaning usually takes 30 to 45 minutes.",
    },
    {
        "question": "What should I bring for my first visit?",
        "answer": "Please bring a valid ID, your insurance card if applicable, and any previous dental X-rays.",
    },
    {
        "question": "Do you offer payment plans or EMI?",
        "answer": "Yes, we offer zero-interest EMI options on treatments above ₹10,000.",
    },
]


def seed_db():
    """Insert seed data if tables are empty."""
    db = SessionLocal()
    try:
        if db.query(Doctor).count() == 0:
            db.add_all([Doctor(**d) for d in DOCTORS])
            print("[seed] Inserted doctors.")

        if db.query(Service).count() == 0:
            db.add_all([Service(**s) for s in SERVICES])
            print("[seed] Inserted services.")

        if db.query(FAQ).count() == 0:
            db.add_all([FAQ(**f) for f in FAQS])
            print("[seed] Inserted FAQs.")

        db.commit()
        print("[seed] Database seeding complete.")
    except Exception as e:
        db.rollback()
        print(f"[seed] Error seeding database: {e}")
    finally:
        db.close()
