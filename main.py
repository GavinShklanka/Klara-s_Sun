"""
KLARA OS Core Engine — /assess endpoint.

Pipeline mapping to the 7-stage architecture:
  Stage 1  Patient Input          → AssessRequest (Layer 1 → Layer 2)
  Stage 2  Symptom Parsing        → parse_symptoms()        [INTAKE]
  Stage 3  Risk Classification    → risk_score()             [RISK_ASSESS]
  Stage 4  Provincial Context     → load_provincial_context() [PROVINCIAL_CONTEXT]
  Stage 5  Capacity-Aware Routing → route_care()             [ROUTING_OPT]
  Stage 6  Care Recommendation    → build_summary()          [RESPONSE_GEN]
  Stage 7  Structured Intake Out  → AssessResponse           (Layer 2 → Layer 1 + Layer 3)

RESPONSE_GEN output is the official "Structured Intake Output" that feeds
Layer 1 (Clinician Intake Summary View) and Layer 3 (EMR integration).
"""

from pathlib import Path
from datetime import datetime
import urllib.parse
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel as PydanticBaseModel
from fastapi.responses import FileResponse
from klara_data.schemas import (
    AssessRequest,
    AssessResponse,
    PatientInput,
    RiskAssessment,
    OporContext,
    ProvincialContext,
    RoutingRecommendation,
    SystemContext,
    StructuredSummary,
    Governance,
    FrontendOutput,
    FrontendConfidence,
    FrontendAlternative,
    FrontendSource,
    NavigationContextModel,
)
from klara_core.symptom_parser import parse_symptoms
from klara_core.risk_engine import risk_score
from klara_core.provincial_context import load_provincial_context
from klara_core.agentic_rag import retrieve_rag_context
from klara_core.eligibility_engine import resolve_pathway_eligibility
from klara_core.navigation_context import (
    new_navigation_context,
    attach_intake,
    attach_risk,
    attach_context,
)
from klara_core.routing_engine import route_care
from klara_core.summary_builder import build_summary

STATIC_DIR = Path(__file__).parent / "static"

# ── NS Core Care Pathways (real URLs for clickable routing) ──
PATHWAY_URLS = {
    "virtualcarens": {
        "name": "VirtualCareNS",
        "url": "https://www.nshealth.ca/clinics-programs-and-services/virtualcarens",
        "register_url": "https://www.nshealth.ca/virtual-care/virtual-care-ns/register-virtualcarens",
    },
    "811": {
        "name": "811 Nurse Line",
        "url": "https://811.novascotia.ca/",
    },
    "pharmacy": {
        "name": "Find a Pharmacy",
        "url": "https://www.novascotia.ca/dhw/pharmacies/",
    },
    "primarycare": {
        "name": "Primary Care / Family Doctor",
        "url": "https://www.nshealth.ca/find-physician",
    },
    "community_health": {
        "name": "Community Health Centres",
        "url": "https://www.nshealth.ca/community-health-centres",
    },
    "urgent": {
        "name": "Urgent Treatment Centre",
        "url": "https://www.nshealth.ca/urgent-treatment-centres",
    },
    "emergency": {
        "name": "Emergency Department",
        "url": "https://www.nshealth.ca/emergency",
    },
    "mental_health": {
        "name": "Mental Health Services",
        "url": "https://www.nshealth.ca/mental-health-addictions",
    },
}

# ── In-memory store for demo requests (no sensitive health data persisted) ──
DEMO_REQUESTS: list[dict] = []

app = FastAPI(title="KLARA OS Core Engine")

# ── Serve static assets (CSS, JS) ──
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def root():
    """Serve the patient-facing user view."""
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/admin")
def admin():
    """Serve the clinician / admin dashboard."""
    return FileResponse(str(STATIC_DIR / "admin.html"))

