# KLARA OS — Backend–Frontend Connectivity Audit

**Date:** 2026-03-09  
**Purpose:** Verify that the backend (FastAPI) is correctly connected to the frontend (static HTML/CSS/JS) and explain why the app might "look the same" or appear disconnected after uploading the `cgidatahackathon` folder.

---

## 1. Executive Summary

| Check | Status | Notes |
|-------|--------|--------|
| Backend serves correct frontend | ✅ | Only when server is run **from** `cgidatahackathon` |
| Static assets path | ✅ | `STATIC_DIR = main.py directory / "static"` |
| Frontend API calls | ✅ | All use relative URLs (`/assess`, `/api/...`) — require same origin |
| **Two different `index.html` files** | ⚠️ | Root `index.html` is **not** the app; app lives in `cgidatahackathon/static/` |

**Conclusion:** The backend and frontend are wired correctly **inside** `cgidatahackathon`. The app will "look the same" or wrong if (1) you open the **wrong** `index.html`, (2) you run the server from the **wrong directory**, or (3) the browser is caching an old page.

---

## 2. Repository Layout (Relevant to Connectivity)

```
cgi klara/                          ← Workspace / repo root
├── index.html                      ← ⚠️ NOT THE APP — "Architecture & Live Demo" (long narrative/flowchart)
├── cgidatahackathon/               ← ✅ KLARA app (backend + frontend)
│   ├── main.py                     ← Backend entrypoint (FastAPI)
│   ├── klara_core/                 ← Backend logic
│   ├── klara_data/                 ← Data & schemas
│   ├── static/                     ← Frontend (served by FastAPI)
│   │   ├── index.html              ← ✅ Patient-facing app (landing, chat, map)
│   │   ├── admin.html              ← Clinician dashboard
│   │   ├── clinician_dashboard.html
│   │   ├── user.js, user.css       ← Patient UI logic & styles
│   │   ├── admin.js, admin.css
│   │   ├── map.js
│   │   └── ...
│   └── docs/
```

- **Only** `cgidatahackathon/main.py` runs the API and serves files from `cgidatahackathon/static/`.
- The **root** `index.html` (under `cgi klara/`) is a separate, static “Architecture & Live Demo” page. It is **not** served by the Klara backend and does **not** call `/assess` or any Klara API.

---

## 3. How the Backend Serves the Frontend

**File:** `cgidatahackathon/main.py`

| Item | Implementation |
|------|----------------|
| Static directory | `STATIC_DIR = Path(__file__).parent / "static"` → resolves to `cgidatahackathon/static` when `main.py` is in `cgidatahackathon` |
| Static mount | `app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")` → `/static/*` serves files from that folder |
| Root URL `/` | `FileResponse(STATIC_DIR / "index.html")` → serves **`cgidatahackathon/static/index.html`** |
| `/admin` | `FileResponse(STATIC_DIR / "admin.html")` |
| `/clinician-dashboard` | `FileResponse(STATIC_DIR / "clinician_dashboard.html")` |

So:

- The **only** way the backend serves the real app is from **`cgidatahackathon/static/index.html`**.
- That happens only when the process running FastAPI has **`main.py` inside `cgidatahackathon`** (i.e. you run the server from `cgidatahackathon` or set Python path accordingly).

---

## 4. Frontend → Backend API Touchpoints

All frontend calls use **relative URLs** (e.g. `/assess`, `/api/...`). They work only when the **page** is served from the **same origin** as the API (e.g. `http://localhost:8000`).

| Frontend file | API / endpoint | Purpose |
|---------------|----------------|---------|
| `static/user.js` | `POST /assess` | Run full intake and get routing recommendation |
| `static/user.js` | `GET /api/symptoms?complaint=...` | Parse complaint (optional path) |
| `static/user.js` | `GET /api/services` | Service directory |
| `static/user.js` | `GET /api/demand-pressure` | Map heatmap data |
| `static/user.js` | `GET /api/nearby?pathway=...` | Directions / nearby |
| `static/user.js` | `POST /api/requests` | Submit request (with care_sequence, optimizer) |
| `static/user.js` | `GET /api/scribe/enroll` (POST) | Scribe enrollment |
| `static/admin.js` | `POST /assess` | Admin assessment |
| `static/admin.js` | `GET /admin/metrics` | Governance metrics |
| `static/admin.js` | `GET /api/requests` | List/filter requests |
| `static/map.js` | `GET /api/ns-healthcare-nodes` | Map nodes |
| `static/map.js` | `GET /api/config` | Mapbox token etc. |
| `static/clinician_dashboard.js` | `GET /admin/metrics`, `GET /api/requests`, etc. | Command Center |

