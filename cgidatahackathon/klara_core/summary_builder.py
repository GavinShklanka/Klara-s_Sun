def build_summary(symptoms: list, duration: int, risk_level: str, recommended_pathway: str) -> dict:
    """
    Mock implementation to format the outputs of the previous functions into 
    the final structured summary object.
    """
    symptoms_str = ", ".join(symptoms) if symptoms else "None reported"
    duration_str = f"{duration} hours"
    risk_str = risk_level.capitalize()
    
    return {
        "symptoms": symptoms_str,
        "duration": duration_str,
        "risk": risk_str,
        "recommended_pathway": recommended_pathway
    }
