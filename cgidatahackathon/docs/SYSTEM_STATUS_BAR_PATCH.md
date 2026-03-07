# System Status Bar & Accessibility Buttons — Architecture Patch

## Summary

Non-destructive UI-only enhancement. No changes to intake engine, question flow, routing logic, or compliance.

## Components (vanilla HTML/CSS/JS)

| Logical component      | Implementation |
|------------------------|----------------|
| **SystemStatusBar**    | `#system-status-bar` in `index.html` + `.system-status-bar` / `.system-status-row` in `user.css`. Renders connection status, location status, and Capabilities dropdown trigger. |
| **CapabilityDropdown** | `#capability-dropdown` panel toggled by `#capabilities-toggle`. Content: Location Routing (Disabled), ASL Video (Experimental), Braille Haptic (Experimental), Health Data Integration (Not Connected), Encrypted Device Profile (Offline). Status indicators only; no configuration or API calls. |
| **AccessibilityButtons** | `#asl-btn` (🤟 ASL) and `#braille-btn` (⠿ Braille) in `.chat-actions`. Placeholder handlers: `console.log(...)`. Do not affect intake or routing. |

## Insertion points

- **SystemStatusBar:** Inserted between `#user-header` and `#user-main` so it sits directly below the KLARAOS logo and above the conversation window.
- **CapabilityDropdown:** Rendered inside the status bar (right-aligned); toggle opens/closes the panel; click outside closes.
- **Accessibility buttons:** Inserted in `#chat-input-area` → `.chat-actions` between the existing voice button and the Send button: `[ Mic ] [ ASL ] [ Braille ] [ Send ]`.

## Intake engine unchanged

- No edits to: `SCRIPT`, step handlers (`handleComplaint`, `handleInSystem`, `handleDuration`, `handleTown`, `handleMedications`, `handleAllergies`, etc.), `appendBubble`, `buildIntakeText`, `submitIntake`, or any `/assess` / routing / compliance logic.
- Connection/location display still driven by existing `state.inSystem` and `state.connection.locationPermission`; `updateConnectionStatus()` now updates the status bar nodes (same IDs, new container).

## Files modified

- `static/index.html` — Header trimmed to logo only; added `#system-status-bar` (row + dropdown); added `#asl-btn`, `#braille-btn` in `.chat-actions`.
- `static/user.js` — `updateConnectionStatus()` class names adjusted for status bar; added capability dropdown toggle and ASL/Braille click handlers (console only).
- `static/user.css` — Replaced old connection-status block with system-status-bar, capability dropdown, and `.btn-accessibility` styles.
