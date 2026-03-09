# Care sequence extension — dependency scan & backward-compatible proposal

## 1. Full dependency scan

### 1.1 `optimize_pathways()`

| File | Usage |
|------|--------|
| **`klara_core/routing_engine.py`** | Only caller. Calls `optimize_pathways(risk_level, eligible_pathways, capacities, preference_adjustments)` and uses `result["primary"]`, `result.get("alternatives", [])`, `result.get("pathway_costs", {})`, `result.get("pathway_ranking", [])`. |

### 1.2 `route_care()`

| File | Usage |
|------|--------|
| **`klara_core/graph/decision_graph.py`** | Called in both emergency and non-emergency branches. Reads `routing_output["primary_pathway"]`, `routing_output["options"]`; does 811 substitution; passes `routing_output["primary_pathway"]` to `build_summary()`. |
| **`scripts/run_compliance.py`** | Imports `route_care` for compliance tests. |

### 1.3 `primary_pathway`

| File | Usage |
|------|--------|
| **`klara_core/routing_engine.py`** | Sets `primary_pathway = result["primary"]`; returns it in dict; emergency branch returns `"811"`. |
| **`klara_core/graph/decision_graph.py`** | `primary = routing_output["primary_pathway"]` for 811 swap; passes to `build_summary(..., routing_output["primary_pathway"])`. |
| **`main.py`** | `routing_output["primary_pathway"]` → `FrontendOutput.pathway`, `next_steps_for_patient`, `attach_context(routing_result.primary)`, `build_optimization_explanation(..., primary_pathway=...)`, `RoutingRecommendation.primary_pathway`, `pathway_urls` filter (via `routing_output["options"]`). |
| **`klara_data/schemas.py`** | `RoutingRecommendation.primary_pathway: str` (required). |
| **`static/user.js`** | `data.routing_recommendation.primary_pathway` → hero service name, `pathway_urls[primary]`, `CLINICAL_HERO_REASON[primary]`. |
| **`static/admin.js`** | `data.routing_recommendation.primary_pathway` → pathway pill. |
| **`scripts/run_trial.py`** | `rec.get("primary_pathway", "")`. |
| **`scripts/run_compliance.py`** | `rec.get("primary_pathway", "")`. |
| **`docs/optimization_output_schema.json`** | `primary_pathway` required. |
| **`HANDOFF_CHECKLIST.md`** | Documents `primary_pathway`. |

### 1.4 `pathway_ranking`

| File | Usage |
|------|--------|
| **`klara_core/optimization.py`** | Built as `[primary] + alternatives`; returned in result. |
| **`klara_core/routing_engine.py`** | Passes `result.get("pathway_ranking", [])` into returned `optimizer.pathway_ranking`. |
| **`static/user.js`** | `optData.pathway_ranking \|\| data.routing_recommendation?.options` for LP ranking panel. |
| **`docs/optimization_output_schema.json`** | Schema for `pathway_ranking`. |

### 1.5 `options`

| File | Usage |
|------|--------|
| **`klara_core/routing_engine.py`** | `options = [primary_pathway] + result.get("alternatives", [])`; returned in dict. |
| **`klara_core/graph/decision_graph.py`** | `routing_output["options"]` for 811 substitution. |
| **`main.py`** | `routing_output["options"]` → `RoutingRecommendation.options`, `FrontendOutput.alternative_pathways_to_consider` (options[1:3]), `pathway_urls` filter (`if k in routing_output["options"]`). |
| **`klara_data/schemas.py`** | `RoutingRecommendation.options: List[str]` (required). |
| **`static/user.js`** | `data.routing_recommendation.options` → option cards, ranking fallback. |
| **`static/admin.js`** | `data.routing_recommendation.options` → option tags. |
| **`scripts/run_trial.py`** | Checks `routing_recommendation.options`. |
| **`scripts/run_compliance.py`** | `opts = (data.get("routing_recommendation") or {}).get("options") or []`. |

---

## 2. Files that assume a single pathway result

All of the following assume **one** primary pathway (string) plus a list of alternative options:

| File | Assumption |
|------|------------|
| **`klara_core/optimization.py`** | Binary variables `x[p]`, constraint `sum(x) == 1`; returns single `primary`. |
| **`klara_core/routing_engine.py`** | `primary_pathway = result["primary"]`; single primary + options. |
| **`klara_core/graph/decision_graph.py`** | Single `routing_output["primary_pathway"]` passed to `build_summary()`. |
| **`klara_core/summary_builder.py`** | `build_summary(..., recommended_pathway: str)`; `build_optimization_explanation(..., primary_pathway: str, ...)`. |
| **`main.py`** | All uses of `routing_output["primary_pathway"]` and `routing_output["options"]` as single primary + list. |
| **`klara_data/schemas.py`** | `RoutingRecommendation(primary_pathway: str, options: List[str])`; `StructuredSummary(recommended_pathway: str)`; `FrontendOutput(pathway: str)`. |
| **`static/user.js`** | One hero pathway; options as alternative cards. |
| **`static/index.html`** | Single `#result-pathway`, `#result-reason`, `#options-list`. |
| **`static/admin.js`** | Single pathway pill; options as tags. |
| **`scripts/run_trial.py`** | `primary_pathway`, `options`. |
| **`scripts/run_compliance.py`** | `primary_pathway`, `options`, required response keys. |
| **`docs/optimization_output_schema.json`** | `primary_pathway` (string), `options` (array). |

---

## 3. Backward-compatible extension

### 3.1 Contract

- **`primary_pathway`** — unchanged. Still a single string: the recommended first (or only) care pathway. Must equal the first element of `care_sequence` when `care_sequence` is present.
- **`care_sequence`** — **new, optional**. Ordered list of stages, e.g. `["virtualcarens", "lab_test", "cardiology"]`. When absent or not implemented, consumers treat as “single step” (same as today).
- **`alternatives` / `options`** — unchanged. Still alternative **entry** pathways the user can choose instead of the primary.

Example response shape:

```json
{
  "primary_pathway": "virtualcarens",
  "care_sequence": ["virtualcarens", "lab_test", "cardiology"],
  "options": ["virtualcarens", "pharmacy", "community_health"]
}
```

Invariants:

- `primary_pathway === (care_sequence && care_sequence[0]) || primary_pathway`
- When `care_sequence` is omitted or empty, behavior is identical to today (single pathway).
- Existing UI and clients can ignore `care_sequence` and rely only on `primary_pathway` and `options`.

### 3.2 Schema changes

- **`RoutingRecommendation`**: add `care_sequence: Optional[List[str]] = None`. Keep `primary_pathway` and `options` required.
- **`AssessResponse`**: no change; it already contains `routing_recommendation`.
- **`navigation_context.routing_result`**: add optional `care_sequence`; keep `primary` and `alternatives`.

### 3.3 API response

- **`POST /assess`**: `routing_recommendation` includes `care_sequence` when the optimizer returns it; otherwise omit or set to `[primary_pathway]`.
- **`GET /api/pathway-urls`**: unchanged. Sequence stages (e.g. `lab_test`, `cardiology`) can be added later for UI links; existing keys remain.

---

## 4. Suggested changes to `optimization.py`

### 4.1 Keep existing single-pathway model

- Do **not** change the binary variable model: keep `x[p]`, `sum(x) == 1`, and `primary = chosen` so that `result["primary"]` is still a single pathway.
- All existing callers that use `result["primary"]` and `result.get("alternatives", [])` continue to work.

### 4.2 Add `care_sequence` to the return value

- After computing `primary` and `alternatives`, set  
  `care_sequence = [primary]` by default (single-step, backward compatible).
- Return `care_sequence` in the result dict so `routing_engine` and `main` can pass it through.

### 4.3 Optional: sequence builder (no breaking change)

- Add an optional helper, e.g. `_build_care_sequence(primary, symptoms, complaint_text, risk_level)`, that returns a list of stage IDs:
  - Always start with `primary`.
  - Optionally append downstream stages (e.g. `lab_test`, `cardiology`) based on rules or future model (e.g. symptom keywords, risk level). Use a fixed list of stage IDs (e.g. `lab_test`, `cardiology`, `imaging`) that are **not** required to be in `PATHWAYS` (entry pathways).
- Call this only when you want multi-step sequences; otherwise keep returning `care_sequence = [primary]`.
- Ensure `care_sequence[0] == primary` so that `primary_pathway` can always be derived as `care_sequence[0]` and existing logic remains valid.

### 4.4 Summary of optimization.py edits

1. After `pathway_ranking = [primary] + alternatives`, add:
   ```python
   care_sequence = [primary]  # default: single-step; extend later via _build_care_sequence()
   ```
2. Include `"care_sequence": care_sequence` in the returned dict.
3. (Optional) Implement `_build_care_sequence(primary, ...)` and set `care_sequence = _build_care_sequence(...)` when multi-step logic is enabled; otherwise keep `care_sequence = [primary]`.

This keeps `primary_pathway` and `options` semantics unchanged and adds a forward path for care sequences without breaking existing routing or UI.