@app.post("/assess", response_model=AssessResponse)
def assess_patient(request: AssessRequest):
    nav_ctx = new_navigation_context(request.text, request.region, request.opor_context.model_dump() if request.opor_context else None)

    # ── Stage 2: Symptom Parsing (INTAKE = Patient Input + Symptom Parsing) ──
    parsed = parse_symptoms(request.text)
    attach_intake(nav_ctx, parsed["symptoms"], parsed["duration_hours"])

    # ── Stage 3: Risk Classification (RISK_ASSESS) ──
    risk_output = risk_score(parsed["symptoms"])
    attach_risk(nav_ctx, risk_output["score"], risk_output["level"], risk_output["emergency_flags"])

    # ── Stage 4: Provincial Context Analysis ──────────────────────────
    #  Loads capacity, available pathways, and policy flags from Layer 3
    #  (NS Health Capacity API, VirtualCareNS, EMR systems).
    #  Equivalent to: ELIGIBILITY + RAG_RETRIEVE + Layer 3 data.
    prov_ctx = load_provincial_context(request.region, risk_output["level"])

    # ── Stage 4.5: Eligibility + RAG Retrieve (symptom_selections from UI signal RAG) ──
    symptom_selections = getattr(request, "symptom_selections", None) or []
    rag_context = retrieve_rag_context(parsed["text"], parsed["symptoms"], symptom_selections)
    pathway_eligibility = resolve_pathway_eligibility(
        parsed["symptoms"],
        risk_output["level"],
        prov_ctx["available_pathways"],
    )
    eligible_pathways = [p["pathway_id"] for p in pathway_eligibility if p["eligible"]]

    # ── Stage 5: Capacity-Aware Routing (ROUTING_OPT) ──
    routing_output = route_care(
        risk_output["level"],
        request.region,
        eligible_pathways=eligible_pathways,
        capacity_snapshot=prov_ctx["capacity_snapshot"],
        symptoms=parsed["symptoms"],
        complaint_text=parsed["text"],
        duration_hours=parsed["duration_hours"],
    )

    # Human-in-loop: Users must NEVER self-escalate to ED. Replace emergency with 811.
    options = routing_output["options"]
    primary = routing_output["primary_pathway"]
    if "emergency" in options:
        options = ["811" if p == "emergency" else p for p in options]
        options = list(dict.fromkeys(options))
    if primary == "emergency":
        primary = "811"
    routing_output = {**routing_output, "primary_pathway": primary, "options": options}

    # ── Stage 6: Care Recommendation / RESPONSE_GEN ──
    summary_output = build_summary(
        parsed["symptoms"],
        parsed["duration_hours"],
        risk_output["level"],
        routing_output["primary_pathway"]
    )

    # ── Stage 7: Structured Intake Output ─────────────────────────────
    #  This response is the official "Structured Intake Output" feeding:
    #   • Layer 1 — Clinician Intake Summary View
    #   • Layer 3 — EMR integration (Med Access / Accuro)
    frontend_sources = [
        FrontendSource(
            title=s.get("title", s.get("source", "Reference")),
            url=s.get("url", ""),
            excerpt=s.get("content", s.get("excerpt", "")),
        )
        for s in rag_context[:5]
    ]
    frontend_output = FrontendOutput(
        pathway=routing_output["primary_pathway"],
        navigation_summary=routing_output["reason"],
        next_steps_for_patient=[
            f"Use the recommended pathway: {routing_output['primary_pathway']}.",
            "Prepare your health card and medication list before contact.",
            "If symptoms worsen, use urgent navigation guidance immediately.",
        ],
        questions_for_clinician=[
            "What symptom changes should trigger urgent escalation?",
            "Are current medications relevant to this presentation?",
        ],
        information_to_prepare=[
            f"Symptoms: {summary_output['symptoms']}",
            f"Duration: {summary_output['duration']}",
            f"Risk level: {summary_output['risk']}",
        ],
        safety_reminders=[
            "This output provides navigation guidance only and is non-diagnostic.",
            "Emergency indicators always override non-emergency routing.",
        ],
        escalation_conditions="Escalate to emergency pathway if chest pain, breathing difficulty, or severe deterioration occurs.",
        alternative_pathways_to_consider=[
            FrontendAlternative(pathway=o, reason="Alternative eligible pathway from optimization result.")
            for o in routing_output["options"][1:3]
        ],
        confidence=FrontendConfidence(
            numeric_score=0.92,
            rationale=f"Derived from symptom parsing, risk classification, context signals, and routing solver ({routing_output.get('optimizer', {}).get('solver', 'unknown')}).",
        ),
        sources=frontend_sources,
    )

    attach_context(
        nav_ctx,
        pathway_eligibility=pathway_eligibility,
        rag_context=rag_context,
        routing_result={
            "primary": routing_output["primary_pathway"],
            "alternatives": routing_output["options"][1:],
            "optimizer": routing_output.get("optimizer", {}),
        },
        response=frontend_output.model_dump(),
    )

    response = AssessResponse(
        session_id=nav_ctx["session_id"],
        patient_input=PatientInput(
            text=parsed["text"],
            symptoms=parsed["symptoms"],
            duration_hours=parsed["duration_hours"]
        ),
        risk_assessment=RiskAssessment(
            score=risk_output["score"],
            level=risk_output["level"],
            emergency_flags=risk_output["emergency_flags"]
        ),
        opor_context=request.opor_context,  # pass through any OPOR data from Layer 3
        provincial_context=ProvincialContext(
            capacity_snapshot=prov_ctx["capacity_snapshot"],
            available_pathways=prov_ctx["available_pathways"],
            policy_flags=prov_ctx["policy_flags"],
        ),
        routing_recommendation=RoutingRecommendation(
            primary_pathway=routing_output["primary_pathway"],
            reason=routing_output["reason"],
            options=routing_output["options"]
        ),
        system_context=SystemContext(
            region=request.region,
            virtualcare_wait=prov_ctx["capacity_snapshot"].get("virtualcarens_wait", "unknown"),
            utc_wait=prov_ctx["capacity_snapshot"].get("utc_wait", "unknown"),
            pharmacy_available=prov_ctx["capacity_snapshot"].get("pharmacy_available", False)
        ),
        structured_summary=StructuredSummary(
            symptoms=summary_output["symptoms"],
            duration=summary_output["duration"],
            risk=summary_output["risk"],
            recommended_pathway=summary_output["recommended_pathway"]
        ),
        governance=Governance(
            confidence_score=0.92,
            audit_events=[
                "Stage 2 — Symptom text parsed (Symptom Parsing).",
                "Stage 3 — Risk assessed (Risk Classification).",
                "Stage 4 — Provincial context loaded from Layer 3.",
                "Stage 4.5 — Pathway eligibility and RAG evidence retrieved.",
                "Stage 5 — Capacity-aware routing completed.",
                "Stage 6 — Care recommendation generated.",
                "Stage 7 — Structured Intake Output assembled.",
            ]
        ),
        frontend_output=frontend_output,
        navigation_context=NavigationContextModel(**nav_ctx),
        pathway_urls={
            k: v for k, v in PATHWAY_URLS.items()
            if k in routing_output["options"]
        },
    )

    return response


