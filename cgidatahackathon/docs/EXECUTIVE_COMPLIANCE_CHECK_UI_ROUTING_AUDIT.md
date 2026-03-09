# KLARA SYSTEM — Executive Compliance Check: UI Routing Failure Audit

**Date:** 2026-03-09  
**Directive:** Controlled system audit only. No modifications to core routing logic.  
**Purpose:** Diagnose why UI routes return 404 and why initial UX navigation buttons may not function.

---

## 1. Current System Problem (Observed Behaviour)

- **Initial UI:** Buttons "Choose your path to get started" (Patient intake flow, Clinician/Admin view, Dashboard/Command Center) appear but may not respond to clicks or may reference routes that return 404.
- **Admin view:** Loads. From that view, `/dashboard`, `/command-center`, or other HTML paths return **404**.
- **Static HTML pages:** Accessing paths such as `/dashboard`, `/command-center`, `/results` in the browser returns **HTTP 404 Not Found**.

---

## 2. Audit Results

### A — FastAPI Server Entry Point

| Item | Finding |
|------|--------|
| **File path** | `cgidatahackathon/main.py` |
| **Entry** | `app = FastAPI(title="KLARA OS Core Engine")` (line 112) |
| **Middleware** | None configured. No `add_middleware`, no CORS middleware. |
| **StaticFiles** | `app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")` (line 115) |
| **Template config** | **None.** No `Jinja2Templates`. No `templates` directory. |

**STATIC_DIR:** `Path(__file__).parent / "static"` → resolves to `cgidatahackathon/static` when the server is run from `cgidatahackathon`.

---

### B — Static File Mounts

| Item | Finding |
|------|--------|
| **Mount path** | `/static` |
| **Directory** | `STATIC_DIR` = `cgidatahackathon/static` (same folder as `main.py`) |
| **JS from static** | Yes. HTML references e.g. `/static/user.js`, `/static/admin.js`, `/static/map.js` — served by this mount if server run from `cgidatahackathon`. |
| **HTML in static** | Yes. All HTML files live in `static/`: `index.html`, `admin.html`, `clinician_dashboard.html`. They are **not** served by the `/static` mount for navigation; they are served by **explicit `@app.get()` routes** (see D). |

**Important:** The mount serves **assets** (JS, CSS, etc.). **HTML pages are not** served by navigating to `/static/index.html`; they are served by dedicated routes returning `FileResponse(STATIC_DIR / "…")`.

---

### C — Template Configuration

| Item | Finding |
|------|--------|
| **Jinja2Templates** | **Not used.** No `Jinja2Templates(directory="templates")` in `main.py`. |
| **templates directory** | **Does not exist** under `cgidatahackathon`. |
| **Rendering pattern** | **Static HTML only.** All pages are plain HTML files in `static/` returned via `FileResponse`. |

---

### D — HTML Routes (GET Routes That Return HTML)

Every route that returns an HTML **page** is implemented as an explicit `@app.get(...)` returning `FileResponse(...)`.

| Route path | HTML file served | Method |
|------------|------------------|--------|
| `/` | `static/index.html` | `FileResponse(STATIC_DIR / "index.html")` |
| `/admin` | `static/admin.html` | `FileResponse(STATIC_DIR / "admin.html")` |
| `/clinician-dashboard` | `static/clinician_dashboard.html` | `FileResponse(STATIC_DIR / "clinician_dashboard.html")` |

**Routes that do NOT exist (and therefore return 404):**

| Requested path | Backend route exists? | Result |
|----------------|------------------------|--------|
| `/dashboard` | **No** | **404** |
| `/command-center` | **No** (only `/clinician-dashboard` exists) | **404** |
| `/command_center` | **No** | **404** |
| `/results` | **No** | **404** |

There are no other `@app.get(...)` routes that return HTML. All other `@app.get` routes return JSON (e.g. `/api/health`, `/api/services`, `/admin/metrics`).

---

### E — Static Directory Contents

**Directory:** `cgidatahackathon/static/`

| File | Present | Served as page by route |
|------|---------|--------------------------|
| `index.html` | Yes | `/` |
| `admin.html` | Yes | `/admin` |
| `clinician_dashboard.html` | Yes | `/clinician-dashboard` |
| `user.js` | Yes | Asset via `/static/user.js` |
| `user.css` | Yes | Asset via `/static/user.css` |
| `admin.js` | Yes | Asset via `/static/admin.js` |
| `admin.css` | Yes | Asset via `/static/admin.css` |
| `clinician_dashboard.js` | Yes | Asset via `/static/clinician_dashboard.js` |
| `clinician_dashboard.css` | Yes | Asset via `/static/clinician_dashboard.css` |
| `map.js` | Yes | Asset via `/static/map.js` |

**Files that do NOT exist (and are not required for current design):**

- `dashboard.html` — not in repo. Admin dashboard is `admin.html` (served at `/admin`).
- `command_center.html` — not in repo. Command Center is `clinician_dashboard.html` (served at `/clinician-dashboard`).
- `results.html` — not in repo. Results are shown in-app on `index.html` (view `results-view`), not a separate page.

**Templates directory:** `cgidatahackathon/templates/` **does not exist.**

---

### F — Frontend Navigation Links

**HTML `href` (navigation to full pages):**

| Source file | Link | Intended destination | Backend route exists? |
|-------------|------|----------------------|------------------------|
| `static/index.html` | `<a href="/admin">` | Clinician / Admin View | Yes — `/admin` |
| `static/admin.html` | `<a href="/clinician-dashboard">` | Command Center | Yes — `/clinician-dashboard` |
| `static/admin.html` | `<a href="/">` | Patient View | Yes — `/` |
| `static/clinician_dashboard.html` | `<a href="/">` | Patient View | Yes — `/` |
| `static/clinician_dashboard.html` | `<a href="/admin">` | Clinician Dashboard | Yes — `/admin` |

