# KLARA Intake UI — Architecture & Code Path Analysis

**Purpose:** Identify all components, state, and entry points for a non-destructive intake UI enhancement. No code changes until integration points are agreed.

---

## 1. Authentication

**Finding: No server-side authentication.** The app is demo/prototype only.

| Location | Behavior |
|----------|----------|
| **`static/index.html`** | Contains **Join modal** (`#join-modal`): health card input, Cancel/Connect. |
| **`static/user.js`** | `showJoinModal()`, `hideJoinModal()`, `joinSubmit` click: validates non-empty input only; any value passes. `handleJoined()` sets `state.inSystem = true` and continues flow. No token or session cookie. |
| **Backend** | No auth middleware. `POST /assess` and `POST /api/requests` accept unauthenticated requests. `session_id` is generated per `/assess` call in `navigation_context.new_navigation_context()`. |

**Implication for enhancement:** Any intake UI change does not need to touch auth. If “Join” is kept, only the modal and `handleJoined`/`handleInSystem` call sites matter.

---

## 2. Intake Flow (Conversation Steps)

**State machine lives in `static/user.js`.** Single `state` object and `state.step` drive the flow.

### 2.1 State Shape

```javascript
// user.js (lines 24–32)
let state = {
    step: 'greeting',           // current step (see below)
    inSystem: null,             // true/false after "in system?" answer
    messages: [],               // unused in current code
    intake: {
        chiefComplaint: '',
        symptoms: '',
        duration: '',
        region: '',
        town: '',
        medications: '',
        allergies: '',
        done: false,
        symptomOptions: [],      // set by symptom checkboxes (optional)
        extra: ''               // set in handleDone
    },
    sessionId: null,             // from /assess response
    assessData: null,            // full AssessResponse
    chosenPathway: null
};
```

### 2.2 Step Sequence and Handlers

| Step | Trigger | Handler / UI | Next step(s) |
|------|---------|--------------|--------------|
| `greeting` | Page load | `startChat()` → append greeting, set `complaint` | `complaint` |
| `complaint` | User text | `handleComplaint(text)` → intake.chiefComplaint, ask “in system?” | `in_system` |
| `in_system` | User “yes”/“no” | `handleInSystem(text)` → if yes: symptom dropdown; if no: join prompt + Join button | `symptom_select` or wait for Join |
| (after Join) | Join modal Connect | `handleJoined()` | `symptom_select` |
| `symptom_select` | Continue button or “skip/continue/next/none” | `showSymptomDropdown()`; on continue: intake.symptomOptions, ask duration | `duration` |
| `duration` | User text | `handleDuration(text)` → intake.duration, show **region dropdown** + “What town…?” after Select | `region_select` |
| `region_select` | Select button or typed region | `handleRegionSelect(text)` → intake.region; if no town in text → ask town | `town` |
| `town` | User text | `handleTown(text)` → intake.town | `medications` |
| `medications` | User text | `handleMedications(text)` → intake.medications | `allergies` |
| `allergies` | User text | `handleAllergies(text)` → intake.allergies, show Submit button | `done` |
| `done` | “Submit” / “done” or inline Submit | `handleDone(text)` or Submit click → `submitIntake()` | — (navigate to results) |

**Critical path for “medications” and “town” (your screenshot):**

- After **region** (e.g. “Northern (Rural)”), the UI asks: **“What town or municipality are you in?”** (`handleDuration` → region bubble’s Select button handler, line ~218).
- Then **town** is captured in `handleTown`.
- Then **“Are you on any medications we should know about?”** is asked in `SCRIPT.afterRegion` → shown after region selection; the *next* Klara line is “What town…?” from the region button handler; then after town, `SCRIPT.afterMeds` (“medications”) is shown.

So the order in the UI is: **Region → Town → Medications → Allergies → Done.**

**Entry points for an intake “fix”:**

- **Step order / copy:** Change which step asks what (e.g. town before/after region, or medications wording) in the handlers and/or `SCRIPT`.
- **Data collected:** Only place that persists intake for `/assess` is `state.intake`. Any new field must be added there and passed into `buildIntakeText()` and, if needed, into the `/assess` request body.

