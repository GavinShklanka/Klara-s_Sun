"""
KLARA OS — System Impact Metrics Engine.

Estimates ER visits avoided, cost savings, system strain from routing outcome.
Read-only from routing result; does not modify routing contract.
"""

from __future__ import annotations

from typing import Any, Dict


# Approximate cost delta (CAD) vs ED visit for non-ED pathways
PATHWAY_COST_SAVINGS_VS_ED = {
    "virtualcarens": 380,
    "pharmacy": 320,
    "primarycare": 280,
    "community_health": 300,
    "mental_health": 290,
    "urgent": 120,
    "811": 350,
    "emergency": 0,
}


def compute_system_impact(
    primary_pathway: str,
    risk_level: str,
    optimizer: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """
    Compute system impact metrics from routing outcome.
    Attach to API response as optional system_impact. No contract change.
    """
    # ER visits avoided: 1 when we routed to non-ED and risk was not emergency
    er_visits_avoided = 0
    if risk_level != "emergency" and primary_pathway not in ("emergency", "811"):
        er_visits_avoided = 1

    # Cost savings estimate (CAD) vs hypothetical ED visit
    cost_savings_estimate = PATHWAY_COST_SAVINGS_VS_ED.get(
        primary_pathway, 200
    )

    # System strain score: lower is better; use optimizer objective if present
    obj = None
    if optimizer and "objective_value" in optimizer:
        obj = optimizer.get("objective_value")
    if obj is not None:
        try:
            system_strain_score = round(float(obj), 2)
        except (TypeError, ValueError):
            system_strain_score = 0.0
    else:
        system_strain_score = 0.13  # placeholder when no solver

    return {
        "er_visits_avoided": er_visits_avoided,
        "cost_savings_estimate": cost_savings_estimate,
        "system_strain_score": system_strain_score,
    }
