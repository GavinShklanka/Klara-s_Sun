# 1️⃣ Conversational Agent Architecture (LangGraph / Agent Workflow)

**Purpose:** Define the agent workflow so that intake, risk, RAG, routing, and response are a single coherent graph. Once this is fixed, all “plumbing” (API calls, state handoffs) follows the graph.

---

## Design principles

- **Single state object:** The agent operates on one **NavigationContext** (see spec 02). No ad-hoc payloads.
- **Deterministic routing:** Edges depend only on state (e.g. risk level, pathway eligibility). No hidden side effects.
- **RAG as a node:** Retrieval and reasoning are explicit nodes; the rest of the system does not “call an LLM” directly—it passes context into the graph and reads structured output from a node.
- **Emergency override:** Any path that detects emergency indicators immediately transitions to a dedicated emergency-handling subgraph (e.g. 911 guidance, no further routing).

---

## Graph overview

```
                    ┌─────────────────┐
                    │   START         │
                    │ (new session)   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  INTAKE          │
                    │  Parse & normalize│
                    │  (symptoms, etc.) │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  RISK_ASSESS    │
                    │  Classify:       │
                    │  low|moderate|   │
                    │  urgent|emergency│
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │ emergency?   │              │ no
              ▼              │              ▼
    ┌─────────────────┐      │     ┌─────────────────┐
    │ EMERGENCY       │      │     │ ELIGIBILITY     │
    │ 911 / safety    │      │     │ Which pathways  │
    │ guidance only   │      │     │ are feasible?   │
    └─────────────────┘      │     └────────┬────────┘
                            │              │
                            │              ▼
                            │     ┌─────────────────┐
                            │     │ RAG_RETRIEVE    │
                            │     │ Fetch evidence   │
                            │     │ per pathway      │
                            │     └────────┬────────┘
                            │              │
                            │              ▼
                            │     ┌─────────────────┐
                            │     │ ROUTING_OPT     │
                            │     │ Gurobi / rules  │
                            │     │ → recommended   │
                            │     │   pathway       │
                            │     └────────┬────────┘
                            │              │
                            │              ▼
                            │     ┌─────────────────┐
                            │     │ RESPONSE_GEN    │
                            │     │ Summaries,      │
                            │     │ next steps,     │
                            │     │ alternatives    │
                            │     └────────┬────────┘
                            │              │
                            └──────────────┼──────────────┐
                                           ▼              │
                                  ┌─────────────────┐    │
                                  │  END            │◀───┘
                                  │  (context out)   │
                                  └─────────────────┘
```

---

## Alignment with Architecture Pipeline

- **INTAKE** = Patient Input + Symptom Parsing (structured conversational intake, e.g. Agentic RAG + Medline).
- **RISK_ASSESS** = Risk Classification.
- **Provincial Context Analysis** = ELIGIBILITY + RAG_RETRIEVE + data from Layer 3 (capacity, pathway config).
- **ROUTING_OPT** = Capacity-Aware Routing + Care Recommendation (Gurobi or rules).
- **RESPONSE_GEN output** = official **Structured Intake Output** for Layer 1 (Clinician Intake Summary View) and Layer 3 (EMR integration).
- **RAG_RETRIEVE** implements evidence retrieval that supports Provincial Context Analysis and routing.

---

## Nodes (summary)

| Node | Input (from state) | Action | Output (into state) |
|------|--------------------|--------|----------------------|
| **INTAKE** | Raw user input (text, structured form) | Parse, normalize, extract chief complaint, duration, red flags | `intake_summary` |
| **RISK_ASSESS** | `intake_summary` | Classify urgency (e.g. rules + optional ML); set emergency flag if needed | `risk_assessment`, `is_emergency` |
| **EMERGENCY** | `is_emergency === true` | Return 911/safety message; no pathway recommendation | Safety message, end |
| **ELIGIBILITY** | `intake_summary`, `risk_assessment`, pathway config | For each pathway: eligible yes/no and reason | `pathway_eligibility[]` |
| **RAG_RETRIEVE** | `pathway_eligibility`, selected or candidate pathways | Query vector store / agentic RAG per pathway; get evidence, guidelines, FAQs | `rag_context[]` (per pathway) |
| **ROUTING_OPT** | `risk_assessment`, `pathway_eligibility`, `rag_context`, capacity/supply data | Run Gurobi (or rule-based) to minimize cost/ wait subject to constraints | `recommended_pathway`, `alternatives[]`, `routing_metadata` |
| **RESPONSE_GEN** | Full NavigationContext | Produce navigation summary, next steps, questions for clinician, safety reminders, alternatives | `navigation_summary`, `next_steps_for_patient`, etc. |

---

## Edges (when to move)

- **START → INTAKE:** Always.
- **INTAKE → RISK_ASSESS:** Always.
- **RISK_ASSESS → EMERGENCY:** If `is_emergency === true`.
- **RISK_ASSESS → ELIGIBILITY:** If `is_emergency === false`.
- **ELIGIBILITY → RAG_RETRIEVE:** For each eligible (or candidate) pathway; can be parallel.
- **RAG_RETRIEVE → ROUTING_OPT:** After RAG results are attached to state.
- **ROUTING_OPT → RESPONSE_GEN:** After recommended pathway (and alternatives) are set.
- **RESPONSE_GEN → END:** Always.
- **EMERGENCY → END:** Always.

---

## LangGraph mapping (if using LangGraph)

- **State:** One shared state object = **NavigationContext** (see spec 02). Each node reads from it and writes back only the fields it owns.
- **Nodes:** Each box above is a single node function: `state_in → state_out` (or state mutation in place).
- **Conditional edges:** One conditional edge after RISK_ASSESS: `is_emergency ? "EMERGENCY" : "ELIGIBILITY"`.
- **Parallel:** RAG_RETRIEVE can be one node that internally fans out per pathway and merges results into `rag_context`.
- **Checkpointing:** Persist NavigationContext at each node for replay, audit, and resume.

---

## Out of scope for this doc

- Concrete prompt templates (belong in implementation).
- Vector store schema (belong in RAG/retrieval spec).
- Exact Gurobi formulation (see spec 03).

---

## Status

- **Version:** 1.0  
- **Next:** Implement graph in code (LangGraph or equivalent); ensure NavigationContext is the only carrier of session data.
