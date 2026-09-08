# risk-sim

**🔗 Live demo:** _[add your deployed frontend URL here after deploying — see [Deploying](#deploying)]_
**Backend API:** _[add your deployed backend URL here]_ · **API docs:** `<backend-url>/docs`

A hybrid, explainable fraud-risk engine that combines supervised detection
of known attack patterns with unsupervised anomaly detection of novel
ones — and tells a human, in plain language, why it made each call.

Razorpay AI Buildathon — Track 02 (Transaction Risk).

## Screenshots

<!-- Replace these four placeholders with real PNGs/JPGs (or one short
     GIF) once you have a running instance — see docs/screenshots/README.md
     for exactly how. Suggested shots:
     1. Dashboard overview — live transaction feed + KPI cards
     2. What-If Simulator with the SHAP explanation panel open
     3. Demo Scenario view mid-walkthrough, on the BLOCK decision
     4. Drift Monitor panel showing a status flip -->

| | |
|---|---|
| ![Dashboard overview](docs/screenshots/dashboard.png) | ![What-If Simulator](docs/screenshots/whatif.png) |
| ![Demo Scenario — BLOCK](docs/screenshots/demo-block.png) | ![Drift Monitor status flip](docs/screenshots/drift.png) |

## Architecture

```
┌─────────────┐     ┌──────────────────────┐     ┌────────────────────┐
│  simulator/  │ --> │ feature_engineering  │ --> │  train_model        │
│ (synthetic   │     │  (risk_engine/)       │     │  (simulator/)       │
│  tx generator)│    │  leakage-safe,        │     │  RandomForest       │
└─────────────┘     │  shift/expanding       │     │  + IsolationForest  │
                     │  windows only          │     │  fusion             │
                     └──────────────────────┘     └──────────┬─────────┘
                                                              │
                                                              v
                                                    ┌───────────────────┐
                                                    │  backend/main.py   │
                                                    │  FastAPI:           │
                                                    │  /predict            │
                                                    │  /model/metrics      │
                                                    │  /model/cost-curve   │
                                                    │  /drift/status,reset │
                                                    │  /audit/recent       │
                                                    └─────────┬─────────┘
                                                              │ REST/JSON
                                                              v
                                                    ┌───────────────────┐
                                                    │     frontend/       │
                                                    │  Dashboard, WhatIf,  │
                                                    │  ModelView, Audit,   │
                                                    │  Demo Scenario, etc. │
                                                    └───────────────────┘
```

## How it works

- **Data & features**: synthetic transaction streams (`simulator/`) turned
  into leak-safe features (`risk_engine/`) using only backward-looking
  aggregations — no feature can see the future.
- **Hybrid detection**: a `RandomForestClassifier` catches known fraud
  patterns; an `IsolationForest` catches statistically unusual behavior it
  was never labeled on. Their outputs are fused into one decision.
- **Cost-aware decision**: the `ALLOW`/`REVIEW`/`BLOCK` boundary is chosen
  to minimize an explicit, disclosed cost function (`/model/cost-curve`),
  not just accuracy.
- **Explainable**: every `/predict` response includes a real, per-decision
  SHAP explanation — not a canned message.
- **Drift-aware**: a PSI-based drift monitor (`/drift/status`) recommends
  retraining and automatically (bounded, logged, reversible) tightens
  decision thresholds when live traffic diverges from training data — it
  never silently retrains the model itself.
- **Resilient**: a circuit breaker falls back to a deterministic rule
  engine (clearly labeled `rule_fallback`) if the ML path fails, instead
  of erroring or failing open.
- **Auditable**: a hash-chained, tamper-evident audit log backs every
  decision, OTP event, and rate-limit trip, with a per-transaction
  evidence-pack endpoint for dispute response.

All data (transactions, cards, cost assumptions) is **synthetically
generated**; there is no live integration with Razorpay's production
systems. Full technical write-up, honest performance numbers, and known
limitations are in [`MODEL_CARD.md`](MODEL_CARD.md).

## How to run

### Quick start (Docker — recommended)

```bash
git clone https://github.com/gokul-dev47/risk-sim.git
cd risk-sim
docker compose up --build
```

- Frontend: <http://localhost:5173>
- Backend API: <http://localhost:8010> (`/health` for a liveness check, `/docs` for Swagger UI)

On first boot the backend runs the full training pipeline once (only if
`data/processed/` is empty); artifacts persist in a named volume so later
runs skip straight to serving.

### Manual (no Docker)

```bash
# Backend
pip install -r requirements.txt
python3 run_pipeline.py                       # generate data, engineer features, train
python3 -m uvicorn backend.main:app --reload  # http://localhost:8000

# Frontend (separate terminal)
cd frontend
npm install
cp .env.example .env    # VITE_API_URL — defaults to the backend above
npm run dev             # http://localhost:5173
```

### Tests

```bash
pytest tests/
```

## Deploying

The app is two independently deployable pieces: a Dockerized FastAPI
backend and a static Vite/React frontend.

1. **Backend → [Render](https://render.com)** (free tier): New → Web
   Service → connect this repo → Render detects the root `Dockerfile`
   (`render.yaml` in this repo pre-fills the config). Health check path
   is `/health`. Copy the resulting `https://*.onrender.com` URL.
   _(Railway works the same way if you'd rather use that.)_
2. **Frontend → [Vercel](https://vercel.com)** (free tier): New Project →
   this repo → set **Root Directory** to `frontend` → framework preset
   **Vite** → add environment variable `VITE_API_URL` = the Render URL
   from step 1 → Deploy.
   _(Netlify: same idea — base directory `frontend`, build command
   `npm run build`, publish directory `dist`.)_
3. Paste both URLs into the top of this README.

Render's free tier sleeps after ~15 minutes idle and cold-starts in
30-60s on the next request — expected on a free-tier demo, not a bug.

## API endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness/readiness check |
| `POST /predict` | Score a single transaction, return decision + explanation |
| `POST /api/v1/simulate-attack` | Jury/live transaction injection, same pipeline as `/predict` |
| `POST /api/v1/score-canonical-event` | Canonical event contract → online features → same `/predict` pipeline |
| `GET /model/metrics` | Accuracy, precision, recall, confusion matrix, per-subtype recall |
| `GET /model/cost-curve` | Cost-aware threshold curve (synthetic ₹ assumptions) |
| `GET /drift/status` / `POST /drift/reset` | PSI-based drift status / reset |
| `GET /audit/recent` / `GET /audit/chain` / `GET /audit/verify-integrity` | Audit trail + tamper-evidence check |
| `GET /audit/evidence-pack/{id}` | Per-transaction decision evidence pack |
| `GET /model/baseline-comparison` | Model vs. naive rule-based baseline |
| `GET /model/diagnostics` | Calibration, fairness proxy, latency |
| `GET /model/threshold-business-case` | Threshold sweep as merchant operating points |
| `GET /model/load-test` | `/predict` latency under real concurrent load |
| `GET /model/evasion-analysis` | Adversarial spacing-evasion probe |
| `GET /model/adaptive-effectiveness` | A/B/C proof: does adaptive thresholding help? |
| `GET /system/status` / `POST /system/simulate-failure` / `POST /system/restore` | Circuit breaker state + demo controls |

Operational notes on specific endpoints (why `/model/load-test` runs in
the background, how `/api/v1/simulate-attack` is verified byte-identical
to `/predict`, etc.) are in [`INTEGRATION_NOTES.md`](INTEGRATION_NOTES.md).
Full interactive docs: `<backend-url>/docs`.

## Tech stack

- **Backend**: Python 3.12, FastAPI, uvicorn, scikit-learn (RandomForest,
  IsolationForest), SHAP, pandas/numpy.
- **Frontend**: React + TypeScript, Vite, Tailwind CSS, lucide-react.
- **Testing**: pytest + httpx (FastAPI `TestClient`).
- **CI/CD**: GitHub Actions (backend pipeline + pytest, frontend build + `tsc --noEmit`).
- **Containerization**: Docker (multi-stage frontend build via nginx), Docker Compose for local orchestration.

## Repository structure

```
risk-sim/
├── backend/main.py           FastAPI app: /predict, /model/*, /drift/*, /audit/*, /system/*
├── risk_engine/               Feature engineering, training, explainability, drift, audit chain, etc.
├── simulator/                 Synthetic transaction generator
├── data/                      raw/ + processed/ (trained models, metrics — gitignored, regenerable)
├── frontend/src/               views/, components/, services/api.ts, hooks/useLiveFeed.ts
├── tests/                      pytest suite
├── run_pipeline.py             One command: generate -> engineer -> train -> diagnose
├── render.yaml                 Backend deploy config (Render)
├── MODEL_CARD.md                Intended use, honest performance, known limitations
├── INTEGRATION_NOTES.md         Frontend/backend reconciliation + integration verification
└── DATASET_STRATEGY.md          Synthetic vs. real-world (IEEE-CIS) data strategy
```

## Further reading

The deep-dive on model performance, honest limitations, calibration,
resilience design, and the drift-adaptive-threshold A/B/C experiment
lives in **[`MODEL_CARD.md`](MODEL_CARD.md)**. Frontend/backend
integration history, the canonical event contract, and engineering
incident write-ups are in **[`INTEGRATION_NOTES.md`](INTEGRATION_NOTES.md)**.
Synthetic-vs-real-data strategy (including the IEEE-CIS benchmark) is in
**[`DATASET_STRATEGY.md`](DATASET_STRATEGY.md)**.
