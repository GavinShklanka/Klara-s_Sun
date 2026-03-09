# Backend Migration: Agentic RAG + Gurobi

**Purpose:** Guide for adding Agentic RAG intake and Gurobi optimization to the cgidatahackathon backend, per [spec 01](01-conversational-agent-architecture.md) and [spec 03](03-optimization-model-gurobi-routing.md).

---

## 1. Agentic RAG (Conversational Intake)

**Current state:** `symptom_parser.py` mocks extraction from text.

**Target state:** Add an Agentic RAG layer that:

1. Accepts conversational input (e.g. multi-turn or single message).
2. Queries Medline or a clinical knowledge source for context.
3. Returns structured `intake_summary` (chief complaint, duration, symptoms, red flags).

**Implementation options:**

- **LangGraph:** Implement the agent graph from spec 01 (INTAKE → RISK → ELIGIBILITY → RAG_RETRIEVE → ROUTING_OPT → RESPONSE_GEN).
- **Simple RAG:** Call an LLM with a prompt that uses retrieved Medline/clinical docs; parse the response into `IntakeSummary`.
- **Hybrid:** Keep rule-based symptom parsing for MVP; add RAG as an optional enrichment step that augments `intake_summary`.

**New endpoint (optional):** `POST /agentic-rag` accepts:

```json
{
  "pathway": "virtualcarens",
  "intake_summary": { "chief_complaint": "...", "duration": "...", "relevant_history": "..." },
  "risk_assessment": { "level": "moderate", "score": 0.45, "indicators": [...] }
}
```

Returns pathway-specific guidance (navigation summary, next steps, questions for clinician, etc.) per the `response` schema in spec 02.

---

## 2. Gurobi Optimization (Routing Engine)

**Current state:** `routing_engine.py` uses mock rule-based logic.

**Target state:** Replace with Gurobi MIP per [spec 03](03-optimization-model-gurobi-routing.md).

**Steps:**

1. **Install Gurobi:**  
   - `pip install gurobipy`  
   - Obtain a license (academic or commercial).

2. **Define the model:**
   - **Variables:** `x_p` ∈ {0,1} for each pathway `p`.
   - **Objective:** Minimize \( \sum_p (w_p x_p + \alpha t_p x_p + \beta c_p x_p) \).
   - **Constraints:**  
     - \( \sum_p x_p = 1 \) (exactly one recommendation).  
     - \( x_p \leq e_p \) (only eligible pathways).

3. **Parameters from NavigationContext and Layer 3:**
   - `e_p` from `pathway_eligibility`.
   - `w_p` from acuity/risk (e.g. ED weight higher for low-acuity).
   - `t_p`, `c_p` from NS Health Capacity API or mock (wait times, capacity slack).

4. **Output:** Write `routing_result` into NavigationContext (recommended_pathway_id, alternatives, confidence, optimizer_metadata).

**Fallback:** If Gurobi is unavailable, keep the current rule-based logic as fallback (choose lowest-acuity eligible pathway, then by smallest wait).

---

## 3. Capacity Data (Layer 3)

- **Source:** NS Health Capacity API, VirtualCareNS availability, UTC wait times.
- **Integration:** For MVP, use mock values (e.g. VirtualCareNS 12 min, UTC 35 min). For production, add a capacity service that returns `t_p` and `c_p` per pathway.
- **Spec 03:** States that `t_p` and `c_p` are sourced from the Healthcare System Integration Layer.

---

## 4. Recommended Order

1. **Phase 1:** Integrate NavigationContext (see [05-backend-navigation-context-guide.md](05-backend-navigation-context-guide.md)); refactor pipeline to read/write it.
2. **Phase 2:** Add Gurobi routing (replace mock routing_engine); keep rule-based fallback.
3. **Phase 3:** Add Agentic RAG intake (LangGraph or simple RAG); optionally add `/agentic-rag` endpoint for per-pathway guidance.
4. **Phase 4:** Wire capacity service when NS Health Capacity API is available.

---

## Status

- **Version:** 1.0  
- **Repo:** Use when extending [cgidatahackathon](https://github.com/nkriznar/cgidatahackathon).
