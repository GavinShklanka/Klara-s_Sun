"""
KLARA OS — Provincial Access Pressure Layer.

Computes demand pressure per infrastructure node from session/request data.
Used for map visualization (heatmap, congestion indicators) only.
Does not modify routing logic or API contracts.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List


def compute_node_pressure(
    requests: List[Dict[str, Any]],
    care_sequences: List[List[str]] | None = None,
) -> Dict[str, float]:
    """
    Compute per-node pressure scores from request and care-sequence data.

    Each request can have "pathway" (primary) and optionally "care_sequence".
    If care_sequence is provided (in requests or in care_sequences list), those
    node IDs receive weight. Otherwise pathway is expanded via healthcare_graph
    to get a sequence and nodes receive weight.

    Returns dict: node_id -> pressure_score in [0, 1] (normalized by max).
    """
    from klara_core.healthcare_graph import expand_sequence

    node_counts: Dict[str, float] = defaultdict(float)
    for i, req in enumerate(requests or []):
        seq = None
        if care_sequences and i < len(care_sequences):
            seq = care_sequences[i]
        if not seq and isinstance(req.get("care_sequence"), list):
            seq = req["care_sequence"]
        if not seq and req.get("pathway"):
            seq = expand_sequence(req["pathway"])
        if seq:
            for node_id in seq:
                node_counts[node_id] += 1.0

    if not node_counts:
        return {}
    max_count = max(node_counts.values())
    if max_count <= 0:
        return {k: 0.0 for k in node_counts}
    return {k: round(v / max_count, 2) for k, v in node_counts.items()}


def compute_node_pressure_from_routing(routing_counts: Dict[str, int]) -> Dict[str, float]:
    """
    Compute per-node pressure from routing decision counts (pathway -> count).
    Expands each pathway to a sequence and accumulates weight per node.
    Returns node_id -> pressure_score in [0, 1]. For map heatmap only.
    """
    from klara_core.healthcare_graph import expand_sequence

    node_counts: Dict[str, float] = defaultdict(float)
    for pathway, count in (routing_counts or {}).items():
        seq = expand_sequence(pathway)
        for node_id in seq:
            node_counts[node_id] += float(count)
    if not node_counts:
        return {}
    max_count = max(node_counts.values())
    if max_count <= 0:
        return {k: 0.0 for k in node_counts}
    return {k: round(v / max_count, 2) for k, v in node_counts.items()}
