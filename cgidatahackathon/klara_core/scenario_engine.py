"""
KLARA OS — Scenario Simulation Engine.

Simulates health system planning scenarios: physician deployment, ER capacity change,
transport availability, demand spikes. Returns estimated effects for Command Center UI.
Does not modify routing contract or optimization logic.
"""

from __future__ import annotations

from typing import Any, Dict, List


def run_physician_scenario(
    region: str,
    additional_physicians: int,
    baseline_requests: int = 0,
) -> Dict[str, Any]:
    """
    Simulate adding physicians in a region (e.g. Cape Breton).
    Returns estimated patients_served, system_strain_change, er_overflow_reduction.
    """
    # Heuristic: each physician can serve ~N extra virtual/primary visits per day
    capacity_per_physician = 12
    extra_capacity = additional_physicians * capacity_per_physician
    patients_served = min(extra_capacity, max(baseline_requests, 50))
    # Strain reduction: more capacity → lower strain (0–1 scale)
    strain_reduction = min(0.25, 0.02 * additional_physicians)
    er_overflow_reduction = max(0, 0.05 * additional_physicians)
    return {
        "scenario": "physician_deployment",
        "region": region,
        "additional_physicians": additional_physicians,
        "estimated_patients_served": patients_served,
        "system_strain_change": round(-strain_reduction, 3),
        "er_overflow_reduction_pct": round(er_overflow_reduction * 100, 1),
        "notes": [f"Adding {additional_physicians} physicians in {region} estimated to serve ~{patients_served} additional patients and reduce ER overflow by ~{er_overflow_reduction * 100:.0f}%."],
    }


def run_er_capacity_scenario(
    region: str,
    capacity_change_pct: float,
    baseline_ed_visits: int = 0,
) -> Dict[str, Any]:
    """
    Simulate ER capacity change (e.g. reduce by 10% or add 20%).
    capacity_change_pct: negative = reduction, positive = increase.
    """
    # Heuristic effect on overflow and strain
    overflow_change = -capacity_change_pct / 100.0  # increase capacity → less overflow
    strain_change = -capacity_change_pct / 500.0  # modest strain impact
    return {
        "scenario": "er_capacity",
        "region": region,
        "capacity_change_pct": capacity_change_pct,
        "estimated_overflow_change": round(overflow_change, 3),
        "system_strain_change": round(strain_change, 3),
        "notes": [f"ER capacity change of {capacity_change_pct:+.0f}% in {region} estimated to affect overflow and system strain accordingly."],
    }


def run_demand_spike_scenario(
    region: str,
    demand_increase_pct: float,
) -> Dict[str, Any]:
    """Simulate demand spike (e.g. flu season)."""
    strain_increase = min(0.3, demand_increase_pct / 400.0)
    return {
        "scenario": "demand_spike",
        "region": region,
        "demand_increase_pct": demand_increase_pct,
        "system_strain_change": round(strain_increase, 3),
        "notes": [f"Demand increase of {demand_increase_pct:.0f}% in {region} estimated to increase system strain by ~{strain_increase * 100:.0f}%."],
    }


def run_transport_scenario(
    region: str,
    enable_transport: bool,
) -> Dict[str, Any]:
    """Simulate enabling municipal care transport (e.g. van routes)."""
    if not enable_transport:
        return {"scenario": "transport", "region": region, "enabled": False, "estimated_rural_access_improvement": 0, "notes": ["Transport disabled."]}
    return {
        "scenario": "transport",
        "region": region,
        "enabled": True,
        "estimated_rural_access_improvement": 0.15,
        "estimated_patients_served": 25,
        "notes": [f"Enabling municipal transport in {region} estimated to improve rural access by ~15% and serve ~25 additional patients."],
    }
