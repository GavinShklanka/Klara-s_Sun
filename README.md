# KLARA OS Core Engine Backend

Welcome to the **KLARA OS Core Engine Backend**. This repository hosts a lightweight, modular Python 3.11+ FastAPI backend that serves as a non-diagnostic healthcare navigation intelligence layer tailored for Nova Scotia.

Currently, this repository implements a mock end-to-end pipeline intended for functional testing before integrating LangGraph or live RAG capabilities.

## Features

- **FastAPI Framework**: High-performance, easy-to-use API creation.
- **Strict Data Contracts**: Enforced via Pydantic models to guarantee valid JSON responses.
- **Modular Core Architecture**:
  - `symptom_parser.py`: Extracts and processes symptoms and duration.
  - `risk_engine.py`: Calculates risk scores, severity levels (low, moderate, high), and flags.
  - `routing_engine.py`: Recommends care pathways (e.g., VirtualCareNS, UTC, ED) based on calculated risks and regions.
  - `summary_builder.py`: Synthesizes processed data into a clear, unified structure.

## Repository Structure

```text
klara_backend/
  ├── main.py                     # FastAPI application entry point with /assess endpoint
  ├── klara_core/                 # Core business logic modules
  │   ├── __init__.py
  │   ├── symptom_parser.py       # Mock extraction of symptoms and duration
  │   ├── risk_engine.py          # Mock risk scoring and emergency flagging
  │   ├── routing_engine.py       # Mock care routing recommendations
  │   └── summary_builder.py      # Output aggregation
  ├── klara_data/                 # Data schemas and contracts
  │   ├── __init__.py
  │   └── schemas.py              # Pydantic models defining input/output structures
  ├── .gitignore                  
  └── README.md                   # This documentation file
```

## Getting Started Setup

You will require Python 3.11+ to run this project.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/nkriznar/cgidatahackathon.git
   cd klara_backend
   ```

2. **Create and Activate a Virtual Environment:**
   ```bash
   # Windows (PowerShell)
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   
   # macOS/Linux
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. **Install Dependencies:**
   Install `fastapi` and `uvicorn`.
   ```bash
   pip install fastapi uvicorn
   ```

## Running the Server

Start the local development server using Uvicorn:

```bash
uvicorn main:app --reload --port 8000
```
- Your application will be available at: http://127.0.0.1:8000
- The automatically generated Swagger Core API documentation can be accessed at: http://127.0.0.1:8000/docs

## API Overview

### POST `/assess`

Evaluates patient symptom descriptions to determine associated risks and provides routing recommendations within the Nova Scotia healthcare network.

**Request Payload:**
```json
{
  "text": "I have had a severe headache and high fever for the past 24 hours.",
  "region": "Halifax"
}
```

**Response Example (Conforms to `AssessResponse` Schema Contract):**
```json
{
  "session_id": "aa1c911a-3ae6-47e1-ae76-96fc393da047",
  "patient_input": {
    "text": "I have had a severe headache and high fever for the past 24 hours.",
    "symptoms": [
      "headache",
      "fever"
    ],
    "duration_hours": 24
  },
  "risk_assessment": {
    "score": 55,
    "level": "moderate",
    "emergency_flags": []
  },
  "routing_recommendation": {
    "primary_pathway": "Urgent Treatment Centre (UTC)",
    "reason": "Symptoms warrant medical assessment but are not immediately life-threatening.",
    "options": [
      "UTC in Halifax",
      "VirtualCareNS"
    ]
  },
  "system_context": {
    "region": "Halifax",
    "virtualcare_wait": "2 hours",
    "utc_wait": "4 hours",
    "pharmacy_available": true
  },
  "structured_summary": {
    "symptoms": "headache, fever",
    "duration": "24 hours",
    "risk": "Moderate",
    "recommended_pathway": "Urgent Treatment Centre (UTC)"
  },
  "governance": {
    "confidence_score": 0.92,
    "audit_events": [
      "Symptom text parsed.",
      "Risk assessed based on symptoms.",
      "Pathway recommendation generated."
    ]
  }
}
```

## Next Steps

This repository is currently constructed using functional mocks to ensure system viability. Future development iterations plan to replace these localized stubs with AI services and live retrieval-augmented generation (RAG) connections using LangGraph.
