def risk_score(symptoms: list) -> dict:
    """
    Mock implementation to return risk score, level, and emergency flags
    based on keyword detection.
    """
    score = 20
    level = "low"
    flags = []

    # Simple logic for mock functionality
    if "chest pain" in symptoms or "shortness of breath" in symptoms:
        score = 95
        level = "emergency"
        flags.append("Immediate emergency navigation guidance recommended")
    elif "fever" in symptoms:
        score = 55
        level = "moderate"
    elif "musculoskeletal" in symptoms:
        # Back pain, gross motor — CT4-5 low acuity, route to local services
        score = 35
        level = "low"
    elif "pain" in symptoms:
        score = 72
        level = "urgent"
    elif "headache" in symptoms:
        score = 30
        level = "low"
        
    return {
        "score": score,
        "level": level,
        "emergency_flags": flags
    }
