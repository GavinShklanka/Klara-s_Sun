# Healthcare Graph — Future Integration Hooks

The Nova Scotia Healthcare Network Graph (`klara_core/healthcare_graph.py`) and service directory (`klara_data/ns_healthcare_nodes.json`) are designed so that the following features can be added **without changing the optimizer contract** (single-pathway selection, `primary_pathway`, `options`).

Do **not** implement these yet; this document only describes where and how they would plug in.

---

## 1. Demand intelligence clustering

- **Hook:** Extend `HealthcareGraph` or add a separate module that consumes `klara_data/ns_healthcare_nodes.json` and aggregates demand (e.g. by region, by node type, by time window).
- **Integration:** Clustering could feed into capacity or preference adjustments **before** `optimize_pathways()` (e.g. in `routing_engine._build_preference_adjustments` or in provincial context). It must not change the LP variables or the shape of `primary_pathway` / `options`.
- **Data:** Use `ns_healthcare_nodes.json` nodes (id, type, region, lat, lon) plus telemetry or external demand signals.

---

## 2. Patient transport coordination

- **Hook:** Add a `transport` node type and edges in the healthcare graph (e.g. from a facility to `transport` or from `transport` to another facility). Optionally load transport nodes from a separate JSON or from `ns_healthcare_nodes.json` (filter `type == "transport"`).
- **Integration:** `expand_sequence(primary_pathway)` could optionally append a `transport` stage when the next step is in a different region. Logic would live in `healthcare_graph.py` (e.g. region-aware expansion) and must not alter `optimize_pathways()` or the routing_engine return shape; only `care_sequence` may gain extra stages.

---

## 3. Physician deployment / VRPTW optimization

- **Hook:** Separate optimization (e.g. vehicle routing with time windows for physician deployment) could consume the same `ns_healthcare_nodes.json` (lat, lon, region, services) and optionally the care_sequence to plan routes. This would be a **separate** model and API, not a replacement for the pathway LP.
- **Integration:** The existing pathway optimizer remains unchanged. A future endpoint or job could take `care_sequence` and node list as input and return deployment/routing suggestions without touching `route_care()` or `AssessResponse`.

---

## 4. Service capacity weighting

- **Hook:** Weights or capacities per node (or per node type) could be loaded from `ns_healthcare_nodes.json` (e.g. a `capacity` or `weight` field) or from a separate capacity API.
- **Integration:** Capacity is already an input to `optimize_pathways()`. A future change could derive capacity or weights from the healthcare graph / NS nodes instead of (or in addition to) `capacity_snapshot`. This stays inside `routing_engine` and `optimization` as input only; the optimizer still returns a single `primary` and `alternatives`.

---

## 5. Travel time costs

- **Hook:** Use `lat`/`lon` from `ns_healthcare_nodes.json` to compute travel time or distance (e.g. from patient location or region centroid to each facility). Convert to a cost or penalty.
- **Integration:** Travel cost could be folded into `preference_adjustments` in `routing_engine._build_preference_adjustments()` so that the LP sees higher cost for farther options. No change to the LP structure or to the response fields `primary_pathway` / `options` / `care_sequence`.

---

## Invariant

All of the above must preserve:

- `optimize_pathways()` continues to select a **single** pathway (binary variables, one primary).
- `route_care()` continues to return `primary_pathway`, `options`, `optimizer`, and optionally `care_sequence`.
- `care_sequence` remains optional and backward compatible; when present, `care_sequence[0] == primary_pathway`.
