"""
KLARA OS — Nova Scotia Healthcare Network Graph.

Expands the selected primary pathway into a care sequence using the real NS
infrastructure dataset. Does not alter the optimizer contract.

Defines: HealthcareNode, HealthcareGraph.
Functions: load_nodes(), expand_sequence(primary_pathway).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass
class HealthcareNode:
    """A healthcare service node (type + optional instance data)."""
    id: str
    type: str  # telehealth | hospital | pharmacy | lab | imaging | specialist | mental_health | community_health | transport
    name: str
    region: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    services: Optional[List[str]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class HealthcareGraph:
    """
    In-memory graph of healthcare nodes and optional transitions.
    Used to expand primary_pathway into a care_sequence using the NS infrastructure dataset.
    """

    def __init__(
        self,
        nodes: Optional[List[HealthcareNode]] = None,
        pathway_sequences: Optional[Dict[str, List[str]]] = None,
    ):
        self._nodes: Dict[str, HealthcareNode] = {}
        for n in nodes or []:
            self._nodes[n.id] = n
        self._pathway_sequences = pathway_sequences or {}

    def add_node(self, node: HealthcareNode) -> None:
        self._nodes[node.id] = node

    def get_node(self, node_id: str) -> Optional[HealthcareNode]:
        return self._nodes.get(node_id)

    def expand_sequence(self, primary_pathway: str, max_steps: int = 5) -> List[str]:
        """
        Expand primary pathway into an ordered care sequence using the NS infrastructure.
        Returns at least [primary_pathway]; appends node IDs when a sequence is defined.
        Default: return [primary_pathway].
        """
        sequence = self._pathway_sequences.get(primary_pathway)
        if not sequence:
            return [primary_pathway]
        out: List[str] = []
        for node_id in sequence[:max_steps]:
            if node_id not in out:
                out.append(node_id)
        return out if out else [primary_pathway]


def _dataset_path() -> Path:
    """Resolve path to klara_data/ns_healthcare_nodes.json."""
    return Path(__file__).resolve().parent.parent / "klara_data" / "ns_healthcare_nodes.json"


def load_pathway_sequences() -> Dict[str, List[str]]:
    """Load pathway → sequence of node IDs from ns_healthcare_nodes.json if present."""
    path = _dataset_path()
    if not path.exists():
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}
    return dict(data.get("pathway_sequences") or {})


def load_nodes() -> List[HealthcareNode]:
    """
    Load Nova Scotia healthcare nodes from klara_data/ns_healthcare_nodes.json.
    Returns list of HealthcareNode; used for map visualization and sequence generation.
    """
    path = _dataset_path()
    if not path.exists():
        return []
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return []
    raw = data.get("nodes") or []
    nodes: List[HealthcareNode] = []
    for r in raw:
        if not isinstance(r, dict) or "id" not in r:
            continue
        nodes.append(
            HealthcareNode(
                id=str(r["id"]),
                type=str(r.get("type", "unknown")),
                name=str(r.get("name", r["id"])),
                region=r.get("region"),
                lat=float(r["lat"]) if r.get("lat") is not None else None,
                lon=float(r["lon"]) if r.get("lon") is not None else None,
                services=r.get("services"),
                metadata={k: v for k, v in r.items() if k not in ("id", "type", "name", "region", "lat", "lon", "services")},
            )
        )
    return nodes


def _default_pathway_sequences(nodes_by_id: Dict[str, HealthcareNode]) -> Dict[str, List[str]]:
    """
    Build pathway → sequence of node IDs using loaded NS nodes.
    virtualcarens → lab → hospital; pharmacy → primary_care; community_health → mental_health.
    """
    seq: Dict[str, List[str]] = {}
    # virtualcarens → lab → hospital (use first lab and first major hospital if present)
    lab_ids = [n.id for n in nodes_by_id.values() if n.type == "lab"]
    hospital_ids = [n.id for n in nodes_by_id.values() if n.type == "hospital"]
    if lab_ids and hospital_ids:
        seq["virtualcarens"] = ["virtualcarens", lab_ids[0], hospital_ids[0]]
    # pharmacy → primary_care (use first pharmacy and first community_health or primary-care-like)
    pharmacy_ids = [n.id for n in nodes_by_id.values() if n.type == "pharmacy"]
    primary_ids = [n.id for n in nodes_by_id.values() if n.type in ("community_health", "primary_care")]
    if pharmacy_ids and primary_ids:
        seq["pharmacy"] = ["pharmacy", pharmacy_ids[0], primary_ids[0]]
    elif pharmacy_ids:
        seq["pharmacy"] = ["pharmacy", pharmacy_ids[0]]
    # community_health → mental_health
    ch_ids = [n.id for n in nodes_by_id.values() if n.type == "community_health"]
    mh_ids = [n.id for n in nodes_by_id.values() if n.type == "mental_health"]
    if ch_ids and mh_ids:
        seq["community_health"] = ["community_health", ch_ids[0], mh_ids[0]]
    elif ch_ids:
        seq["community_health"] = ["community_health", ch_ids[0]]
    return seq


_default_graph: Optional[HealthcareGraph] = None


def _get_graph() -> HealthcareGraph:
    global _default_graph
    if _default_graph is None:
        nodes = load_nodes()
        nodes_by_id = {n.id: n for n in nodes}
        pathway_sequences = load_pathway_sequences()
        if not pathway_sequences:
            pathway_sequences = _default_pathway_sequences(nodes_by_id)
        _default_graph = HealthcareGraph(nodes=nodes, pathway_sequences=pathway_sequences)
    return _default_graph


def expand_sequence(primary_pathway: str, max_steps: int = 5) -> List[str]:
    """
    Expand primary pathway into a care sequence using the Nova Scotia infrastructure dataset.

    Example rules:
      virtualcarens → lab → hospital
      pharmacy      → primary_care
      community_health → mental_health

    Default: return [primary_pathway] so existing behavior remains unchanged.
    """
    graph = _get_graph()
    return graph.expand_sequence(primary_pathway, max_steps=max_steps)
