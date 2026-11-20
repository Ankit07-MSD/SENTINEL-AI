# Sentinel AI

Sentinel AI is an emergency-response decision-support application. It connects
video-based incident detection, operator-reviewed incident records, severity
scoring, resource recommendations, route estimates, and a live dashboard.

## Project structure

- `frontend/` — React and Vite dashboard, resource management, map, live camera,
  analytics, simulation, and historical activity map.
- `backend/` — Node.js and Express APIs, PostgreSQL access, dispatch
  transactions, assignment optimization, Socket.IO updates, and routing.
- `ai-service/` — Python and FastAPI inference endpoints using OpenCV and the
  project's YOLO11 model.
- `docs/schema.sql` — PostgreSQL schema.
- `docs/ROADMAP.md` — implementation roadmap.

The report, research paper, and presentation are maintained separately and are
not included in this source-code repository.

## Requirements

- Node.js and npm
- Python 3.10 or newer
- PostgreSQL
- Browser access to the local frontend, backend, and AI service

## Database setup

Create a PostgreSQL database, then apply the schema from the repository root:

```bash
psql -d sentinel_ai -f docs/schema.sql
```

Create `backend/.env` with local values (never commit this file):

```env
PORT=5000
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/sentinel_ai
JWT_SECRET=replace-with-a-long-random-secret
AI_SERVICE_URL=http://localhost:8000
ROUTING_PROVIDER=osrm
OSRM_BASE_URL=https://router.project-osrm.org
OSRM_TIMEOUT_MS=2500
```

The public OSRM endpoint is intended for light demonstrations. It provides
OpenStreetMap road geometry and estimated driving duration, not live traffic.
For sensitive locations, configure an approved or self-hosted routing service.

## Install and run

Open three terminals from the repository root.

### 1. Backend

```bash
cd backend
npm install
npm run dev
```

The API listens on port `5000` by default.

### 2. AI inference service

```bash
cd ai-service
python -m venv .venv
```

Activate the virtual environment, install dependencies, and run FastAPI:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The active five-class checkpoint is `ai-service/models/sentinel_yolo11_5class.pt`.
If it is absent, the service falls back to the supported legacy checkpoint.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

Open the local URL printed by Vite. Sign in with an account created through the
application's user-management flow.

## Current implementation boundaries

- YOLO11 detects five supported classes: fire, smoke, accident, fallen person,
  and crowd anomaly. Detection quality varies by class.
- Severity currently uses an explainable weighted fallback unless a compatible
  trained artifact is supplied.
- The dashboard risk map summarizes saved, verified incidents in demo zones; it
  is not a trained future-risk forecast.
- Dispatch recommendations require operator approval. Fire incidents can
  request additional ambulance support when an operator identifies a medical
  need.
- Map routing uses OSRM road geometry when available, with local graph and
  straight-line fallbacks. It does not provide live traffic or fleet GPS.
- External CCTV and emergency-service dispatch networks are not connected.

## License and data

Check the licenses and attribution requirements for datasets, map tiles, and
third-party components before redistribution or deployment. Local datasets,
experiment outputs, environment files, academic report artifacts, and
presentation files are excluded by `.gitignore`.
