#!/usr/bin/env python3
"""
KLARA OS — System compliance and debug script.

Run from repo root (cgidatahackathon):
  python scripts/run_compliance.py

Or with live server on port 8000:
  python scripts/run_compliance.py --live

Checks:
- Environment and dependencies
- Core module imports
- API endpoints (GET/POST)
- /assess pipeline (low, moderate, urgent, emergency, RAG signals)
- Response schema and business rules (no self-escalation to ED, 811 HITL)
- Static assets
- Optional: Gurobi/PuLP availability
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Run from cgidatahackathon
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
os.chdir(REPO_ROOT)

# ─── Config ─────────────────────────────────────────────────────────────
REQUIRED_ENV_KEYS = [
    "OPENAI_API_KEY",
    "EUROPE_PMC_BASE_URL",
]
OPTIONAL_ENV_KEYS = [
    "BIOPORTAL_API_KEY",
    "OPENFDA_API_KEY",
    "MEDLINE_PRIMARY",
    "RXNORM_BASE_URL",
    "GUROBI_LICENSE_FILE",
    "WLSACCESSID",
    "WLSSECRET",
    "LICENSEID",
]
EXPECTED_PATHWAYS = [
    "virtualcarens", "pharmacy", "primarycare", "urgent", "emergency",
    "mental_health", "community_health", "811",
]
ASSESS_REQUIRED_FIELDS = [
    "session_id", "patient_input", "risk_assessment", "routing_recommendation",
    "system_context", "structured_summary", "governance", "pathway_urls",
]


def log(msg: str, ok: bool | None = None) -> None:
    if ok is True:
        print(f"  [PASS] {msg}")
    elif ok is False:
        print(f"  [FAIL] {msg}")
    else:
        print(f"  [----] {msg}")


def section(name: str) -> None:
    print(f"\n{'='*60}\n{name}\n{'='*60}")


# ─── 1) Environment ─────────────────────────────────────────────────────
def check_env() -> bool:
    section("1) Environment (.env)")
    dotenv = REPO_ROOT / ".env"
    if not dotenv.exists():
        log(".env file missing", False)
        return False
    log(".env exists", True)
    # Load into os.environ for downstream (optional)
    try:
        with open(dotenv) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())
    except Exception as e:
        log(f"Could not parse .env: {e}", False)
        return False
    for k in REQUIRED_ENV_KEYS:
        val = os.environ.get(k, "")
        if not val or val.startswith("leave_blank") or val == "not_required":
            log(f"Required env present (or placeholder): {k}", val != "")
        else:
            log(f"Required env set: {k}", True)
    for k in OPTIONAL_ENV_KEYS:
        if os.environ.get(k):
            log(f"Optional env set: {k}", True)
        else:
            log(f"Optional env unset (ok): {k}", True)
    return True


# ─── 2) Dependencies & imports ───────────────────────────────────────────
def check_imports() -> bool:
    section("2) Dependencies & core imports")
    try:
        import fastapi
        log(f"fastapi {getattr(fastapi, '__version__', '?')}", True)
    except ImportError:
        log("fastapi not installed", False)
        return False
    try:
        import uvicorn
        log("uvicorn", True)
    except ImportError:
        log("uvicorn not installed", False)
        return False
    try:
        import pydantic
        log("pydantic", True)
    except ImportError:
        log("pydantic not installed", False)
        return False
    try:
        import pulp
        log("PuLP (fallback solver)", True)
    except ImportError:
        log("PuLP not installed (optional)", False)
    try:
        import gurobipy
        log("Gurobi available", True)
    except ImportError:
        log("Gurobi not installed (optional; PuLP/rule used)", True)
    try:
        from klara_data.schemas import AssessRequest, AssessResponse
        log("klara_data.schemas", True)
    except Exception as e:
        log(f"klara_data.schemas: {e}", False)
        return False
    try:
        from klara_core.symptom_parser import parse_symptoms
        from klara_core.risk_engine import risk_score
        from klara_core.routing_engine import route_care
        from klara_core.eligibility_engine import resolve_pathway_eligibility
        from klara_core.agentic_rag import retrieve_rag_context
        log("klara_core (parser, risk, routing, eligibility, rag)", True)
    except Exception as e:
        log(f"klara_core: {e}", False)
        return False
    return True


# ─── 3) Static assets ────────────────────────────────────────────────────
def check_static() -> bool:
    section("3) Static assets")
    static = REPO_ROOT / "static"
    if not static.is_dir():
        log("static/ missing", False)
        return False
    log("static/ exists", True)
    for name in ["index.html", "user.js", "user.css", "admin.html", "admin.js", "admin.css"]:
        p = static / name
        log(f"  {name}", p.exists())
    return True


# ─── 4) API (TestClient or live) ─────────────────────────────────────────
def get_client(live: bool) -> tuple[object, str]:
    if live:
        try:
            import httpx
            return httpx.Client(base_url="http://127.0.0.1:8000", timeout=15.0), "live"
        except ImportError:
            return None, "no_httpx"
    try:
        from fastapi.testclient import TestClient
        from main import app
        return TestClient(app), "test"
    except Exception as e:
        return None, str(e)


def get_json(client, method: str, path: str, **kwargs) -> tuple[dict | list | None, int]:
    if hasattr(client, "get") and hasattr(client, "post"):
        if method.upper() == "GET":
            r = client.get(path, **kwargs)
        else:
            r = client.post(path, **kwargs)
        try:
            return r.json(), r.status_code
        except Exception:
            return None, r.status_code
    return None, 0


def check_api(live: bool) -> bool:
    section("4) API endpoints")
    client, mode = get_client(live)
    if client is None:
        log(f"Cannot create client: {mode}", False)
        if live:
            log("Install: pip install httpx; start server: uvicorn main:app --port 8000", False)
        return False
    log(f"Client mode: {mode}", True)

    # GET /
    data, code = get_json(client, "GET", "/")
    if code == 200:
        log("GET / (patient view)", True)
    else:
        log(f"GET / -> {code}", False)

    # GET /admin
    _, code = get_json(client, "GET", "/admin")
    log("GET /admin", code == 200)

    # GET /api/pathway-urls
    data, code = get_json(client, "GET", "/api/pathway-urls")
    if code != 200 or not isinstance(data, dict):
        log("GET /api/pathway-urls", False)
    else:
        for p in EXPECTED_PATHWAYS:
            if p not in data:
                log(f"  pathway missing: {p}", False)
                break
        else:
            log("GET /api/pathway-urls (all pathways)", True)

    # GET /api/symptoms
    data, code = get_json(client, "GET", "/api/symptoms?complaint=back+pain")
    if code == 200 and isinstance(data, dict) and "symptoms" in data:
        log("GET /api/symptoms", True)
    else:
        log("GET /api/symptoms", False)

    # GET /api/nearby
    data, code = get_json(client, "GET", "/api/nearby?pathway=pharmacy&region=Halifax&town=Dartmouth")
    if code == 200 and isinstance(data, dict) and "maps_search_url" in data:
        log("GET /api/nearby (maps_search_url)", True)
        if "locations" in data:
            log("  locations list present", True)
    else:
        log("GET /api/nearby", False)

    # GET /api/requests
    data, code = get_json(client, "GET", "/api/requests")
    if code == 200 and isinstance(data, dict) and "requests" in data:
        log("GET /api/requests", True)
    else:
        log("GET /api/requests", False)

    # GET /api/status/{id}
    data, code = get_json(client, "GET", "/api/status/test-session-123")
    if code == 200 and isinstance(data, dict):
        log("GET /api/status/{id}", True)
    else:
        log("GET /api/status/{id}", False)

    return True


# ─── 5) /assess pipeline & compliance ────────────────────────────────────
def check_assess(live: bool) -> bool:
    section("5) /assess pipeline & business rules")
    client, mode = get_client(live)
    if client is None:
        log("No client; skip assess tests", False)
        return False

    def post_assess(text: str, region: str = "Halifax", symptom_selections: list | None = None) -> tuple[dict | None, int]:
        body = {"text": text, "region": region}
        if symptom_selections is not None:
            body["symptom_selections"] = symptom_selections
        return get_json(client, "POST", "/assess", json=body)

    all_ok = True

    # 5.1 Low acuity (back pain) — no emergency in options
    data, code = post_assess("I have back pain and stiffness for 3 days. Annapolis Valley.")
    if code != 200:
        log("Assess low (back pain) status 200", False)
        all_ok = False
    else:
        log("Assess low (back pain) status 200", True)
        for f in ASSESS_REQUIRED_FIELDS:
            if f not in data:
                log(f"  missing field: {f}", False)
                all_ok = False
        opts = (data.get("routing_recommendation") or {}).get("options") or []
        if "emergency" in opts:
            log("  low acuity must NOT include emergency in options", False)
            all_ok = False
        else:
            log("  low acuity: emergency not in options (OK)", True)
        if data.get("pathway_urls"):
            log("  pathway_urls present", True)
        else:
            log("  pathway_urls missing", False)
            all_ok = False

    # 5.2 Moderate (fever)
    data, code = post_assess("Fever and headache for 24 hours.", "Cape Breton")
    if code != 200:
        log("Assess moderate (fever) status 200", False)
        all_ok = False
    else:
        log("Assess moderate (fever) status 200", True)
        lev = (data.get("risk_assessment") or {}).get("level", "")
        log(f"  risk level: {lev}", lev in ("low", "moderate", "urgent", "emergency"))

    # 5.3 Emergency — must route to 811 (HITL), not raw ED
    data, code = post_assess("Chest pain and shortness of breath for one hour.", "Halifax")
    if code != 200:
        log("Assess emergency status 200", False)
        all_ok = False
    else:
        log("Assess emergency status 200", True)
        rec = data.get("routing_recommendation") or {}
        primary = rec.get("primary_pathway", "")
        opts = rec.get("options") or []
        if primary == "811" and "emergency" not in opts:
            log("  emergency -> 811 primary, no ED in options (HITL)", True)
        elif primary == "emergency":
            log("  emergency still primary (should be 811 for HITL)", False)
            all_ok = False
        else:
            log(f"  primary={primary}, options={opts}", True)

    # 5.4 symptom_selections (RAG signal)
    data, code = post_assess("Headache and nausea.", "Halifax", symptom_selections=["Migraine", "Light sensitivity"])
    if code != 200:
        log("Assess with symptom_selections status 200", False)
        all_ok = False
    else:
        log("Assess with symptom_selections (RAG signal) accepted", True)

    # 5.5 Backward compatibility fields
    data, code = post_assess("Mild cough.", "Halifax")
    if code == 200:
        for f in ["session_id", "navigation_context", "frontend_output"]:
            if f not in data:
                log(f"  backward compat missing: {f}", False)
                all_ok = False
        else:
            log("  backward compat (session_id, navigation_context, frontend_output)", True)
        nav = data.get("navigation_context") or {}
        routing_result = nav.get("routing_result") or {}
        opt = routing_result.get("optimizer") or {}
        if opt.get("solver") or opt.get("status"):
            log("  navigation_context.routing_result.optimizer present", True)
        else:
            log("  optimizer metadata present", len(opt) > 0)

    return all_ok


# ─── 6) POST /api/requests ────────────────────────────────────────────────
def check_requests(live: bool) -> bool:
    section("6) POST /api/requests")
    client, mode = get_client(live)
    if client is None:
        return False
    data, code = get_json(client, "POST", "/api/requests", json={
        "session_id": "compliance-test",
        "pathway": "pharmacy",
        "observable_summary": "Symptoms: headache. Duration: 24h. Risk: low.",
    })
    if code == 200 and isinstance(data, dict) and data.get("ok") is True:
        log("POST /api/requests", True)
        return True
    log("POST /api/requests", False)
    return False


# ─── 7) Summary ──────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="KLARA OS system compliance script")
    parser.add_argument("--live", action="store_true", help="Test against live server at http://127.0.0.1:8000")
    args = parser.parse_args()
    live = args.live

    print("KLARA OS — System compliance run")
    print("Repo root:", REPO_ROOT)
    print("Live server:", live)

    results = []
    results.append(("Environment", check_env()))
    results.append(("Imports", check_imports()))
    results.append(("Static assets", check_static()))
    results.append(("API endpoints", check_api(live)))
    results.append(("Assess pipeline", check_assess(live)))
    results.append(("POST /api/requests", check_requests(live)))

    section("Summary")
    for name, ok in results:
        log(f"{name}: {'PASS' if ok else 'FAIL'}", ok)
    passed = sum(1 for _, ok in results if ok)
    total = len(results)
    print(f"\nResult: {passed}/{total} checks passed.")
    if passed < total:
        sys.exit(1)
    print("System compliance OK.")
    sys.exit(0)


if __name__ == "__main__":
    main()
