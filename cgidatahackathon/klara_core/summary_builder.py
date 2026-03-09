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


def build_optimization_explanation(
    risk_level: str,
    primary_pathway: str,
    optimizer: dict | None = None,
    options: list | None = None,
) -> str:
    """
    Generate user-facing explanation for why this route was selected.
    Factors: non-emergency classification, closest available service,
    service eligibility, system load balancing.
    """
    parts = []
    if risk_level == "emergency":
        parts.append("Emergency indicators detected. Route to 811 nurse triage for clinician-directed escalation.")
    elif risk_level == "urgent":
        parts.append("Urgent classification—requires higher-acuity care.")
    else:
        parts.append("Non-emergency classification.")

    parts.append("Service eligibility was checked against your symptoms and risk level.")
    parts.append("Closest available service and capacity were considered.")

    solver = (optimizer or {}).get("solver", "rule")
    if solver in ("gurobi", "pulp"):
        parts.append("System load balancing was applied to minimize wait times across Nova Scotia.")
    else:
        parts.append("Routing rules were applied to match your needs to available pathways.")

    if options:
        parts.append(f"Alternatives considered: {', '.join(options[:3])}.")

    return " ".join(parts)
