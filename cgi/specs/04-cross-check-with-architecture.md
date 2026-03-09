# Cross-Check: Specs vs KLARA OS Architecture

**Reference used:** `klara-os-architecture(1).html` (KLARA OS — System Architecture, four-layer design and seven-stage pipeline).  
**Note:** The file `KLARA_OS_Architecture_Review_v2.docx` was not present in the repository; this cross-check is against the HTML architecture document. If the .docx contains additional or different content, share relevant excerpts and this document can be updated.

---

## Architecture Summary (from reference)

- **Pipeline (7 stages):** Patient Input → Symptom Parsing → Risk Classification → **Provincial Context Analysis** → Capacity-Aware Routing → Care Recommendation → Structured Intake Output  
- **Layer 01:** User Interaction (intake, dashboard, clinician summary)  
- **Layer 02:** Navigation Intelligence Engine — Intake Processor, Symptom Parsing, Risk Classification Engine, Healthcare Routing Engine, Capacity-Aware Routing Logic, Structured Output Generator, **Escalation Override Protocol**  
- **Layer 03:** Healthcare System Integration — OPOR, VirtualCareNS, EMR (Med Access, Accuro), DIS/SHARE, Rural clinics, **NS Health Capacity API**  
- **Layer 04:** Care delivery nodes — ED, UTC, Primary Care, Pharmacy, Telehealth, **Mental Health**, **Community Health Centres**

---

## 1️⃣ Spec 01 — Conversational Agent Architecture

| Architecture concept | Spec 01 | Contingency / action |
|----------------------|--------|-----------------------|
| **Pipeline stages** | INTAKE → RISK_ASSESS → (EMERGENCY \| ELIGIBILITY → RAG_RETRIEVE → ROUTING_OPT → RESPONSE_GEN) | **Naming alignment:** Architecture has "Symptom Parsing" and "Risk Classification" as distinct; spec has INTAKE (parse + normalize) and RISK_ASSESS. Consider documenting that INTAKE = Patient Input + Symptom Parsing, RISK_ASSESS = Risk Classification. |
| **Provincial Context Analysis** | No explicit node with this name. ELIGIBILITY + RAG_RETRIEVE together determine pathway feasibility and evidence. | **Gap:** Architecture has a dedicated "Provincial Context Analysis" stage. Spec could add a **PROVINCIAL_CONTEXT** node (load capacity, pathways, policies from Layer 3) before or inside ELIGIBILITY, or state explicitly that "Provincial Context Analysis = ELIGIBILITY + RAG_RETRIEVE + data from Layer 3". |
| **Capacity-Aware Routing** | ROUTING_OPT uses Gurobi (spec 03) with capacity/wait params. | Aligned. Spec 03 should explicitly source capacity from Layer 3 (see below). |
| **Structured Intake Output** | RESPONSE_GEN produces navigation summary, next steps, etc. | **Alignment:** Add one line in spec 01: "RESPONSE_GEN output is the Structured Intake Output that feeds Layer 1 (Clinician Intake Summary View) and Layer 3 (EMR integration)." |
| **Escalation Override Protocol** | EMERGENCY node; branch on `is_emergency`. | Aligned. |
| **RAG / retrieval** | RAG_RETRIEVE node. | Architecture does not name "RAG" or "retrieval" explicitly; it fits under Provincial Context / evidence for routing. No change required; optional note in spec: "RAG_RETRIEVE implements evidence retrieval that supports Provincial Context Analysis and routing." |

---

## 2️⃣ Spec 02 — NavigationContext Schema

| Architecture concept | Spec 02 | Contingency / action |
|----------------------|--------|-----------------------|
| **Structured signals Layer 1 → 2** | `intake_summary` (and raw input) from User Interaction Layer. | Aligned. |
| **Routing queries / capacity reads Layer 2 → 3** | Context has `pathway_eligibility`, `routing_result`; capacity is not yet a first-class field. | **Optional:** Add an optional `capacity_snapshot` or document that capacity is consumed at request time by ROUTING_OPT from Layer 3 and not necessarily stored in context. Either way, document the contract. |
| **OPOR / existing health record** | Architecture: "OPOR allows KLARA to contextualize navigation decisions against a patient's existing health record". Schema has `relevant_history` (free text) but no structured OPOR summary. | **Contingency:** Add optional `opor_context` or `external_record_summary` (e.g. prior ED visits, active conditions, medications from OPOR) so Layer 3 can feed back into the engine. |
| **Care delivery nodes (Layer 4)** | Pathway set: virtualcarens, pharmacy, primarycare, urgent, emergency. | **Gap:** Architecture also lists **Mental Health Access Points** and **Community Health Centres**. Spec uses "primarycare" and "urgent" but does not list mental_health or community_health as first-class pathway_ids. Either extend pathway set in spec 02 (and 03) or state that mental health / community are subsumed under primarycare or a future pathway. |
| **Intake summary for clinician** | `response` block matches "clinician-ready intake summary". | Aligned. |

---

## 3️⃣ Spec 03 — Optimization Model (Gurobi)

| Architecture concept | Spec 03 | Contingency / action |
|----------------------|--------|-----------------------|
| **Capacity-Aware Routing** | Objective includes \( c_p \) (capacity pressure); params \( t_p \), \( c_p \). | Aligned. |
| **Source of capacity / wait** | Spec says "capacity/supply data" and "real-time or cached data" but does not name Layer 3 or NS Health Capacity API. | **Contingency:** In spec 03, add one sentence: "Parameters \( t_p \), \( c_p \) (and optionally capacity limits) are sourced from the Healthcare System Integration Layer (e.g. NS Health Capacity API, VirtualCareNS availability)." |
| **Pathway set** | Same as spec 02: virtualcarens, pharmacy, primarycare, urgent, emergency. | Same as above: if architecture mandates Mental Health / Community Health as routable nodes, extend set or document mapping. |
| **Safety** | "Emergency cases are not routed by this model." | Aligned with EMERGENCY node in spec 01. |

---

## Summary of Recommended Spec Updates

1. **Spec 01:**  
   - Map node names to pipeline stages (INTAKE = Patient Input + Symptom Parsing, etc.).  
   - Either add a PROVINCIAL_CONTEXT node or state that Provincial Context Analysis = ELIGIBILITY + RAG_RETRIEVE + Layer 3 data.  
   - State that RESPONSE_GEN output is the official "Structured Intake Output" for Layer 1 and Layer 3.

2. **Spec 02:**  
   - Add optional `opor_context` / `external_record_summary` for Layer 3 (OPOR) feedback.  
   - Extend or document pathway set: add mental_health and community_health if the architecture requires them as first-class pathways; otherwise state how they map (e.g. to primarycare).

3. **Spec 03:**  
   - State explicitly that \( t_p \), \( c_p \) (and capacity limits) are sourced from the Healthcare System Integration Layer (e.g. NS Health Capacity API).

---

## Status

- **Version:** 1.0  
- **Next:** Apply the above edits to specs 01–03 if you adopt these contingencies; if you have the .docx (v2) content, we can cross-check again for any extra requirements.
