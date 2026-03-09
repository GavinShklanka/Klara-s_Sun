# Klara OS — Strategic Specs (Pre-Implementation)

These three documents define the core models **before** implementation. The rest of the system is plumbing that connects them.

| Spec | Purpose |
|------|--------|
| **[01 — Conversational Agent Architecture](01-conversational-agent-architecture.md)** | LangGraph-style workflow: nodes (INTAKE → RISK → ELIGIBILITY → RAG → ROUTING → RESPONSE), edges, and emergency override. |
| **[02 — NavigationContext Schema](02-navigation-context-schema.md)** | Universal session object: one JSON schema for intake, risk, eligibility, RAG context, routing result, and response. Every component reads/writes this. |
| **[03 — Optimization Model](03-optimization-model-gurobi-routing.md)** | Gurobi (MIP) formulation for care pathway routing: decision variables, constraints, objective (minimize inappropriateness + wait + capacity pressure). |
| **[04 — Cross-Check with Architecture](04-cross-check-with-architecture.md)** | Contingencies between specs 01–03 and the KLARA OS architecture; recommended spec updates. |
| **[05 — Backend NavigationContext Guide](05-backend-navigation-context-guide.md)** | How to integrate NavigationContext into the FastAPI backend (cgidatahackathon). |
| **[06 — Backend Agentic RAG + Gurobi Migration](06-backend-agentic-rag-gurobi-migration.md)** | How to add Agentic RAG intake and Gurobi optimization to the backend. |
| **[07 — Dev-Accurate Node Flow Diagram](07-node-flow-diagram-dev-accurate.md)** | Visual-spec node flow aligned to current frontend mapping and backend `/assess` contract. |
| **[08 — Routing Engine Motion Storyboard](08-motion-storyboard-routing-engine.md)** | Shot-by-shot motion/CGI storyboard for explaining routing behavior without architecture drift. |

**Order of use:** Define NavigationContext first (02); then design the agent graph (01) so each node consumes and produces fields of that context; finally plug the optimizer (03) into the ROUTING_OPT node with parameters from context and capacity data.
