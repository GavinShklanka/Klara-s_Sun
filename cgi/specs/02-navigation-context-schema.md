# 2️⃣ NavigationContext Schema — Universal Session Object

**Purpose:** One canonical schema for the “session” that flows through the entire system: intake → risk → RAG → routing → response. Every component reads from and writes to this object; there are no alternate session formats.

---

## Design principles

- **Single source of truth:** NavigationContext is the only object that carries session-scoped data between the conversational agent, RAG, and optimizer.
- **Structured + extensible:** Required fields are fixed; optional and vendor-specific fields live under `metadata` or `extensions`.
- **Idempotent-friendly:** Identifiers (`session_id`, `pathway_id`) support idempotent updates and replay.
- **FHIR-friendly where useful:** Where it aligns with NS digital health (e.g. OPOR), fields can map to FHIR resources; the schema itself stays product-agnostic.

---

## Top-level schema

```json
{
  "schema_version": "1.0",
  "session_id": "string (UUID or opaque id)",
  "created_at": "ISO 8601",
  "updated_at": "ISO 8601",

  "intake_summary": { ... },
  "risk_assessment": { ... },
  "pathway_eligibility": [ ... ],
  "rag_context": [ ... ],
  "routing_result": { ... },
  "response": { ... },
  "opor_context": { ... },

  "metadata": { ... }
}
```

---

## 1. `intake_summary`

What we know about the patient/case from the conversation or form.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chief_complaint` | string | Yes | Primary reason for contact (normalized text). |
| `duration` | string | No | E.g. "2–3 days", "acute". |
| `symptoms` | string[] | No | List of reported symptoms. |
| `relevant_history` | string | No | Allergies, meds, recent travel, etc. |
| `red_flags_mentioned` | string[] | No | E.g. chest pain, difficulty breathing (used in risk). |
| `source` | "conversation" \| "form" \| "import" | No | How intake was captured. |

**Example:**

```json
{
  "chief_complaint": "Mild fever and fatigue for 2–3 days",
  "duration": "2–3 days",
  "symptoms": ["fever", "fatigue"],
  "relevant_history": "No recent travel; no known allergies.",
  "red_flags_mentioned": [],
  "source": "conversation"
}
```

---

## 2. `risk_assessment`

Output of the risk node (urgency classification).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `level` | "low" \| "moderate" \| "urgent" \| "emergency" | Yes | Urgency level. |
| `score` | number [0, 1] | No | Numeric risk score if available. |
| `indicators` | string[] | No | E.g. "No emergency indicators", "Suitable for virtual care". |
| `is_emergency` | boolean | Yes | If true, routing is skipped; emergency guidance only. |
| `rationale` | string | No | Short explanation for level. |

**Example:**

```json
{
  "level": "moderate",
  "score": 0.45,
  "indicators": ["No emergency indicators", "Suitable for virtual or primary care."],
  "is_emergency": false,
  "rationale": "Symptoms indicate moderate concern with no immediate emergency indicators."
}
```

---

## 3. `pathway_eligibility`

Per-pathway feasibility (output of ELIGIBILITY node).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pathway_id` | string | Yes | Id of pathway (e.g. virtualcarens, pharmacy, primarycare, urgent, emergency, mental_health, community_health). |
| `pathway_name` | string | No | Display name. |
| `eligible` | boolean | Yes | Whether this pathway is feasible for this case. |
| `reason` | string | No | E.g. "Condition in pharmacy scope", "ED only for emergency". |
| `constraints` | string[] | No | E.g. "Requires video capability", "Within 50 km of UTC". |

**Example:**

```json
[
  { "pathway_id": "virtualcarens", "pathway_name": "VirtualCareNS", "eligible": true, "reason": "Non-emergency; suitable for virtual assessment." },
  { "pathway_id": "pharmacy", "pathway_name": "Pharmacy Prescribing", "eligible": false, "reason": "Condition not in pharmacy prescribing list." }
]
```

---

## 4. `rag_context`

