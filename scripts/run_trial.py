#!/usr/bin/env python3
"""
KLARA OS — Trial script to test all features.

Run from cgidatahackathon:
  python scripts/run_trial.py

With live server on port 8000:
  python scripts/run_trial.py --live

Tests all features:
- Patient view, Admin view, static assets
- GET: /api/pathway-urls, /api/symptoms, /api/nearby, /api/requests, /api/status
- POST: /assess (low, moderate, emergency, RAG symptom_selections)
- POST: /api/requests
- Business rules: emergency->811, no ED in low-acuity, pathway_urls, optimizer
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

try:
    import httpx
except ImportError:
    httpx = None

BASE_URL = "http://127.0.0.1:8000"


def req(method: str, path: str, **kwargs):
    """Make HTTP request. Use TestClient if no live server / httpx."""
    if httpx:
        with httpx.Client(base_url=BASE_URL, timeout=15.0) as c:
            r = c.request(method, path, **kwargs)
            try:
                return r.json(), r.status_code
            except Exception:
                return None, r.status_code
    # Fallback: TestClient (no server needed)
    try:
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)
        if method.upper() == "GET":
            r = client.get(path)
        else:
            r = client.post(path, **kwargs)
        try:
            return r.json(), r.status_code
        except Exception:
            return None, r.status_code
    except Exception as e:
        print(f"  [FAIL] Client error: {e}")
        return None, 0


def section(name: str) -> None:
    print(f"\n{'='*60}\n{name}\n{'='*60}")


def ok(msg: str, cond: bool) -> bool:
    print(f"  {'[PASS]' if cond else '[FAIL]'} {msg}")
    return cond


def main() -> None:
    parser = argparse.ArgumentParser(description="KLARA OS trial script")
    parser.add_argument("--live", action="store_true", help="Test against live server at :8000")
    args = parser.parse_args()
    live = args.live

    if live and not httpx:
        print("Install httpx for --live: pip install httpx")
        sys.exit(1)

    print("KLARA OS — Trial script (all features)")
    print("Mode:", "LIVE" if live else "TestClient (no server)")
    passed = 0
    total = 0

    # ─── 1) Views & static ─────────────────────────────────────────────────
    section("1) Views & static")
    for path, label in [("/", "Patient view"), ("/admin", "Admin view"), ("/static/user.css", "Static CSS")]:
        data, code = req("GET", path)
        total += 1
        if ok(label, code == 200):
            passed += 1

    # ─── 2) API GET ────────────────────────────────────────────────────────
    section("2) API GET endpoints")
    for path, label, check in [
        ("/api/pathway-urls", "Pathway URLs", lambda d: isinstance(d, dict) and "pharmacy" in d),
        ("/api/symptoms?complaint=back+pain", "Symptoms (back pain)", lambda d: isinstance(d, dict) and "symptoms" in d),
        ("/api/nearby?pathway=pharmacy&region=Halifax&town=Dartmouth", "Nearby (pharmacy)", lambda d: isinstance(d, dict) and "maps_search_url" in d and "locations" in d),
        ("/api/requests", "Requests list", lambda d: isinstance(d, dict) and "requests" in d),
        ("/api/status/test-session-123", "Status (session)", lambda d: isinstance(d, dict) and "session_id" in d),
    ]:
        data, code = req("GET", path)
        total += 1
        if ok(label, code == 200 and (check(data) if data else False)):
            passed += 1

    # ─── 3) POST /assess — low acuity ──────────────────────────────────────
    section("3) POST /assess — low acuity (back pain)")
    data, code = req("POST", "/assess", json={
        "text": "Back pain and stiffness for 3 days. Annapolis Valley.",
        "region": "Halifax",
    })
    total += 1
    low_ok = code == 200 and data and "emergency" not in (data.get("routing_recommendation") or {}).get("options", [])
    if ok("Low acuity: no emergency in options", low_ok):
        passed += 1
    total += 1
    if ok("Low acuity: pathway_urls present", code == 200 and data and bool(data.get("pathway_urls"))):
        passed += 1

    # ─── 4) POST /assess — moderate ────────────────────────────────────────
    section("4) POST /assess — moderate (fever)")
    data, code = req("POST", "/assess", json={
        "text": "Fever and headache for 24 hours.",
        "region": "Cape Breton",
    })
    total += 1
    if ok("Moderate: 200 OK", code == 200):
        passed += 1

    # ─── 5) POST /assess — emergency → 811 HITL ────────────────────────────
    section("5) POST /assess — emergency (811 HITL)")
    data, code = req("POST", "/assess", json={
        "text": "Chest pain and shortness of breath for one hour.",
        "region": "Halifax",
    })
    rec = (data or {}).get("routing_recommendation") or {}
    opts = rec.get("options", [])
    primary = rec.get("primary_pathway", "")
    total += 1
    if ok("Emergency: primary = 811 (HITL)", code == 200 and primary == "811"):
        passed += 1
    total += 1
    if ok("Emergency: no ED in options", code == 200 and "emergency" not in opts):
        passed += 1

    # ─── 6) POST /assess — symptom_selections (RAG) ─────────────────────────
    section("6) POST /assess — symptom_selections (RAG signal)")
    data, code = req("POST", "/assess", json={
        "text": "Headache and nausea.",
        "region": "Halifax",
        "symptom_selections": ["Migraine", "Light sensitivity"],
    })
    total += 1
    if ok("symptom_selections accepted", code == 200):
        passed += 1

    # ─── 7) POST /api/requests ─────────────────────────────────────────────
    section("7) POST /api/requests")
    data, code = req("POST", "/api/requests", json={
        "session_id": "trial-test-session",
        "pathway": "pharmacy",
        "observable_summary": "Symptoms: headache. Duration: 24h. Risk: low.",
    })
    total += 1
    if ok("Request submitted", code == 200 and data and data.get("ok") is True):
        passed += 1

    # ─── 8) Optimizer metadata ─────────────────────────────────────────────
    section("8) Optimizer / Gurobi metadata")
    data, code = req("POST", "/assess", json={"text": "Mild cough.", "region": "Halifax"})
    nav = (data or {}).get("navigation_context") or {}
    opt = (nav.get("routing_result") or {}).get("optimizer") or {}
    total += 1
    if ok("Optimizer present (solver/status)", bool(opt.get("solver") or opt.get("status"))):
        passed += 1

    # ─── Summary ───────────────────────────────────────────────────────────
    section("Summary")
    print(f"  {passed}/{total} trials passed.")
    if passed < total:
        print("\n  Some trials failed. Check output above.")
        sys.exit(1)
    print("\n  All trials passed.")
    sys.exit(0)


if __name__ == "__main__":
    main()
