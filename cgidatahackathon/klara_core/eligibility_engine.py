"""
KLARA OS — pathway eligibility resolution.
"""

from typing import Dict, List


CANONICAL_PATHWAYS = [
    "virtualcarens",
    "pharmacy",
    "primarycare",
    "urgent",
    "emergency",
    "mental_health",
    "community_health",
]


def resolve_pathway_eligibility(symptoms: List[str], risk_level: str, available_pathways: List[str]) -> List[Dict]:
    available = set(available_pathways or CANONICAL_PATHWAYS)
    symptom_text = " ".join(symptoms).lower()
    is_mental = any(k in symptom_text for k in ["anxiety", "depress", "panic", "suicid", "mental"])

    out = []
    for p in CANONICAL_PATHWAYS:
        if p not in available:
            out.append({"pathway_id": p, "eligible": False, "reason": "Unavailable in current provincial context."})
            continue

        eligible = True
        reason = "Eligible by default navigation rules."

        if risk_level == "emergency":
            # Human-in-loop: do NOT let users self-escalate to ED. Route to 811 triage.
            eligible = p == "emergency"  # backend will replace with 811 in response
            reason = "Emergency override active; Human-in-loop escalation to 811." if eligible else "Emergency cases bypass non-emergency pathways."
        elif risk_level == "urgent":
            if p in ["pharmacy", "community_health"]:
                eligible = False
                reason = "Urgent presentations require higher-acuity pathway."
            elif p == "emergency":
                # Users cannot self-escalate to ED. Only allow emergency if chest/breathing (handled separately).
                has_emergency_indicators = any(k in symptom_text for k in ["chest", "breath", "shortness"])
                if not has_emergency_indicators:
                    eligible = False
                    reason = "No emergency indicators. Human-in-loop (811) required for escalation."
        else:
            if p == "emergency":
                eligible = False
                reason = "No emergency indicators detected."

        if p == "mental_health" and not is_mental:
            eligible = False
            reason = "No mental health indicators detected."

        if is_mental and p == "mental_health":
            eligible = True
            reason = "Mental health indicators present."

        out.append({"pathway_id": p, "eligible": eligible, "reason": reason})

    return out

