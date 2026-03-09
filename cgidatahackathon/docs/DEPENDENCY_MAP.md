# KLARA OS — Dependency Map & Single-Pathway Assumptions

This document identifies optimization models, routing logic, pathway definitions, UI usage, LangGraph nodes, API routes, and **what would break** if pathway output changed from a **single primary pathway** to a **sequence of stages**.

---

## 1. Optimization models

| File | What it defines |
|------|-----------------|
| **`klara_core/optimization.py`** | Single optimization model: Gurobi (`_solve_with_gurobi`), PuLP (`_solve_with_pulp`), rule fallback (`_solve_rule_fallback`). All enforce **exactly one** chosen pathway via binary variables and constraint `sum(x[p]) == 1`. |
| **`klara_core/routing_engine.py`** | No optimization model; calls `optimize_pathways()` and maps result to `primary_pathway` + `options`. |

**Model contract:** `optimize_pathways()` returns `primary` (one string) and `alternatives` (list). The model is **single-pathway**: one primary, optional alternatives for display only.

---

## 2. Routing engine logic

| File | Role |
|------|------|
| **`klara_core/routing_engine.py`** | `route_care()`: emergency bypass → 811; else builds costs via `_build_preference_adjustments()`, calls `optimize_pathways()`, then returns `primary_pathway`, `reason`, `options`, `optimizer` dict. Assumes `result["primary"]` is a **single** pathway ID. |
| **`klara_core/optimization.py`** | `optimize_pathways()`: builds costs, runs Gurobi/PuLP/rule, returns `primary`, `alternatives`, `pathway_ranking`, `pathway_costs`, solver metadata. |

**Assumption:** Routing output is **one primary pathway** plus a list of **alternative options** (for UI choice). There is no notion of a **sequence of stages** (e.g. “first 811, then urgent if needed”).

---

## 3. Pathway definitions

| File | Constant / source | Purpose |
|------|-------------------|--------|
| **`klara_core/optimization.py`** | `PATHWAYS` | Canonical list for cost keys and feasible filter. |
| **`klara_core/routing_engine.py`** | `CANONICAL_PATHWAYS` | Same set; used for preference adjustments and capacities. |
| **`klara_core/eligibility_engine.py`** | `CANONICAL_PATHWAYS` | Same set; used in `resolve_pathway_eligibility()`. |
| **`klara_core/provincial_context.py`** | `available_pathways` (hardcoded list) | Same logical set; returned in provincial context. |
| **`main.py`** | `PATHWAY_URLS`, `PATHWAY_SEARCH_TERMS`, `NS_LOCATIONS`, `SERVICE_DIRECTORY` | Human-readable names, URLs, and location data keyed by pathway ID. |

Pathway IDs used: `virtualcarens`, `pharmacy`, `primarycare`, `urgent`, `811`, `emergency`, `mental_health`, `community_health`.

---

## 4. UI components using pathway outputs

| File | What uses pathway/optimizer output |
|------|------------------------------------|
| **`static/user.js`** | `data.routing_recommendation.primary_pathway` → hero service name; `data.routing_recommendation.reason` → hero explanation; `data.routing_recommendation.options` → option cards; `data.pathway_urls[primary]`, `pathway_urls[opt]` → labels/links; `CLINICAL_HERO_REASON[primary]`; `optData.pathway_ranking` / `data.routing_recommendation.options` → LP ranking; `state.assessData.pathway_urls[pathway]` in dashboard. |
| **`static/index.html`** | `#result-pathway`, `#result-reason`, `#options-list` — structure for **one** primary + list of options. |
| **`static/admin.js`** | `data.routing_recommendation.primary_pathway` → pathway pill; `data.routing_recommendation.reason`; `data.routing_recommendation.options` → option tags; `data.structured_summary.recommended_pathway`; governance metrics use `/admin/metrics` (telemetry counts by pathway, not optimizer output). |

All UIs assume **one** primary pathway and **one** “recommended” path; options are displayed as alternatives the user can choose.

---

## 5. LangGraph-style nodes (decision pipeline)

| File | Node / stage | Uses route_care / optimizer output? |
|------|--------------|-------------------------------------|
| **`klara_core/graph/decision_graph.py`** | `user_input` → `symptom_parser` → `risk_engine` → `eligibility_engine` → `routing_engine` → `optimization` (logical; optimization runs inside routing) → `summary_builder` → `recommendation` | Yes. Reads `routing_output["primary_pathway"]` and `routing_output["options"]` for 811 substitution, then passes **single** `routing_output["primary_pathway"]` to `build_summary()`. Returns `stages_executed` (list of stage names) for UI only — not a sequence of pathway stages. |

