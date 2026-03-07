"""
KLARA OS — NavigationContext builder utilities.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_navigation_context(text: str, region: str, opor_context: Optional[Dict] = None) -> Dict:
    now = _iso_now()
    return {
        "schema_version": "1.0",
        "session_id": str(uuid.uuid4()),
        "created_at": now,
        "updated_at": now,
        "intake_summary": {
            "chief_complaint": text,
            "source": "conversation",
        },
        "risk_assessment": {},
        "pathway_eligibility": [],
        "rag_context": [],
        "routing_result": {},
        "response": {},
        "opor_context": opor_context or {},
        "metadata": {"region": region, "pipeline_version": "1.1.0"},
    }


def touch(ctx: Dict) -> None:
    ctx["updated_at"] = _iso_now()


def attach_intake(ctx: Dict, symptoms: List[str], duration_hours: int) -> None:
    ctx["intake_summary"].update({
        "symptoms": symptoms,
        "duration": f"{duration_hours} hours",
        "red_flags_mentioned": [s for s in symptoms if s in ["chest pain", "shortness of breath"]],
    })
    touch(ctx)


def attach_risk(ctx: Dict, score: int, level: str, emergency_flags: List[str]) -> None:
    ctx["risk_assessment"] = {
        "level": level,
        "score": score,
        "emergency_flags": emergency_flags,
    }
    touch(ctx)


def attach_context(ctx: Dict, pathway_eligibility: List[Dict], rag_context: List[Dict], routing_result: Dict, response: Dict) -> None:
    ctx["pathway_eligibility"] = pathway_eligibility
    ctx["rag_context"] = rag_context
    ctx["routing_result"] = routing_result
    ctx["response"] = response
    touch(ctx)

