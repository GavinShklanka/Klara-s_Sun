# Connection Status Indicator — Implementation Summary

## Architectural placement

The enhancement was placed at **Stage 5 (Intake UI header)** with updates triggered at **Stage 2 (immediately after sign-in)**.

- **Stage 5 — Persistent header:** The indicator lives in `#user-header` below the logo so it is always visible during intake and reflects current connection/location state without blocking the conversation.
- **Stage 2 — After sign-in:** The indicator is updated when the user becomes “connected”:
  - After **Join** (health card modal): `handleJoined()` → `refreshConnectionStatusAfterSignIn()`.
  - After **“yes” to “in system”**: `handleInSystem('yes')` → `refreshConnectionStatusAfterSignIn()`.

Location permission is checked only after sign-in (no prompt before the user has connected). If permission is denied or unavailable, the UI shows “Location disabled — manual region selection required”; the existing region/town flow is unchanged and remains the fallback.

## Components (vanilla JS; no React)

The “ConnectionStatus” component is implemented as:

- **HTML:** `index.html` — `#connection-status` with `#connection-status-auth` and `#connection-status-location`.
- **Logic:** `user.js` — `checkLocationPermission()`, `updateConnectionStatus()`, `refreshConnectionStatusAfterSignIn()`.
- **State:** Extended `state.connection = { locationPermission: 'unknown' }` (additive only).
- **Styles:** `user.css` — `.connection-status`, `.connection-status-auth`, `.connection-status-connected`, `.connection-status-disconnected`, `.connection-status-location`.

## Location permission detection

- Uses **Permissions API:** `navigator.permissions.query({ name: 'geolocation' })` when available.
- Resolves to `granted` | `denied` | `prompt` | `unknown`. `unknown` is used when the API is missing (e.g. some browsers).
- No geolocation request is made; only permission state is read. If not granted, the copy explains that manual region selection is used.

## Example UI states

| Auth      | Location permission | Display |
|----------|----------------------|--------|
| Not signed in | —                | 🔒 Not signed in |
| Connected     | granted            | 🟢 Connected / 📍 Location enabled |
| Connected     | denied / prompt / unknown | 🟢 Connected / 📍 Location disabled — manual region selection required |

## Compliance and safety (unchanged)

- **No changes** to: `/assess`, routing_engine, eligibility_engine, HITL (emergency → 811), run_compliance.py, or any validation/audit paths.
- **No changes** to: intake question order, `buildIntakeText()`, `submitIntake()` payload, or backend schemas.
- **Additive only:** New state (`state.connection`), new DOM node, new functions. Manual region/town selection and routing logic are unchanged; the indicator only reflects status and clarifies why manual selection may be required.
