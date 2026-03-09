import re

from klara_core.telemetry import log_route, log_service_usage

CANONICAL_PATHWAYS = [
    "virtualcarens",
    "pharmacy",
    "primarycare",
    "urgent",
    "emergency",
    "mental_health",
    "community_health",
]


def _wait_to_hours(value: str | None) -> float:
    if not value:
        return 0.0
    text = str(value).strip().lower()
    m = re.search(r"(\d+(?:\.\d+)?)", text)
    if not m:
        return 0.0
    amount = float(m.group(1))
    if "min" in text:
        return amount / 60.0
    return amount


def _build_preference_adjustments(
    risk_level: str,
    symptoms: list[str] | None,
    complaint_text: str | None,
    duration_hours: int | None,
    capacity_snapshot: dict | None,
) -> dict[str, float]:
    adjustments = {p: 0.0 for p in CANONICAL_PATHWAYS}
    signal_text = " ".join(symptoms or []).lower()
    if complaint_text:
        signal_text = f"{signal_text} {complaint_text.lower()}"

    # Risk-level guidance so urgent cases do not default to virtual care.
    if risk_level == "urgent":
        adjustments["virtualcarens"] += 4.0
        adjustments["pharmacy"] += 2.0
        adjustments["community_health"] += 1.5
        adjustments["primarycare"] += 1.8
        adjustments["urgent"] -= 1.2
    elif risk_level == "moderate":
        adjustments["virtualcarens"] += 1.0
        adjustments["primarycare"] -= 0.5

    # Symptom-based pathway shaping.
    if any(k in signal_text for k in ["anxiety", "depress", "panic", "mental distress", "suicid"]):
        adjustments["mental_health"] -= 3.0
        adjustments["virtualcarens"] += 1.5
    if any(k in signal_text for k in ["medication", "refill", "drug", "side effect", "adverse", "pills"]):
        adjustments["pharmacy"] -= 2.2
    if any(k in signal_text for k in ["fever", "infection", "cough", "sore throat"]):
        adjustments["primarycare"] -= 0.8
        adjustments["virtualcarens"] += 0.6
    if any(k in signal_text for k in ["virtual", "video", "online", "telehealth", "remote", "quick advice"]):
        adjustments["virtualcarens"] -= 1.3
    if any(k in signal_text for k in ["follow up", "family doctor", "chronic", "blood pressure", "diabetes", "referral"]):
        adjustments["primarycare"] -= 1.2
    if any(k in signal_text for k in ["housing", "food", "shelter", "transport", "financial", "community support", "social support"]):
        adjustments["community_health"] -= 2.8
        adjustments["virtualcarens"] += 1.2
        adjustments["pharmacy"] += 0.8

    # ED bottleneck relief: CT4-5 low-acuity → route to local services (walk-in, primary, community).
    # Back pain, gross motor, musculoskeletal without red flags → NOT ED.
    if any(k in signal_text for k in [
        "back pain", "lower back", "back issue", "gross motor", "gross movement",
        "muscle", "musculoskeletal", "strain", "sprain", "dofficulty", "difficulty",
        "mobility", "movement"
    ]):
        adjustments["emergency"] += 8.0
        adjustments["urgent"] += 1.5
        adjustments["primarycare"] -= 2.0
        adjustments["community_health"] -= 1.8
        adjustments["virtualcarens"] -= 0.5

    # Nova Scotia: In-person / local site preference — favor primarycare, community_health; penalize virtual.
    # User explicitly requests physician near, physio, near site, local site, in-person, or NS geography.
    if any(k in signal_text for k in [
        "physician near", "physician", "physio", "physiotherapy", "near site", "local site",
        "in person", "in-person", "nearby site", "near me", "physical location", "office closed",
        "care substitution", "alternative care", "alternate site", "different site",
        "antigonish", "truro", "amherst", "cape breton", "sydney", "rural", "northern region"
    ]):
        adjustments["primarycare"] -= 2.2
        adjustments["community_health"] -= 2.0
        adjustments["virtualcarens"] += 2.5
        adjustments["pharmacy"] += 0.5

    # Persistent symptoms should move away from pure virtual-first routing.
    if (duration_hours or 0) >= 72 and risk_level in ["low", "moderate"]:
        adjustments["primarycare"] -= 0.8
        adjustments["virtualcarens"] += 0.8

    # Generic-symptom: Do NOT give virtualcarens a cost bonus. Base routing on complaint_text.
    # Removed: if symptoms == ["unspecified symptom"]: adjustments["virtualcarens"] -= 0.6

    # Convert queue pressure into soft penalties.
    if capacity_snapshot:
        wait_map = {
            "virtualcarens": capacity_snapshot.get("virtualcarens_wait"),
            "urgent": capacity_snapshot.get("utc_wait"),
            "emergency": capacity_snapshot.get("ed_wait"),
        }
        for pathway, raw_wait in wait_map.items():
            wait_hours = _wait_to_hours(raw_wait)
            adjustments[pathway] += min(wait_hours * 0.45, 2.5)

        if not capacity_snapshot.get("mental_health_available", True):
            adjustments["mental_health"] += 100.0
        if not capacity_snapshot.get("community_health_available", True):
            adjustments["community_health"] += 100.0

    return adjustments


