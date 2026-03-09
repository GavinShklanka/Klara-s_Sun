System Purpose

Routing intelligence layer for Nova Scotia healthcare access.

Entry Routes
1 Conversational Intake (Need Help Finding Care)
2 Direct Service Routing (I Know What Service I Need)
3 Physician AI Scribe Enrollment (Physician / NP Portal)

Clinical messaging (UI layer only)
- All user-facing text uses triage-appropriate language.
- Avoid directive or diagnostic wording; use "Based on the information currently available", "Further assessment may be helpful", "A clinician can help determine the appropriate next step."
- Do not imply diagnosis, confirmation of condition, or final determination; use "may indicate", "triage review recommended", "clinical evaluation may be required."

LangGraph Pipeline
User Input
↓
Intent Classification
↓
Emergency Risk Check
↓
Eligibility Evaluation
↓
Service Discovery
↓
Optimization Routing
↓
Recommendation
↓
External Service Handoff