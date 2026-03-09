# 08 — Routing Engine Motion Storyboard

Purpose: shot-by-shot storyboard for CGI/motion visuals that explain the routing engine without architecture drift.

## Timeline (60-second cut)

### Shot 1 (0.0s - 5.0s): Symptom Entry
- On-screen: patient text input appears (free-form).
- Caption: "Conversational clinical intake begins."
- Data callout: `text`, `region`.

### Shot 2 (5.0s - 11.0s): Conversational Intake Node
- Visual: Agent node pulses; speech bubbles compress to structured tags.
- Caption: "Agentic intake extracts clinical navigation signals."
- Data callout: chief complaint, duration, symptoms, red flags.

### Shot 3 (11.0s - 17.0s): NavigationContext Builder
- Visual: JSON card fills fields progressively.
- Caption: "NavigationContext becomes the shared session object."
- Data callout: `intake_summary`.

### Shot 4 (17.0s - 24.0s): Risk Assessment + Branch
- Visual: risk gauge animates; branch splits emergency vs non-emergency.
- Caption: "Emergency indicators trigger immediate override."
- Data callout: `risk_assessment.level`, `emergency_flags`.

### Shot 5 (24.0s - 31.0s): Provincial Context Ingestion
- Visual: cards slide in (OPOR, capacity, policy flags).
- Caption: "Layer 3 context enriches routing constraints."
- Data callout: `opor_context`, `provincial_context`.

### Shot 6 (31.0s - 38.0s): Eligibility + RAG Evidence
- Visual: pathway chips light up eligible/ineligible; evidence snippets appear.
- Caption: "Pathway feasibility and evidence are computed."
- Data callout: `pathway_eligibility`, `rag_context`.

### Shot 7 (38.0s - 46.0s): Optimization Routing
- Visual: objective equation fades in, matrix solves, one pathway highlighted.
- Caption: "Optimization routing minimizes strain and delay."
- Data callout: `w_p`, `t_p`, `c_p`, `e_p` -> `recommended_pathway`.

### Shot 8 (46.0s - 54.0s): Recommendation + Alternatives
- Visual: primary card expands; alternatives stack below.
- Caption: "Primary pathway with safe alternatives."
- Data callout: `routing_recommendation.primary_pathway`, `options`.

### Shot 9 (54.0s - 60.0s): Structured Intake Output
- Visual: output packet sent to clinician view and EMR icon.
- Caption: "Structured intake output supports care continuity."
- Data callout: `structured_summary`, `governance.confidence_score`.

---

## Emergency micro-sequence (insertable, 8s)

- Trigger from Shot 4 when `emergency_flags.length > 0`.
- Visual override color shift (amber -> red).
- Immediate text: "Emergency override active. Call 911 guidance issued."
- Skip Shots 5-8; jump to safety output card.

---

## Motion design constraints

- Keep node order fixed: Intake -> Context -> Risk -> Context Enrichment -> Optimization -> Output.
- Do not depict optimization as first step.
- Use one visual token for each data object across all shots (same color/icon per object).
- If backend is in fallback/demo mode, watermark sequence as "Mock routing data".

---

## Optional overlay text pack (for editors)

1. "Conversational Intake"
2. "NavigationContext"
3. "Risk Classification"
4. "Provincial Context"
5. "Eligibility + Evidence"
6. "Optimization Routing"
7. "Care Pathway Assignment"
8. "Structured Output"

Status: v1.0 (aligned with specs 01-03 + current frontend/backend mapping)
