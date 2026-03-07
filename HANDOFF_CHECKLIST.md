# KLARA OS Backend Handoff Checklist

Use this checklist when handing off to the teammate who will connect final API keys/services.

## 1) What Is Included

- Architecture-aligned `/assess` pipeline:
  - Conversational Intake (parser + RAG retrieval stubs)
  - NavigationContext builder/state
  - Risk assessment
  - Provincial context
  - Eligibility + RAG retrieve
  - Optimization routing (Gurobi -> PuLP -> rule fallback)
  - Care pathway assignment
  - Structured output (backend + frontend schema mapping)
- Emergency override path bypasses optimization.
- Backward-compatible `/assess` response fields preserved.
- Additional optional fields included:
  - `frontend_output`
  - `navigation_context`

## 2) Required Local Setup

From repo root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install fastapi uvicorn pydantic python-dotenv pulp
```

Optional (if using Gurobi):

```powershell
pip install gurobipy
```

## 3) Environment Variables

Populate `.env` with real values before production/demo:

- `OPENAI_API_KEY` (currently placeholder)
- `BIOPORTAL_API_KEY`
- `OPENFDA_API_KEY`
- `MEDLINE_PRIMARY` (`europepmc`)
- `MEDLINE_BASE_URL` (`https://www.ebi.ac.uk/europepmc/webservices/rest`)
- `MEDLINE_API_KEY` (`not_required_for_europepmc`)
- `NCBI_BASE_URL` (`https://eutils.ncbi.nlm.nih.gov/entrez/eutils`)
- `NCBI_API_KEY` (leave blank until NCBI fully recovers)
- `EUROPE_PMC_BASE_URL`
- `RXNORM_BASE_URL`
- `RXNORM_API_KEY` (`not_required`)
- `GUROBI_LICENSE_FILE` (`not_required_for_wls` when using WLS)
- `WLSACCESSID` (Gurobi WLS credential)
- `WLSSECRET` (Gurobi WLS credential)
- `LICENSEID` (Gurobi WLS credential)

Notes:

- Europe PMC is the primary Medline source for this build (no API key needed).
- NCBI is configured as fallback once their maintenance window is over.
- RxNorm does not require an API key.
- OpenFDA works with `OPENFDA_API_KEY` and is used for adverse events, recalls, and labeling lookups.
- Gurobi WLS uses `WLSACCESSID` / `WLSSECRET` / `LICENSEID` instead of a local `.lic` file path.

## 4) Run Command

```powershell
uvicorn main:app --reload --port 8000 --env-file .env
```

Verify:

- API root: `http://127.0.0.1:8000`
- Swagger: `http://127.0.0.1:8000/docs`

## 4.5) System compliance script (reload & debug)

Run an extensive compliance check (env, imports, API, /assess pipeline, business rules):

```powershell
cd cgidatahackathon
python scripts/run_compliance.py
```

With a **live server** on port 8000 (e.g. after `uvicorn main:app --port 8000`):

```powershell
python scripts/run_compliance.py --live
```

Or from repo root:

- **Windows (cmd):** `scripts\run_compliance.bat` or `scripts\run_compliance.bat --live`
- **PowerShell:** `.\scripts\run_compliance.ps1` or `.\scripts\run_compliance.ps1 -Live`

The script checks: `.env`, dependencies (FastAPI, PuLP, Gurobi), core imports, static files, GET/POST endpoints, /assess for low/moderate/emergency and RAG signals, and business rules (no ED in options for low acuity, 811 HITL for emergency). Exit code 0 = all passed.

## 5) Smoke Tests

### 5.1 Moderate case

```powershell
$body = @{ text = "I have had fever and headache for 24 hours"; region = "Halifax" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://127.0.0.1:8000/assess" -Method POST -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 6
```

Expect:

- `risk_assessment.level = "moderate"`
- non-empty `routing_recommendation`
- `frontend_output.navigation_summary` present

### 5.2 Emergency override case

```powershell
$body = @{ text = "I have chest pain and shortness of breath"; region = "Halifax" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://127.0.0.1:8000/assess" -Method POST -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 6
```

Expect:

- `risk_assessment.level = "emergency"`
- `routing_recommendation.primary_pathway = "emergency"`
- `navigation_context.routing_result.optimizer.solver = "bypass"`

## 6) Backward Compatibility Contract Check

Confirm these fields still exist in `/assess` response:

- `session_id`
- `patient_input`
- `risk_assessment`
- `opor_context`
- `provincial_context`
- `routing_recommendation`
- `system_context`
- `structured_summary`
- `governance`

## 7) Frontend Integration Notes

- Frontend currently maps legacy fields (`routing_recommendation`, `structured_summary`, `governance`) and can also consume `frontend_output`.
- Endpoint in frontend script should point to:
  - `http://127.0.0.1:8000/assess` (local)
  - or deployed backend URL.

## 8) Remaining Tasks For Final Connect

- Replace placeholder keys/paths in `.env`.
- Wire real LLM reasoning via `OPENAI_API_KEY` where desired.
- Validate BioPortal/OpenFDA usage with real keys (rate limits/quotas).
- Validate Europe PMC primary query + NCBI fallback behavior in logs.
- Validate RxNorm drug resolution and OpenFDA adverse event checks for at least 3 sample drugs.
- Enable Gurobi license path and verify solver selected as `gurobi`.
- Add CORS middleware if frontend served from a different origin.
- Add production logging and error redaction.

## 9) Current Architecture Integrity Status

- Optimization appears after intake/context stages.
- Emergency bypass is preserved and tested.
- Structured output aligns to Layer 1/Layer 3 narrative.
- Canonical pathways supported:
  - `virtualcarens`, `pharmacy`, `primarycare`, `urgent`, `emergency`, `mental_health`, `community_health`

