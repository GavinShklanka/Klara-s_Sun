"""
KLARA OS — LangGraph-style decision pipeline orchestration.

Orchestrates the existing engines in order:
  symptom_parser → risk_engine → eligibility_engine → routing_engine
  (routing uses optimization internally) → summary_builder

Returns the full result plus stage names for UI visualization.
"""

from __future__ import annotations

from typing import Any

from klara_core.symptom_parser import parse_symptoms
from klara_core.risk_engine import risk_score
from klara_core.provincial_context import load_provincial_context
from klara_core.agentic_rag import retrieve_rag_context
from klara_core.eligibility_engine import resolve_pathway_eligibility
from klara_core.policy_engine import evaluate_policies
from klara_core.routing_engine import route_care
from klara_core.summary_builder import build_summary
from klara_core.navigation_context import (
    new_navigation_context,
    attach_intake,
    attach_risk,
    attach_context,
)


STAGE_NAMES = [
    "user_input",
    "symptom_parser",
    "risk_engine",
    "eligibility_engine",
    "routing_engine",
    "optimization",
    "summary_builder",
    "recommendation",
]


def run_decision_pipeline(
    text: str,
    region: str,
    symptom_selections: list[str] | None = None,
    opor_context: dict | None = None,
) -> tuple[dict[str, Any], list[str]]:
    """
    Run the full healthcare routing pipeline.

    Pipeline order:
      user_input → symptom_parser → risk_engine → [if emergency: escalate] else:
      → eligibility_engine → routing_engine (uses optimization) → summary_builder → recommendation

    Returns:
      (result_dict, stages_executed)
      - result_dict: full pipeline output for main.py to build AssessResponse
      - stages_executed: list of stage IDs for UI visualization
    """
    stages: list[str] = ["user_input"]
    symptom_selections = symptom_selections or []

    nav_ctx = new_navigation_context(text, region, opor_context)

    # ── Stage 1: Symptom parsing ──
    parsed = parse_symptoms(text)
    stages.append("symptom_parser")
    attach_intake(nav_ctx, parsed["symptoms"], parsed["duration_hours"])

    # ── Stage 2: Risk classification ──
    risk_output = risk_score(parsed["symptoms"])
    stages.append("risk_engine")
    attach_risk(nav_ctx, risk_output["score"], risk_output["level"], risk_output["emergency_flags"])

    # Emergency branch: escalate (routing_engine handles 811)
    if risk_output["level"] == "emergency":
        prov_ctx = load_provincial_context(region, risk_output["level"])
        pathway_eligibility = resolve_pathway_eligibility(
            parsed["symptoms"],
            risk_output["level"],
            prov_ctx["available_pathways"],
        )
        stages.append("eligibility_engine")
        policy_output = evaluate_policies(
            risk_output["level"],
            region,
            ["811", "urgent"],
            prov_ctx.get("capacity_snapshot"),
            parsed["symptoms"],
        )
        stages.append("routing_engine")
        stages.append("optimization")
        routing_output = route_care(
            risk_output["level"],
            region,
            eligible_pathways=["811", "urgent"],
            capacity_snapshot=prov_ctx["capacity_snapshot"],
            symptoms=parsed["symptoms"],
            complaint_text=parsed["text"],
            duration_hours=parsed["duration_hours"],
            policy_context=policy_output,
        )
        rag_context = retrieve_rag_context(parsed["text"], parsed["symptoms"], symptom_selections)
    else:
        # ── Stage 3: Provincial context + Eligibility ──
        prov_ctx = load_provincial_context(region, risk_output["level"])
        rag_context = retrieve_rag_context(parsed["text"], parsed["symptoms"], symptom_selections)
        pathway_eligibility = resolve_pathway_eligibility(
            parsed["symptoms"],
            risk_output["level"],
            prov_ctx["available_pathways"],
        )
        stages.append("eligibility_engine")
        eligible_pathways = [p["pathway_id"] for p in pathway_eligibility if p["eligible"]]

        # ── Policy governance (after eligibility, before routing) ──
        policy_output = evaluate_policies(
            risk_output["level"],
            region,
            eligible_pathways,
            prov_ctx.get("capacity_snapshot"),
            parsed["symptoms"],
        )

        # ── Stage 4: Routing (includes optimization internally) ──
        stages.append("routing_engine")
        stages.append("optimization")
        routing_output = route_care(
            risk_output["level"],
            region,
            eligible_pathways=eligible_pathways,
            capacity_snapshot=prov_ctx["capacity_snapshot"],
            symptoms=parsed["symptoms"],
            complaint_text=parsed["text"],
            duration_hours=parsed["duration_hours"],
            policy_context=policy_output,
        )

    # Human-in-loop: Replace emergency with 811
    options = list(routing_output["options"])
    primary = routing_output["primary_pathway"]
    if "emergency" in options:
        options = ["811" if p == "emergency" else p for p in options]
        options = list(dict.fromkeys(options))
    if primary == "emergency":
        primary = "811"
    routing_output = {**routing_output, "primary_pathway": primary, "options": options}

    # ── Stage 5: Summary builder ──
    stages.append("summary_builder")
    summary_output = build_summary(
        parsed["symptoms"],
        parsed["duration_hours"],
        risk_output["level"],
        routing_output["primary_pathway"],
    )

    stages.append("recommendation")

    result = {
        "nav_ctx": nav_ctx,
        "parsed": parsed,
        "risk_output": risk_output,
        "prov_ctx": prov_ctx,
        "pathway_eligibility": pathway_eligibility,
        "rag_context": rag_context,
        "routing_output": routing_output,
        "summary_output": summary_output,
    }

    return result, stages