If the HTML is opened via **file://** or from another server/port, these relative requests go to the wrong place and the frontend will not be “connected” to the Klara backend.

---

## 5. Why It Might “Look the Exact Same” or Disconnected

1. **Opening the wrong `index.html`**  
   - Opening **repo root** `index.html` (e.g. from file explorer or “Open in Browser” on the root file) shows the **Architecture & Live Demo** page, not the Klara app.  
   - That page does not use the FastAPI backend and will never show the app’s landing (Need Help Finding Care, etc.), chat, or map.

2. **Server not run from `cgidatahackathon`**  
   - If you run e.g. `uvicorn main:app` from **`cgi klara`** (parent of `cgidatahackathon`), `Path(__file__).parent` can resolve to the wrong directory, so `STATIC_DIR` may point to a different or missing `static` folder and the server may not serve the correct (or any) `index.html`.

3. **Wrong URL**  
   - You must open the app at the URL where the FastAPI app is running (e.g. `http://localhost:8000/` or your deployed base URL).  
   - Opening something like `http://localhost:8000/../index.html` or a different port can show a different page or fail.

4. **Browser cache**  
   - Old HTML/JS/CSS can be cached. Hard refresh (Ctrl+Shift+R / Cmd+Shift+R) or opening in an incognito window ensures you get the latest `cgidatahackathon/static` assets.

5. **Deployment / upload**  
   - If you “uploaded” only the repo root or a folder that does **not** contain `cgidatahackathon/main.py` and `cgidatahackathon/static/`, the running app is not the Klara app, so it will look different or “the same” (e.g. narrative page only).

---

## 6. Connectivity Checklist

Use this to confirm backend–frontend connection:

- [ ] **Run the server from `cgidatahackathon`**  
  `cd cgidatahackathon` then `python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000` (or your port).

- [ ] **Open the app in the browser at the server origin**  
  e.g. `http://localhost:8000/` (not a path to a different `index.html`).

- [ ] **Confirm you see the Klara app UI**  
  - Title: “KLARA OS — Nova Scotia Healthcare Navigation”.  
  - Landing with three route cards: “Need Help Finding Care”, “I Know What Service I Need”, “Physician / NP Portal”.  
  - If you see “Architecture & Live Demo” and a long flowchart, you are on the **root** `index.html`, not the app.

- [ ] **Test an API from the app**  
  - Click “Need Help Finding Care”, complete intake, and get a recommendation.  
  - If you get a recommendation and map/options, the frontend is talking to the backend.

- [ ] **Optional: hard refresh**  
  Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac) to avoid cached assets.

---

## 7. Optional: Backend Connectivity Indicator

To make “backend connected” visible in the UI:

1. Add a lightweight **health** endpoint in `main.py`, e.g.  
   `GET /api/health` → `{"status": "ok", "app": "klara"}`.
2. On load, have `user.js` (or a small script in `static/index.html`) call `fetch('/api/health')` and update the system status bar (e.g. “Backend connected” vs “Backend unreachable”).

This does not change routing or app logic; it only confirms that the page is served by the same origin and the API is reachable.

---

## 8. Summary Table

| Question | Answer |
|----------|--------|
| Is the backend connected to the frontend in code? | Yes. `main.py` serves `static/index.html` at `/` and mounts `static/` at `/static`. |
| Which `index.html` is the app? | `cgidatahackathon/static/index.html`. The root `index.html` is not the app. |
| Why might it look the same / wrong after upload? | Wrong file opened, wrong run directory, wrong URL, or caching. |
| What must I do to see the real app? | Run uvicorn from `cgidatahackathon`, open `http://<host>:<port>/`. |

This audit should be re-run if you change where `main.py` or `static/` live, or add a separate frontend server (e.g. SPA dev server) that proxies to the backend.