def route_care(
    risk_level: str,
    region: str,
    eligible_pathways: list | None = None,
    capacity_snapshot: dict | None = None,
    symptoms: list[str] | None = None,
    complaint_text: str | None = None,
    duration_hours: int | None = None,
    policy_context: dict | None = None,
) -> dict:
    """
    Capacity-Aware Routing Engine (Architecture Stage 5).

    Routes patients to the appropriate care delivery node (Layer 4)
    based on risk level and region.

    Data source: Parameters (wait times, capacity pressure) are sourced from
    the Healthcare System Integration Layer (Layer 3), specifically:
      - NS Health Capacity API  (real-time ED / UTC wait & occupancy)
      - VirtualCareNS availability
      - Regional EMR systems (Med Access, Accuro)

    Pathway set aligned with Layer 4 care delivery nodes:
      ED, UTC, Primary Care, Pharmacy, Telehealth,
      Mental Health, Community Health Centres.

    Note: Emergency cases are not routed by this model — they are handled
    by the Escalation Override Protocol (EMERGENCY node in the pipeline).
    """
    # Emergency override: Human-in-loop. Users must NOT self-escalate to ED.
    # Route to 811 Nurse Line for triage; clinician/nurse directs to ED if needed.
    if risk_level == "emergency":
        log_route("811")
        log_service_usage("811")
        out = {
            "primary_pathway": "811",
            "reason": "Human-in-loop: Call 811 for nurse triage. Do not go directly to ED—811 will direct you if needed.",
            "options": ["811", "urgent"],
            "care_sequence": ["811"],
            "optimizer": {"solver": "bypass", "status": "emergency_hitl_811", "solve_time_ms": 0.0, "objective_value": 0.0},
        }
        if policy_context:
            out["policy"] = {"applied": policy_context.get("applied_policies", []), "notes": policy_context.get("policy_notes", [])}
        return out

    from klara_core.optimization import optimize_pathways

    canonical_capacities = {
        "virtualcarens": 200,
        "pharmacy": 80,
        "primarycare": 40,
        "urgent": 50,
        "emergency": 120,
        "mental_health": 35,
        "community_health": 40,
    }
    if capacity_snapshot:
        # Keep simple/prototype mapping of signal-to-capacity.
        if not capacity_snapshot.get("pharmacy_available", True):
            canonical_capacities["pharmacy"] = 0

    result = optimize_pathways(
        risk_level=risk_level,
        eligible_pathways=eligible_pathways or list(canonical_capacities.keys()),
        capacities=canonical_capacities,
        preference_adjustments=_build_preference_adjustments(
            risk_level=risk_level,
            symptoms=symptoms,
            complaint_text=complaint_text,
            duration_hours=duration_hours,
            capacity_snapshot=capacity_snapshot,
        ),
        policy_context=policy_context,
    )

    primary_pathway = result["primary"]
    log_route(primary_pathway)
    log_service_usage(primary_pathway)
    reason = (
        "Optimization routing selected the pathway with lowest system strain under safety and capacity constraints. "
        f"Solver={result.get('solver')} status={result.get('status')}."
    )
    options = [primary_pathway] + result.get("alternatives", [])
    care_sequence = result.get("care_sequence") or [primary_pathway]

    out = {
        "primary_pathway": primary_pathway,
        "reason": reason,
        "options": options,
        "care_sequence": care_sequence,
        "optimizer": {
            "solver": result.get("solver"),
            "status": result.get("status"),
            "solve_time_ms": result.get("solve_time_ms", 0.0),
            "objective_value": result.get("objective_value", 0.0),
            "pathway_costs": result.get("pathway_costs", {}),
            "pathway_ranking": result.get("pathway_ranking", []),
        },
    }
    if policy_context:
        out["policy"] = {"applied": policy_context.get("applied_policies", []), "notes": policy_context.get("policy_notes", [])}
    return out