So the “graph” is a **linear pipeline** that produces **one** routing recommendation (one primary pathway). The **stages** are pipeline steps (symptom_parser, risk_engine, …), not a sequence of pathways.

---

## 6. API routes that expose optimizer results

| Route | What exposes optimizer/pathway output |
|-------|---------------------------------------|
| **`POST /assess`** | Full `AssessResponse`: `routing_recommendation` (primary_pathway, reason, options), `pathway_urls` (filtered by `routing_output["options"]`), `frontend_output.pathway`, `structured_summary.recommended_pathway`, `navigation_context.routing_result` (primary, alternatives, optimizer). |
| **`GET /api/pathway-urls`** | All pathway IDs → name/url; used by UI to resolve primary and options to labels/links. |
| **`GET /api/nearby?pathway=...`** | Single pathway ID; returns maps + locations for that pathway. |
| **`GET /admin/metrics`** | Telemetry counts by pathway (routing_counts); not the optimizer result of one request. |

Only **`POST /assess`** returns the optimizer result for a given request; the rest use pathway IDs as keys.

---

## 7. Dependency map: who relies on `optimize_pathways()` and `route_care()` outputs

```
optimize_pathways()  [returns: primary, alternatives, pathway_ranking, pathway_costs, solver, status, ...]
    ↑
    │ only caller
    │
route_care()  [returns: primary_pathway, reason, options, optimizer]
    ↑
    ├── klara_core/graph/decision_graph.py  → uses primary_pathway, options (811 swap); passes primary_pathway to build_summary()
    │
    └── (decision_graph called by main.py)
            ↑
main.py assess_patient()
    ├── routing_recommendation.primary_pathway  → RoutingRecommendation, frontend_output, nav_ctx, pathway_urls filter, build_optimization_explanation()
    ├── routing_recommendation.options         → RoutingRecommendation, frontend_output.alternative_pathways_to_consider, pathway_urls filter
    ├── routing_output["optimizer"]           → navigation_context.routing_result.optimizer, build_optimization_explanation()
    └── summary_builder(build_summary)         → receives single recommended_pathway = routing_output["primary_pathway"]
```

**Direct callers of `route_care()`:**  
- `klara_core/graph/decision_graph.py` (both emergency and non-emergency branches).

**Direct caller of `optimize_pathways()`:**  
- `klara_core/routing_engine.py` inside `route_care()`.

**Consumers of routing output (single primary + options):**

- **Backend:** `main.py` (AssessResponse, pathway_urls, nav_ctx, optimization_explanation), `decision_graph.py` (811 swap, summary).
- **Schemas:** `klara_data/schemas.py` — `RoutingRecommendation(primary_pathway: str, options: List[str])`, `StructuredSummary(recommended_pathway: str)`, `FrontendOutput(pathway: str, alternative_pathways_to_consider: List)`.
- **User UI:** `static/user.js` (hero, option cards, ranking, dashboard), `static/index.html` (result-pathway, result-reason, options-list).
- **Admin UI:** `static/admin.js` (routing card, structured summary).
- **Tests/scripts:** `scripts/run_trial.py`, `scripts/run_compliance.py` (primary_pathway, options, pathway_urls, optimizer).
- **Docs/schema:** `docs/optimization_output_schema.json`, `docs/INTAKE_UI_ARCHITECTURE_ANALYSIS.md`, `HANDOFF_CHECKLIST.md`.
```

---

## 8. What would break if pathway output became a “sequence of stages”

If the optimizer or routing engine changed from **“one primary pathway + alternatives”** to a **“sequence of stages”** (e.g. ordered list of pathway IDs or stage types), the following would break or need change.

### 8.1 Backend (would break or need refactor)

| Location | Current assumption | Effect of “sequence of stages” |
|----------|--------------------|---------------------------------|
| **`routing_engine.py`** | `primary_pathway = result["primary"]` (one string); `options = [primary_pathway] + result.get("alternatives", [])` | Expects single `primary`. If result were a sequence, would need a new contract (e.g. `result["sequence"]` or `result["stages"]`) and a rule for “primary” (e.g. first stage). |
| **`optimization.py`** | Model chooses **one** pathway (binary vars, sum == 1). Returns `primary`, `alternatives`. | Model itself would need redesign (e.g. multi-step or sequence variables). All callers expect one primary. |
| **`decision_graph.py`** | `primary = routing_output["primary_pathway"]`; passes **one** pathway to `build_summary(..., recommended_pathway)`. | Summary builder and 811 substitution logic assume one “current” pathway. Would need definition of “primary” from sequence (e.g. first, or “current step”). |
| **`main.py`** | Builds `RoutingRecommendation(primary_pathway=..., options=...)`, `pathway_urls` from `routing_output["options"]`, `frontend_output.pathway`, `structured_summary.recommended_pathway`, `routing_result.primary`. | Every assignment from `routing_output["primary_pathway"]` and `routing_output["options"]` assumes one primary + list of options. Would need new schema and response shape. |
| **`summary_builder.py`** | `build_summary(..., recommended_pathway: str)`; `build_optimization_explanation(..., primary_pathway: str, ...)`. | Both take a **single** pathway. Would need to accept a sequence and define what to show (e.g. first stage, or concatenated). |
| **`klara_data/schemas.py`** | `RoutingRecommendation(primary_pathway: str, options: List[str])`; `StructuredSummary(recommended_pathway: str)`; `FrontendOutput(pathway: str, alternative_pathways_to_consider: List)`. | Pydantic and API contract assume one primary. Would need new fields (e.g. `pathway_sequence: List[str]`) and/or deprecation of `primary_pathway` / `recommended_pathway`. |

### 8.2 UI (would break or need refactor)

| Location | Current assumption | Effect of “sequence of stages” |
|----------|--------------------|---------------------------------|
| **`static/user.js`** | One `primary` for hero (pathway name, clinical reason); `options` as alternative cards; one “chosen” pathway for submit. | Hero and “Choose this option” flow assume one primary and N alternatives. Would need new design: e.g. show sequence as steps, and define what “chosen pathway” means (first stage? last? user picks one step?). |
| **`static/index.html`** | One `#result-pathway` and one `#result-reason`; one `#options-list` for alternatives. | Layout is “one recommendation + options”. A sequence would need a different layout (e.g. timeline or step list). |
| **`static/admin.js`** | One `primary_pathway` in pathway pill; `options` as tags; `structured_summary.recommended_pathway` in summary card. | Same single-primary assumption. Would need to show sequence and possibly new fields from API. |