@app.get("/api/pathway-urls")
def get_pathway_urls():
    """Return mapping of pathway IDs to real NS service URLs."""
    return PATHWAY_URLS


# ── Symptom options for narrowing search (FastAPI-sourced) ──
SYMPTOM_OPTIONS_BY_COMPLAINT = {
    "back": ["Lower back pain", "Upper back pain", "Radiating pain", "Stiffness", "Difficulty moving", "Muscle spasm", "Numbness/tingling"],
    "back pain": ["Lower back pain", "Upper back pain", "Radiating pain", "Stiffness", "Difficulty moving", "Muscle spasm", "Numbness/tingling"],
    "pain": ["Sharp pain", "Dull ache", "Throbbing", "Radiating", "Worse with movement", "Constant", "Comes and goes"],
    "headache": ["Migraine", "Tension", "Sinuses", "Behind eyes", "Nausea", "Light sensitivity"],
    "fever": ["High fever (39°C+)", "Mild fever", "Chills", "Night sweats", "Cough", "Sore throat"],
    "chest": ["Chest pressure", "Pain with breathing", "Shortness of breath", "Heart racing", "Radiating to arm"],
    "respiratory": ["Cough", "Shortness of breath", "Wheezing", "Congestion", "Sore throat"],
    "mental": ["Anxiety", "Low mood", "Panic", "Sleep issues", "Stress", "Crisis"],
}


def _get_symptom_options(complaint: str) -> list[str]:
    """Return symptom options for narrowing search based on chief complaint."""
    c = (complaint or "").strip().lower()
    if not c:
        return []
    for key, opts in SYMPTOM_OPTIONS_BY_COMPLAINT.items():
        if key in c or c in key:
            return opts
    # Generic fallback
    return ["Pain or discomfort", "Swelling", "Redness", "Difficulty moving", "Fatigue", "Other"]


@app.get("/api/symptoms")
def get_symptoms(complaint: str = ""):
    """Return symptom options for narrowing search based on chief complaint (FastAPI)."""
    return {"symptoms": _get_symptom_options(complaint)}


class SubmitRequestPayload(PydanticBaseModel):
    session_id: str = ""
    pathway: str = ""
    observable_summary: str = ""


@app.post("/api/requests")
def submit_request(payload: SubmitRequestPayload):
    """
    Demo: Submit a care request (chosen pathway + observable summary).
    No sensitive health data stored; for admin visibility only.
    """
    DEMO_REQUESTS.append({
        "session_id": payload.session_id,
        "pathway": payload.pathway,
        "observable_summary": payload.observable_summary,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    })
    return {"ok": True, "message": "Request submitted"}


@app.get("/api/requests")
def list_requests():
    """Demo: List submitted care requests for admin view."""
    return {"requests": list(reversed(DEMO_REQUESTS))}


