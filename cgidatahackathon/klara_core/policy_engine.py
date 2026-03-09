"""
KLARA OS — Policy & Governance Engine.

Evaluates policy constraints that govern routing decisions.
Policies: clinical safety overrides, geographic constraints, access equity, service prioritization.
Output: applied_policies, constraints, policy_notes. Attached as optional layer; does not replace routing contract.
"""

from __future__ import annotations

from typing import Any, Dict, List


# Baseline policy identifiers
EMERGENCY_OVERRIDE = "EMERGENCY_OVERRIDE"
RURAL_DISTANCE_LIMIT = "RURAL_DISTANCE_LIMIT"
MENTAL_HEALTH_PRIORITY = "MENTAL_HEALTH_PRIORITY"
CAPACITY_PROTECTION = "CAPACITY_PROTECTION"

# Regions treated as rural for distance/access policies
RURAL_REGIONS = frozenset({
    "cape breton", "northern (rural)", "rural", "annapolis valley",
    "south shore", "eastern shore", "yarmouth", "digby", "guysborough",
})


def evaluate_policies(
    risk_level: str,
    region: str,
    eligible_pathways: List[str],
    capacity_snapshot: Dict[str, Any] | None = None,
    symptoms: List[str] | None = None,
) -> Dict[str, Any]:
    """
    Evaluate which policies apply and return constraints + notes.
    Called after eligibility, before optimizer. Does not change primary_pathway/options contract.
    """
    applied: List[str] = []
    constraints: Dict[str, Any] = {}
    notes: List[str] = []

    region_lower = (region or "").strip().lower()

    # EMERGENCY_OVERRIDE: handled upstream (routing_engine bypasses optimizer). Record for trace.
    if risk_level == "emergency":
        applied.append(EMERGENCY_OVERRIDE)
        notes.append("Emergency override: triage via 811; optimizer bypassed.")

    # RURAL_DISTANCE_LIMIT: limit effective routing distance in rural regions
    if region_lower and any(r in region_lower for r in RURAL_REGIONS):
        applied.append(RURAL_DISTANCE_LIMIT)
        constraints["max_distance_km"] = 60
        notes.append("Rural routing distance limited for access equity.")

    # MENTAL_HEALTH_PRIORITY: boost mental health pathway when signals present
    signal_text = " ".join(symptoms or []).lower()
    if any(k in signal_text for k in ["anxiety", "depress", "mental", "panic", "stress", "mood"]):
        if "mental_health" in eligible_pathways:
            applied.append(MENTAL_HEALTH_PRIORITY)
            notes.append("Mental health pathway prioritized per clinical signals.")

    # CAPACITY_PROTECTION: respect capacity snapshot (unavailable services already filtered by eligibility)
    if capacity_snapshot:
        applied.append(CAPACITY_PROTECTION)
        if not capacity_snapshot.get("mental_health_available", True):
            notes.append("Mental health capacity constrained; alternative pathways preferred.")
        if not capacity_snapshot.get("community_health_available", True):
            notes.append("Community health capacity constrained.")
        if not capacity_snapshot.get("pharmacy_available", True):
            notes.append("Pharmacy capacity constrained.")

    return {
        "applied_policies": applied,
        "constraints": constraints,
        "policy_notes": notes,
    }
