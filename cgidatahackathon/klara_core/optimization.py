"""
KLARA OS — Optimization Routing (Gurobi with PuLP fallback).
"""

from __future__ import annotations

import time
from typing import Dict, List

from klara_core.healthcare_graph import expand_sequence


PATHWAYS = [
    "virtualcarens",
    "pharmacy",
    "primarycare",
    "urgent",
    "emergency",
    "mental_health",
    "community_health",
]


def _base_costs() -> Dict[str, float]:
    # Combined proxy cost: system strain + wait pressure.
    return {
        "virtualcarens": 2.0,
        "pharmacy": 2.3,
        "primarycare": 3.0,
        "urgent": 4.8,
        "emergency": 9.8,
        "mental_health": 3.2,
        "community_health": 2.8,
    }


def _risk_penalty(risk_level: str, pathway: str) -> float:
    # Hard guardrails are still enforced via eligibility; this adds soft preferences.
    if risk_level == "urgent":
        if pathway in ["pharmacy", "community_health"]:
            return 8.0
        if pathway in ["virtualcarens", "mental_health"]:
            return 6.0
        if pathway == "primarycare":
            return 2.0
    # Strong penalty for ED when low/moderate acuity — avoid bottleneck, use local resources.
    if risk_level in ["low", "moderate"] and pathway == "emergency":
        return 15.0
    return 0.0


def _solve_with_gurobi(pathways: List[str], costs: Dict[str, float], capacities: Dict[str, int]):
    import gurobipy as gp
    from gurobipy import GRB

    m = gp.Model("klara_routing")
    m.setParam("OutputFlag", 0)
    x = {p: m.addVar(vtype=GRB.BINARY, name=f"x_{p}") for p in pathways}
    m.addConstr(gp.quicksum(x[p] for p in pathways) == 1, "one_pathway")
    for p in pathways:
        if capacities.get(p, 0) <= 0:
            m.addConstr(x[p] == 0, f"cap_{p}")
    m.setObjective(gp.quicksum(costs[p] * x[p] for p in pathways), GRB.MINIMIZE)
    m.optimize()

    if m.Status != GRB.OPTIMAL:
        return {"status": f"gurobi_{m.Status}", "primary": None}
    chosen = next((p for p in pathways if x[p].X > 0.5), None)
    return {"status": "optimal", "primary": chosen}


def _solve_with_pulp(pathways: List[str], costs: Dict[str, float], capacities: Dict[str, int]):
    import pulp

    prob = pulp.LpProblem("klara_routing", pulp.LpMinimize)
    x = pulp.LpVariable.dicts("x", pathways, cat="Binary")
    prob += pulp.lpSum(costs[p] * x[p] for p in pathways)
    prob += pulp.lpSum(x[p] for p in pathways) == 1
    for p in pathways:
        if capacities.get(p, 0) <= 0:
            prob += x[p] == 0
    prob.solve(pulp.PULP_CBC_CMD(msg=False))
    if pulp.LpStatus[prob.status] != "Optimal":
        return {"status": pulp.LpStatus[prob.status].lower(), "primary": None}
    chosen = next((p for p in pathways if pulp.value(x[p]) == 1), None)
    return {"status": "optimal", "primary": chosen}


def _solve_rule_fallback(pathways: List[str], costs: Dict[str, float]):
    if not pathways:
        return {"status": "no_feasible_pathway", "primary": "emergency"}
    return {"status": "rule_fallback", "primary": min(pathways, key=lambda p: costs[p])}


def optimize_pathways(
    risk_level: str,
    eligible_pathways: List[str],
    capacities: Dict[str, int],
    preference_adjustments: Dict[str, float] | None = None,
    policy_context: Dict | None = None,
):
    """
    Returns routing result with solver metadata while preserving behavior if optimizers are unavailable.
    Policy context may influence costs (e.g. MENTAL_HEALTH_PRIORITY) without changing contract.
    """
    start = time.time()
    feasible = [p for p in eligible_pathways if p in PATHWAYS]
    base = _base_costs()
    adjustments = dict(preference_adjustments or {})
    # Policy: mental health priority — reduce cost so pathway is preferred when policy applies
    if policy_context and "MENTAL_HEALTH_PRIORITY" in policy_context.get("applied_policies", []):
        adjustments["mental_health"] = adjustments.get("mental_health", 0.0) - 1.5
    costs = {
        p: base[p] + _risk_penalty(risk_level, p) + float(adjustments.get(p, 0.0))
        for p in PATHWAYS
    }

    solver_used = "rule"
    result = None

    try:
        result = _solve_with_gurobi(feasible, costs, capacities)
        if result.get("primary"):
            solver_used = "gurobi"
    except Exception:
        result = None

    if not result or not result.get("primary"):
        try:
            result = _solve_with_pulp(feasible, costs, capacities)
            if result.get("primary"):
                solver_used = "pulp"
        except Exception:
            result = None

    if not result or not result.get("primary"):
        result = _solve_rule_fallback(feasible, costs)
        solver_used = "rule"

    primary = result.get("primary") or "emergency"
    alternatives = [p for p in feasible if p != primary]
    alternatives = sorted(alternatives, key=lambda p: costs[p])[:2]

    # Pathway costs for LP model visualization (feasible pathways, ranked)
    pathway_costs = {p: round(costs[p], 2) for p in feasible}
    pathway_ranking = [primary] + alternatives

    # Care sequence from Nova Scotia healthcare graph (optional; default [primary])
    care_sequence = expand_sequence(primary)

    return {
        "status": result.get("status", "unknown"),
        "solver": solver_used,
        "primary": primary,
        "alternatives": alternatives,
        "care_sequence": care_sequence,
        "objective_value": float(costs.get(primary, 0.0)),
        "solve_time_ms": (time.time() - start) * 1000.0,
        "pathway_costs": pathway_costs,
        "pathway_ranking": pathway_ranking,
    }