---

## 3. Chat UI Rendering

| Location | Responsibility |
|----------|----------------|
| **`static/index.html`** | Structure: `#chat-view`, `#chat-messages`, `#chat-input-area`, `#chat-input`, `#send-btn`, `#voice-btn`, `#join-modal`, `#results-view`, etc. |
| **`static/user.js`** | **`appendBubble(from, text)`** — adds a div with class `chat-bubble klara` or `chat-bubble user`; all conversation goes through this or direct DOM (see below). **`esc(str)`** used for escaping. |
| **`static/user.css`** | Styles for `.chat-bubble`, `.chat-bubble.klara` (left/grey), `.chat-bubble.user` (right/blue), `.symptom-checkboxes`, `.chat-select`, `.btn-region-select`, modals, etc. |

**Dynamic UI elements (all in `user.js`):**

- **Symptom checkboxes:** `showSymptomDropdown()` — builds a Klara bubble with checkboxes + “Continue” button; on Continue, reads checked values into `state.intake.symptomOptions`.
- **Region:** `handleDuration()` — builds a Klara bubble with `<select id="region-select-chat">` (options from `REGIONS`) and “Select” button. On Select: `state.intake.region`, append user bubble with value, ask “What town or municipality are you in?”.
- **Join:** Inline “Join” button bubble when user says no to “in system”; opens `#join-modal`.
- **Submit in chat:** `showSubmitButtonInChat()` — adds a Klara bubble with “Submit Intake” button when step is `done`; button calls `submitIntake()` if `state.step === 'done'` and chiefComplaint set.

**Rendering entry points for enhancement:**

- Add or change bubbles in the same way: create a div with class `chat-bubble klara` (or `user`), fill content, append to `chatMessages`, then optionally run `chatMessages.scrollTop = chatMessages.scrollHeight`.
- Any new dropdown/button should update `state.intake` and call `setStep(nextStep)` and either `enableInput()` or the next handler (e.g. another bubble).
- Preserve `appendBubble` and `esc()` for consistency and XSS safety.

---

## 4. Routing Logic (Backend)

**Pipeline:** `main.py` → `assess_patient()`.

1. **Request:** `AssessRequest`: `text`, `region`, optional `opor_context`, optional `symptom_selections`.
2. **Stages:**  
   `new_navigation_context` → `parse_symptoms` → `risk_score` → `load_provincial_context` → `retrieve_rag_context` (uses `symptom_selections`) → `resolve_pathway_eligibility` → **`route_care`** → `build_summary` → build `AssessResponse`.
3. **Human-in-the-loop (HITL) in `main.py` (lines 153–161):** After `route_care`, any `primary_pathway == "emergency"` is set to `"811"`, and any `"emergency"` in `options` is replaced with `"811"`. So the frontend **never** receives `"emergency"` as primary or in options; it gets **811**.
4. **`route_care`** (`klara_core/routing_engine.py`): If `risk_level == "emergency"`, returns immediately with `primary_pathway: "811"`, `options: ["811", "urgent"]`. Otherwise runs optimization and returns primary + alternatives.

**Intake data used for routing:**

- **From request:** `text` (full intake string), `region`, `symptom_selections`.
- **`text`** is built in the frontend by **`buildIntakeText()`** from `state.intake`: chiefComplaint/symptoms, duration, region, town, medications, allergies, extra.

So any new intake field that should influence routing or RAG must be included in the string passed as `text` (and optionally in new backend fields if you extend the API). **Medications and allergies** are already in `buildIntakeText()` and thus in `text`; they are not yet in `AssessRequest` as separate fields (only inside `text`).

**Compliance (do not break):**

- **run_compliance.py** expects: low-acuity (e.g. back pain) → no `"emergency"` in `routing_recommendation.options`; emergency (e.g. chest pain) → `primary_pathway == "811"` and `"emergency"` not in options; `symptom_selections` accepted; required response fields and `pathway_urls` present.

---

## 5. Location Detection

**Frontend:**