**No frontend link in the codebase points to `/dashboard`, `/command-center`, or `/results`.**  
If users or external docs/bookmarks use those URLs, the backend has no matching route → **404**.

**Landing “navigation” (patient app) — client-side only (no full-page request):**

- The three “Choose your path” options are **buttons**, not links: `#route-care`, `#route-directory`, `#route-scribe`.
- In `static/user.js` (lines 941–943):
  - `#route-care` → `showCareIntake()` → shows `#chat-view` (in-page).
  - `#route-directory` → `showServiceDirectory()` → shows `#service-directory-view`.
  - `#route-scribe` → `showScribePortal()` → shows `#scribe-view`.
- **No `window.location` or `fetch` to `/dashboard`, `/command-center`, or `/results` for these buttons.**

So:

- **If “buttons do nothing”:** Either (1) `user.js` does not load (e.g. 404 on `/static/user.js` because server is run from the wrong directory, or wrong base URL), or (2) a JavaScript error occurs before the event listeners are attached (lines 941–943), or (3) the page opened is not the one served by this app (e.g. a different `index.html` from the repo root).
- **If “routes return 404”:** Those routes are **not** registered. The app uses `/`, `/admin`, and `/clinician-dashboard` only.

---

## 3. Root Cause Summary

**Why `/dashboard` returns 404**  
There is no `@app.get("/dashboard")` (and no `dashboard.html`). The clinician dashboard is served at **`/admin`** (file `admin.html`).

**Why `/command-center` returns 404**  
There is no `@app.get("/command-center")`. The Command Center is served at **`/clinician-dashboard`** (file `clinician_dashboard.html`). Frontend uses `href="/clinician-dashboard"`; nothing in code uses `/command-center`.

**Why `/results` returns 404**  
There is no `@app.get("/results")` and no `results.html`. “Results” are a view inside the patient app (`index.html`, view `#results-view`), not a separate route.

**Why “initial UX buttons do nothing” (if observed)**  
The landing buttons rely on `user.js` and in-page view switching. If `user.js` fails to load (404, wrong origin, or server run from wrong directory so `STATIC_DIR` is wrong) or any script error prevents the listeners at the end of `user.js` from running, the buttons will do nothing. No backend route is involved for those clicks.

---

## 4. Expected vs Actual Architecture

- **Expected (directive):** Option A (template routing) or Option B (static HTML with `html=True`). Optionally, routes like `/dashboard`, `/command-center`, `/results` should work.
- **Actual:** Static HTML only, no templates. Three explicit routes serve HTML: `/` → `index.html`, `/admin` → `admin.html`, `/clinician-dashboard` → `clinician_dashboard.html`. No routes for `/dashboard`, `/command-center`, or `/results`.

---

## 5. Implementation Plan (Minimal Safe Fix)

**Constraint:** Only the UI routing layer may change. Do **not** modify `klara_core/routing_engine.py`, `klara_core/optimization.py`, `klara_core/graph/decision_graph.py`, or response schema fields (`primary_pathway`, `options`, `optimizer`, `care_sequence`).

**Goal:** Restore working UI navigation so that `/`, `/admin`, `/dashboard`, `/command-center`, and `/results` load correctly, and ensure initial UX buttons work.

### Recommended changes (backend only — `main.py`)

1. **Add alias routes so that requested URLs no longer 404:**
   - **`GET /dashboard`** → serve the same content as `/admin` (e.g. `FileResponse(STATIC_DIR / "admin.html")`). This makes “dashboard” and “admin” interchangeable.
   - **`GET /command-center`** → serve the same content as Command Center (e.g. `FileResponse(STATIC_DIR / "clinician_dashboard.html")`). Optionally add a redirect: `GET /command-center` → `RedirectResponse(url="/clinician-dashboard", status_code=302)` and keep `/clinician-dashboard` as the canonical route; or serve the same HTML at both paths.
   - **`GET /results`** → serve the patient app so “results” is just the main app (e.g. `FileResponse(STATIC_DIR / "index.html")`). Alternatively, redirect: `GET /results` → `RedirectResponse(url="/", status_code=302)` so results are seen after in-app flow.

2. **Do not add or change:** Jinja2, templates directory, or core routing/optimizer logic.

### Frontend (optional, for consistency)

- If any link or doc points to `/command-center`, either:
  - Update it to `href="/clinician-dashboard"`, or  
  - Rely on the new `/command-center` route above so the link works without change.
- No change required for the three landing buttons if `user.js` loads correctly; if 404s on static assets are confirmed, ensure the server is run from `cgidatahackathon` so `STATIC_DIR` is correct and `/static/*` resolves.

### Verification after fix

- Open `/`, `/admin`, `/dashboard`, `/command-center`, `/results` in the browser; all should return 200 and the intended page.
- From the patient app, click “Need Help Finding Care”, “I Know What Service I Need”, “Physician / NP Portal” and confirm the in-page views switch.
- Confirm “Clinician / Admin View” and “Command Center” links from the UIs still work (they already point to `/admin` and `/clinician-dashboard`).

---

## 6. Critical Architecture Protection (Verified Unchanged)

- **Not modified by this audit:**  
  `klara_core/routing_engine.py`, `klara_core/optimization.py`, `klara_core/graph/decision_graph.py`  
- **Response contract:**  
  Fields `primary_pathway`, `options`, `optimizer`, `care_sequence` remain part of the canonical routing contract; no schema or API contract changes were proposed.

---

**End of audit. No code was modified. Implementation plan is for the minimal safe fix to the UI routing layer only.**