### 8.3 API and clients

| Location | Current assumption | Effect of “sequence of stages” |
|----------|--------------------|---------------------------------|
| **`POST /assess` response** | `routing_recommendation.primary_pathway` (string), `routing_recommendation.options` (list). | Any client that parses `primary_pathway` or treats first element of `options` as “main” would break or need updates. |
| **`pathway_urls`** | Filtered by `routing_output["options"]` (list of pathway IDs). | If response had a sequence, would need a rule for which pathway IDs to include in `pathway_urls`. |
| **`/api/nearby?pathway=`** | Single pathway. | Could stay as-is if “sequence” is used only for recommendation; map could still show one pathway at a time. |

### 8.4 Tests and docs

| Location | Current assumption | Effect of “sequence of stages” |
|----------|--------------------|---------------------------------|
| **`scripts/run_compliance.py`** | Expects `routing_recommendation.primary_pathway`, `routing_recommendation.options`, `pathway_urls`, required response keys. | Would need updated expectations (e.g. `pathway_sequence` or new primary rule). |
| **`scripts/run_trial.py`** | Same; checks `primary_pathway`, options, pathway_urls. | Same. |
| **`docs/optimization_output_schema.json`** | `primary_pathway` (single), `options` (array). | Schema would need a new structure for sequence (e.g. `pathway_sequence: array`) and/or revised required fields. |

---

## 9. Summary table: dependency on single-pathway output

| Component | Depends on `primary_pathway` (single) | Depends on `options` (list) | Would break if replaced by sequence? |
|-----------|--------------------------------------|----------------------------|--------------------------------------|
| optimization.py | ✅ result["primary"] | ✅ alternatives | Yes (model and return shape) |
| routing_engine.py | ✅ primary_pathway | ✅ options | Yes |
| decision_graph.py | ✅ primary_pathway → summary | ✅ options (811 swap) | Yes |
| main.py | ✅ everywhere | ✅ pathway_urls, frontend | Yes |
| summary_builder.py | ✅ recommended_pathway | — | Yes |
| schemas.py | ✅ RoutingRecommendation, etc. | ✅ options | Yes |
| user.js | ✅ hero, CLINICAL_HERO_REASON, submit | ✅ option cards, ranking | Yes |
| index.html | ✅ result-pathway, result-reason | ✅ options-list | Yes |
| admin.js | ✅ pathway pill, summary | ✅ option tags | Yes |
| run_trial / run_compliance | ✅ primary_pathway, options | ✅ pathway_urls | Yes |
| optimization_output_schema.json | ✅ primary_pathway | ✅ options | Yes |

**Conclusion:** The system is built end-to-end on **one primary pathway plus a list of alternative options**. Changing to a **sequence of stages** (pathways or otherwise) would require coordinated changes in the optimization model, routing_engine, decision_graph, main.py, schemas, all pathway-consuming UI, and tests/docs. The dependency map above lists every place that would need to be updated or redesigned.