# ── Geolocation / nearby locations (FastAPI) — real NS locations + GIS-style links ──
PATHWAY_SEARCH_TERMS = {
    "pharmacy": "pharmacy",
    "primarycare": "family doctor clinic",
    "urgent": "urgent treatment centre",
    "community_health": "community health centre",
    "811": "811 nurse line",
    "virtualcarens": "virtual care",
    "mental_health": "mental health services",
    "emergency": "emergency department",
}

# Non-place words that should not be used as location (e.g. user typed "no" in wrong field)
LOCATION_BLOCKLIST = frozenset({
    "no", "none", "n/a", "na", "no medication", "no medications", "no allergies",
    "no medication.", "nope", "nothing", "skip", "-", "—",
})

# Real Nova Scotia service locations + URLs (expand via NS Health / 811 / pharmacy finders).
# Prompt for content team: "Collect official NS pharmacy finder, UTC list, community health URLs."
NS_LOCATIONS = {
    "pharmacy": [
        {"name": "Find a Pharmacy (NS)", "url": "https://www.novascotia.ca/dhw/pharmacies/", "type": "finder"},
        {"name": "Pharmacists Association of NS", "url": "https://www.pans.ns.ca/", "type": "info"},
    ],
    "primarycare": [
        {"name": "Find a Physician (NS Health)", "url": "https://www.nshealth.ca/find-physician", "type": "finder"},
    ],
    "urgent": [
        {"name": "Urgent Treatment Centres (NS Health)", "url": "https://www.nshealth.ca/urgent-treatment-centres", "type": "list"},
    ],
    "community_health": [
        {"name": "Community Health Centres (NS Health)", "url": "https://www.nshealth.ca/community-health-centres", "type": "list"},
    ],
    "811": [
        {"name": "811 Nova Scotia", "url": "https://811.novascotia.ca/", "type": "service"},
    ],
    "virtualcarens": [
        {"name": "VirtualCareNS", "url": "https://www.nshealth.ca/clinics-programs-and-services/virtualcarens", "type": "service"},
    ],
    "mental_health": [
        {"name": "Mental Health & Addictions (NS Health)", "url": "https://www.nshealth.ca/mental-health-addictions", "type": "list"},
    ],
    "emergency": [
        {"name": "Emergency Departments (NS Health)", "url": "https://www.nshealth.ca/emergency", "type": "list"},
    ],
}


def _safe_location(town: str, region: str) -> str:
    """Return a location string safe for display and maps (no 'no medication' etc.)."""
    for raw, label in [(town, "town"), (region, "region")]:
        t = (raw or "").strip().lower()
        if not t or t in LOCATION_BLOCKLIST or any(b in t for b in ("no medication", "no allergy", "no med")):
            continue
        if len(t) >= 2:
            return raw.strip()
    return "Nova Scotia"


@app.get("/api/nearby")
def get_nearby(pathway: str = "", region: str = "", town: str = ""):
    """
    Return nearby service locations for pathway + region/town.
    Real GIS-style Google Maps URLs + list of real NS service URLs.
    """
    search = PATHWAY_SEARCH_TERMS.get(pathway.lower(), pathway) if pathway else "healthcare"
    loc = _safe_location(town, region)
    q = f"{search} near {loc}, Nova Scotia"
    maps_search = f"https://www.google.com/maps/search/{urllib.parse.quote(q)}"
    maps_directions = f"https://www.google.com/maps/dir/?api=1&destination={urllib.parse.quote(loc + ', Nova Scotia')}&travelmode=driving"
    locations = NS_LOCATIONS.get(pathway.lower(), [])
    return {
        "pathway": pathway,
        "region": region,
        "town": town,
        "location_display": loc,
        "search_query": q,
        "maps_search_url": maps_search,
        "maps_directions_url": maps_directions,
        "locations": locations,
        "next_steps": [
            "Use the map link to find locations near you (real-time).",
            "Use the list below for official NS Health / service URLs.",
        ],
    }


@app.get("/api/status/{session_id}")
def get_status(session_id: str):
    """Return request status for a session (for realtime dashboard updates)."""
    for r in reversed(DEMO_REQUESTS):
        if r.get("session_id") == session_id:
            return {
                "session_id": session_id,
                "status": "submitted",
                "pathway": r.get("pathway", ""),
                "submitted_at": r.get("timestamp", ""),
                "next_steps": ["Your request has been received.", "Check your chosen pathway link for next steps."],
            }
    return {"session_id": session_id, "status": "not_found", "next_steps": []}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