Evidence and RAG output per pathway (output of RAG_RETRIEVE node).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pathway_id` | string | Yes | Pathway this context applies to. |
| `sources` | `{ title, url, excerpt }[]` | No | Retrieved docs or links. |
| `guidance_summary` | string | No | Short narrative from RAG. |
| `questions_for_clinician` | string[] | No | Suggested questions. |
| `safety_reminders` | string[] | No | Warnings or caveats. |

**Example:**

```json
[
  {
    "pathway_id": "virtualcarens",
    "sources": [
      { "title": "VirtualCareNS — NS Health", "url": "https://...", "excerpt": "Province-wide virtual care for non-emergency conditions." }
    ],
    "guidance_summary": "VirtualCareNS is appropriate for this presentation.",
    "questions_for_clinician": ["Duration and severity of fever?", "Current medications and allergies?"],
    "safety_reminders": ["If fever rises above 39°C or breathing difficulty, seek urgent care or call 811."]
  }
]
```

---

## 5. `routing_result`

Output of ROUTING_OPT node (Gurobi or rule-based).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `recommended_pathway_id` | string | Yes | Top recommendation. |
| `alternatives` | `{ pathway_id, reason, rank }[]` | No | Other viable pathways in order. |
| `confidence` | number [0, 1] | No | Confidence in recommendation. |
| `optimizer_metadata` | object | No | E.g. objective value, slack, solve time (for Gurobi). |

**Example:**

```json
{
  "recommended_pathway_id": "virtualcarens",
  "alternatives": [
    { "pathway_id": "pharmacy", "reason": "If condition is pharmacy-eligible.", "rank": 1 },
    { "pathway_id": "primarycare", "reason": "If patient prefers in-person.", "rank": 2 }
  ],
  "confidence": 0.88,
  "optimizer_metadata": { "objective_value": 12.4, "solve_time_sec": 0.02 }
}
```

---

## 6. `response`

Structured output for the UI / clinician (output of RESPONSE_GEN node). This is what the front end currently consumes for the “Agentic RAG” panel.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pathway` | string | Yes | Pathway id (echo). |
| `navigation_summary` | string | Yes | One-paragraph summary. |
| `next_steps_for_patient` | string[] | Yes | Ordered list. |
| `questions_for_clinician` | string[] | No | |
| `information_to_prepare` | string[] | No | |
| `safety_reminders` | string[] | No | |
| `escalation_conditions` | string | No | When to escalate. |
| `alternative_pathways_to_consider` | `{ pathway, reason }[]` | No | |
| `confidence` | `{ numeric_score, rationale }` | No | |
| `sources` | `{ title, url, excerpt }[]` | No | |

*(Matches the existing Klara OS Agentic RAG response schema.)*

---

## 7. `opor_context` (optional)

When Layer 3 (Healthcare System Integration) provides OPOR / One Person One Record feedback.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prior_ed_visits` | number | No | Prior ED visits if available. |
| `active_conditions` | string[] | No | Known active conditions. |
| `medications` | string[] | No | Current medications (from DIS/SHARE). |
| `summary` | string | No | Free-form summary from OPOR query. |

*(Optional; populated when Layer 3 integration returns structured patient context.)*

---

## 8. `metadata`

Reserved for implementation-specific or vendor-specific data (e.g. tenant, locale, feature flags).

```json
{
  "metadata": {
    "locale": "en-CA",
    "tenant_id": "ns-health",
    "pipeline_version": "1.2.0"
  }
}
```

---

## Lifecycle

1. **Create:** When a new session starts, create NavigationContext with `session_id`, `created_at`, `updated_at`; optionally `intake_summary` if captured in one step.
2. **Update:** Each agent node (INTAKE → RISK → … → RESPONSE_GEN) reads the context, runs, and writes back only its section. `updated_at` is refreshed on each write.
3. **Consume:** The UI and downstream systems (e.g. VirtualCareNS pre-fill, OPOR) read from `response` and, if needed, from `intake_summary`, `risk_assessment`, `routing_result`.

---

## Status

- **Version:** 1.0  
- **Next:** Use this schema in agent nodes and in API request/response; deprecate any ad-hoc payloads.
