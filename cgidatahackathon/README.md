# KLARA OS — Nova Scotia Healthcare Navigation

A conversational healthcare navigation assistant that helps people in Nova Scotia choose the most appropriate care pathway. The **user interface (patient experience)** and the API are served together by the same application.

## User experience (frontend)

The app serves the full UI. You do **not** deploy static files separately:

- **Patient flow:** Open the root URL in a browser after starting the server (see below).
- **Clinician / Admin:** Same server, path `/admin`.

There is no separate “frontend” repo; the UI is in `static/` and served by the FastAPI backend at `/` and `/admin`.

## Quick start — run the app and open the UI

From this directory (repo root):

```powershell
# 1. Create virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 2. Install dependencies
pip install -r requirements.txt

# 3. Environment (optional for quick run)
# Copy .env.example to .env and add API keys if you have them.
# The app runs without .env; some features (RAG, Gurobi) need keys.

# 4. Start the server (use --env-file .env if you have a .env file)
uvicorn main:app --reload --port 8000
```
If you created a `.env` file: `uvicorn main:app --reload --port 8000 --env-file .env`

Then open in your browser:

| What              | URL                          |
|-------------------|------------------------------|
| **User experience (patient UI)** | http://127.0.0.1:8000        |
| **Clinician / Admin**            | http://127.0.0.1:8000/admin  |
| **API docs (Swagger)**           | http://127.0.0.1:8000/docs   |

Deploying “from root” on a **static host** (e.g. GitHub Pages) will **not** run the UI, because the UI is served by this Python app. To run the user experience you must **run the server** (locally or on a Python-capable host such as Render, Railway, or Fly.io).

If you only see this README when deploying from the repo: static hosts (e.g. GitHub Pages) do not run Python. Run the server locally or on a Python host to see the patient UI.

## Tech stack

- **Backend:** FastAPI (Python 3.11+)
- **UI:** HTML/CSS/JS in `static/` (served by FastAPI)
- **Routing:** Gurobi (optional) → PuLP → rule-based fallback

## Repository structure

- `main.py` — FastAPI app; serves `/` (patient UI), `/admin`, `/assess`, and APIs
- `static/` — Patient and admin UI (index.html, user.js, admin.html, etc.)
- `klara_core/` — Symptom parsing, risk, eligibility, routing, RAG
- `klara_data/` — Pydantic schemas
- `scripts/` — Compliance and trial scripts

See `HANDOFF_CHECKLIST.md` for setup details, environment variables, and smoke tests.
