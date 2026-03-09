# Backend NavigationContext Integration Guide

**Purpose:** Show how to integrate the [NavigationContext schema](02-navigation-context-schema.md) into the cgidatahackathon FastAPI backend so the pipeline reads and writes the universal session object.

---

## 1. Add Pydantic models

Add a `navigation_context.py` (or extend `schemas.py`) with:

```python
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum

class RiskLevel(str, Enum):
    low = "low"
    moderate = "moderate"
    urgent = "urgent"
    emergency = "emergency"

class IntakeSummary(BaseModel):
    chief_complaint: str
    duration: Optional[str] = None
    symptoms: Optional[list[str]] = None
    relevant_history: Optional[str] = None
    red_flags_mentioned: Optional[list[str]] = None
    source: Optional[str] = "conversation"

class RiskAssessment(BaseModel):
    level: RiskLevel
    score: Optional[float] = None
    indicators: Optional[list[str]] = None
    is_emergency: bool
    rationale: Optional[str] = None

class PathwayEligibility(BaseModel):
    pathway_id: str
    pathway_name: Optional[str] = None
    eligible: bool
    reason: Optional[str] = None
    constraints: Optional[list[str]] = None

class RoutingResult(BaseModel):
    recommended_pathway_id: str
    alternatives: Optional[list[dict]] = None
    confidence: Optional[float] = None
    optimizer_metadata: Optional[dict] = None

class NavigationContext(BaseModel):
    schema_version: str = "1.0"
    session_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    intake_summary: Optional[IntakeSummary] = None
    risk_assessment: Optional[RiskAssessment] = None
    pathway_eligibility: Optional[list[PathwayEligibility]] = None
    routing_result: Optional[RoutingResult] = None
    response: Optional[dict] = None
    metadata: Optional[dict] = None
```

---

## 2. Refactor the pipeline

Have each step read from and write back to a single `NavigationContext` instance:

1. **symptom_parser** → writes `intake_summary`
2. **risk_engine** → writes `risk_assessment`, sets `is_emergency`
3. **routing_engine** → writes `routing_result` (and optionally `pathway_eligibility`)
4. **summary_builder** → writes `response`

Example:

```python
def run_pipeline(text: str, region: str) -> NavigationContext:
    ctx = NavigationContext(
        session_id=str(uuid.uuid4()),
        created_at=datetime.utcnow().isoformat(),
    )
    ctx.updated_at = datetime.utcnow().isoformat()

    # INTAKE
    parsed = symptom_parser.parse(text)
    ctx.intake_summary = IntakeSummary(
        chief_complaint=parsed.get("chief_complaint", text),
        symptoms=parsed.get("symptoms", []),
        duration=parsed.get("duration"),
    )

    # RISK_ASSESS
    risk = risk_engine.assess(ctx.intake_summary)
    ctx.risk_assessment = RiskAssessment(
        level=risk["level"],
        score=risk.get("score"),
        is_emergency=risk.get("emergency_flags") != [],
    )

    # ROUTING (ELIGIBILITY + ROUTING_OPT)
    routing = routing_engine.recommend(ctx)
    ctx.routing_result = RoutingResult(
        recommended_pathway_id=routing["primary_pathway"],
        alternatives=[{"pathway_id": o, "reason": ""} for o in routing.get("options", [])],
        confidence=routing.get("confidence", 0.9),
    )

    # RESPONSE_GEN
    ctx.response = summary_builder.build(ctx)

    return ctx
```

---

## 3. Expose `/assess` and `/agentic-rag`

- **`/assess`** — Keep current contract; internally build a NavigationContext and return a response compatible with the existing front-end.
- **`/agentic-rag`** (optional) — New endpoint that accepts `{ pathway, intake_summary, risk_assessment }` and returns pathway-specific guidance (RAG output). This enables true per-pathway Agentic RAG on the front-end.

---

## 4. Align response with front-end

The UI expects `response` in this shape (see spec 02):

- `pathway`, `navigation_summary`, `next_steps_for_patient`, `questions_for_clinician`, `information_to_prepare`, `safety_reminders`, `escalation_conditions`, `alternative_pathways_to_consider`, `confidence`, `sources`

Map `routing_recommendation`, `structured_summary`, and `governance` into this schema for backward compatibility, or return `ctx.response` directly if you adopt NavigationContext fully.

---

## Status

- **Version:** 1.0  
- **Repo:** Use this as reference when refactoring [cgidatahackathon](https://github.com/nkriznar/cgidatahackathon).