- **Region:** From **region dropdown** in chat (`REGIONS` in `user.js`: Halifax, Cape Breton, South Shore, Annapolis Valley, Truro/Colchester, Northern (Rural)). Stored in `state.intake.region`.
- **Town:** Free text after “What town or municipality are you in?”. Stored in `state.intake.town`.
- Both are sent to `/assess` only inside the single `text` string (via `buildIntakeText()`). **`region`** is also sent as the top-level **`region`** in the request body (from `state.intake.region || 'Halifax'` in `submitIntake()`).

**Backend:**

- **`main.py`:** `AssessRequest.region` is used for provincial context and routing. No separate `town` field in the API; town only appears inside `text`.
- **`/api/nearby`:** Query params: `pathway`, `region`, `town`. Uses **`_safe_location(town, region)`** to avoid displaying non-places (e.g. “no medication”) in map links. Returns `maps_search_url`, `maps_directions_url`, `location_display`, `locations` (NS links).

**Location-related entry points:**

- **Frontend:** Any change to how region/town are collected (e.g. town dropdown, validation) goes in `handleDuration` (region), `handleRegionSelect`, and `handleTown`. Still must set `state.intake.region` and `state.intake.town` and keep building the same `text`/`region` for `submitIntake()`.
- **Backend:** Location logic for display/maps is in `_safe_location` and `get_nearby`. If you add a dedicated `town` (or address) field to the API later, you can pass it into `get_nearby` without changing the current `text`+`region` contract.

---

## 6. Where Your Fix Should Integrate (Checklist)

Use this to ensure a non-destructive enhancement:

- [ ] **State:** Only extend `state.intake` (and optionally `state.step` values) or add new state keys; do not remove fields that `buildIntakeText()` or `/assess` rely on (`chiefComplaint`, `symptoms`, `duration`, `region`, `town`, `medications`, `allergies`).
- [ ] **Steps:** Any new or reordered step must be wired in **`onSend()`** in the `switch (state.step)` and must call `setStep(nextStep)` and either show the next bubble or `enableInput()`.
- [ ] **Script:** Update **`SCRIPT`** in `user.js` if you change prompt copy (e.g. medications, town, region).
- [ ] **Bubbles:** New questions/controls = new bubbles built like symptom/region (same pattern: Klara bubble + optional controls + button/change handler → update state → setStep → next message or input).
- [ ] **Submit:** `submitIntake()` must continue to call `buildIntakeText()` and send `{ text, region, symptom_selections }`. If you add request fields (e.g. `medications`/`allergies` as separate keys), add them in a backward-compatible way and ensure **run_compliance.py** and **main.py** still get the data they need.
- [ ] **Backend:** Keep **HITL** (emergency → 811) and **AssessResponse** shape; keep **run_compliance.py** expectations (low acuity no ED in options; emergency → 811 primary; required fields; symptom_selections).
- [ ] **Location:** Keep `region` and `town` in `state.intake` and in the payload so **`/api/nearby`** and **`safeLocationDisplay()`** / **`buildMapsSearchUrl()`** keep working.

---

## 7. File Reference (No Modifications Yet)

| File | Relevance |
|------|------------|
| **static/user.js** | State, steps, handlers, `buildIntakeText`, `submitIntake`, `appendBubble`, SCRIPT, REGIONS, all intake UI logic. |
| **static/index.html** | Chat container, join modal, results view, dashboard. |
| **static/user.css** | Chat and intake styling. |
| **main.py** | `/assess`, HITL post-processing, `AssessRequest`, `/api/nearby`, `_safe_location`. |
| **klara_data/schemas.py** | `AssessRequest`, `AssessResponse`; extend only if adding new request/response fields. |
| **klara_core/routing_engine.py** | Emergency bypass (811); do not change HITL behavior. |
| **klara_core/eligibility_engine.py** | Pathway eligibility; no change unless you add pathways. |
| **scripts/run_compliance.py** | Must keep passing after your change (low acuity, emergency→811, symptom_selections, required fields). |

---

**Next step:** Define the exact intake UI change (e.g. reorder questions, add validation, change copy, or add a new step), then map it to the checklist above and the handlers listed in §2.2 so the implementation stays non-destructive and preserves compliance and safety.
