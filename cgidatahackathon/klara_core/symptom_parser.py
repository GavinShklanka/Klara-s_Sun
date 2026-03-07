"""
KLARA OS — Symptom parsing and care-context extraction.

Extracts symptoms, care preferences, and contextual signals for Nova Scotia
healthcare navigation (VirtualCareNS, primary care, urgent care, etc.).
"""

import re


def parse_symptoms(text: str) -> dict:
    """
    Extract symptoms, care-context concepts, and duration from patient input.
    Mapped concepts support KLARA OS routing for NS pathways.
    """
    text_lower = text.lower()
    symptoms = []

    # ── Acute symptom keywords ──
    if "headache" in text_lower:
        symptoms.append("headache")
    if "fever" in text_lower:
        symptoms.append("fever")
    if "pain" in text_lower:
        symptoms.append("pain")
    # Low-acuity musculoskeletal (CT4-5) — route to local services, not ED
    if any(k in text_lower for k in ["back pain", "lower back", "gross motor", "gross movement", "dofficulty", "muscle", "mobility"]):
        symptoms.append("musculoskeletal")
    if "chest" in text_lower:
        symptoms.append("chest pain")
    if "breath" in text_lower or "shortness" in text_lower:
        symptoms.append("shortness of breath")
    if any(k in text_lower for k in ["anxiety", "depress", "panic", "mental"]):
        symptoms.append("mental distress")

    # ── Care-context concepts (NS navigation) ──
    # Physiotherapy / rehab continuity
    if any(k in text_lower for k in ["physio", "physiotherapy", "physical therapy", "pt appointment"]):
        symptoms.append("physiotherapy")

    # Physician / in-person care preference
    if any(k in text_lower for k in ["physician", "doctor", "see a doctor", "family doctor", "gp"]):
        symptoms.append("physician")

    # Office closed / care disruption → alternative care needed
    if any(k in text_lower for k in ["office closed", "closed unexpectedly", "closed today", "cancelled", "closed unexpedctedly"]):
        symptoms.append("office closed")

    # Alternative / substitute care request
    if any(k in text_lower for k in ["alternative", "alternate", "substitute", "different site", "another location", "near site", "nearby site", "local site"]):
        symptoms.append("care substitution")

    # In-person / local preference (NS geography: Antigonish, rural, northern)
    if any(k in text_lower for k in ["near me", "in person", "local", "near site", "nearby", "antigonish", "truro", "amherst", "cape breton", "sydney"]):
        symptoms.append("in-person preferred")

    if not symptoms:
        symptoms.append("unspecified symptom")

    # Mock duration extraction
    duration_hours = 24  # default mock duration
    # Basic extraction for "X hour(s)" or "X day(s)".
    m_hours = re.search(r"(\d+)\s*(hour|hours|hr|hrs)", text_lower)
    m_days = re.search(r"(\d+)\s*(day|days)", text_lower)
    if m_hours:
        duration_hours = int(m_hours.group(1))
    elif m_days:
        duration_hours = int(m_days.group(1)) * 24
    
    return {
        "text": text,
        "symptoms": symptoms,
        "duration_hours": duration_hours
    }
