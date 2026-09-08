# risk-sim — Explainable Real-Time Fraud Risk Engine

**A production-style fraud detection system that combines supervised ML, unsupervised anomaly detection, drift monitoring, and per-decision explainability — built to show not just *that* a transaction is risky, but *why*.**

[![Live Frontend](https://img.shields.io/badge/Demo-Live-brightgreen)](https://risk-sim.vercel.app/)
[![Backend Health](https://img.shields.io/badge/API-Online-blue)](https://risk-sim-xqou.onrender.com/health)
[![Python](https://img.shields.io/badge/Python-3.12-blue)](#tech-stack)
[![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688)](#tech-stack)
[![React](https://img.shields.io/badge/React%20%2B%20TypeScript-Frontend-61DAFB)](#tech-stack)
[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-black)](#tech-stack)
[![License](https://img.shields.io/badge/License-MIT-lightgrey)](#license)

🔗 **Live App:** [risk-sim.vercel.app](https://risk-sim.vercel.app/)
🔗 **Backend Health Check:** [risk-sim-xqou.onrender.com/health](https://risk-sim-xqou.onrender.com/health)

> ⚠️ The backend is hosted on Render's free tier and may take 30–60 seconds to spin up on first request after inactivity.

---

## 📌 Overview

`risk-sim` is a full-stack fraud-risk engine built around one core idea: **fraud detection systems shouldn't just be accurate — they should be explainable, auditable, and honest about their own limitations.**

A FastAPI backend turns raw transaction data into leak-safe engineered features, scores them through a **fused RandomForest + IsolationForest pipeline**, and returns a calibrated risk score with a **SHAP-based, per-transaction explanation**. A React + TypeScript dashboard visualizes live scoring, drift status, audit trails, and "what-if" simulations for demo and review purposes.

The project is designed to answer a realistic fraud-risk brief: *catch both known and novel payment fraud patterns while keeping every decision explainable, auditable, and resilient to failure.*

---

## ✨ Key Features

- **Hybrid Detection** — A `RandomForestClassifier` catches known fraud patterns; an `IsolationForest` flags statistically unusual behavior the classifier has never seen labeled examples of. Their outputs are fused into a single `ALLOW / REVIEW / BLOCK` decision.
- **Explainable AI** — Every `/predict` response includes a real, SHAP-computed explanation of exactly which features pushed the risk score up or down for that specific transaction.
- **Cost-Aware Decisioning** — Decision thresholds are chosen by minimizing an explicit cost function that weighs missed fraud against false declines (`/model/cost-curve`).
- **Drift Monitoring & Adaptive Thresholds** — A PSI-based drift monitor tracks live traffic against the training distribution and automatically (and transparently) tightens ALLOW/BLOCK thresholds when drift increases — with a disclosed A/B/C experiment proving out its actual effect.
- **Resilience by Design** — A circuit breaker falls back to a deterministic rule engine if the ML pipeline fails, instead of crashing or silently allowing every transaction through. Failure can be demoed live and reversed on demand.
- **Tamper-Evident Audit Trail** — A hash-chained audit log (à la git commits) records every prediction, OTP event, and rate-limit trip, with integrity verification exposed via API.
- **Honest-by-Design Frontend** — The UI never fabricates data when the backend is unreachable; it shows an explicit "Risk Engine Unavailable" state instead of a fake score. All illustrative/static figures are clearly labeled as such.
- **Step-Up Verification & Rate Limiting** — Borderline transactions can trigger a demo-safe OTP challenge; all sensitive endpoints are protected by per-endpoint rate limiting.
- **Real-World Benchmark** — Includes a separate model trained and evaluated on the public **IEEE-CIS Fraud Detection** dataset, kept isolated from the live synthetic-data pipeline for methodological honesty.

---

## 🏗️ Architecture

```
┌──────────────┐     ┌──────────────────────┐     ┌────────────────┐
│  simulator/   │ --> │  feature_engineering  │ --> │  train_model    │
│  (synthetic   │     │  (risk_engine/)        │     │  (simulator/)   │
│  tx generator)│     │  leak-safe, shift /     │     │  RandomForest + │
└──────────────┘     │  expanding windows only │     │  IsolationForest│
                      └──────────────────────┘     └────────┬────────┘
                                                              │
                                                              ▼
                                                   ┌────────────────────┐
                                                   │  backend/main.py    │
                                                   │  FastAPI:            │
                                                   │  /predict             │
                                                   │  /model/metrics       │
                                                   │  /model/cost-curve    │
                                                   │  /drift/status,reset  │
                                                   │  /audit/recent        │
                                                   └──────────┬──────────┘
                                                              │ REST / JSON
                                                              ▼
                                                   ┌────────────────────┐
                                                   │     frontend/        │
                                                   │  Dashboard, What-If,  │
                                                   │  Model View, Audit,   │
                                                   │  Demo Scenario, etc.  │
                                                   └────────────────────┘
```

---

## 🧠 How Detection Works

| Model | Question it answers |
|---|---|
| **RandomForest** | "Does this look like a known kind of fraud we've seen labeled examples of?" |
| **IsolationForest** | "Does this look statistically unlike normal behavior at all — known or not?" |

Fusing both signals catches known *and* novel attack patterns without over-triggering. Importantly, an anomaly flag alone never auto-blocks a transaction — novel-but-uncertain behavior is escalated to `REVIEW` for human review, not unilaterally blocked.

---

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| **Backend** | Python 3.12, FastAPI, uvicorn, scikit-learn (RandomForest, IsolationForest), SHAP, pandas, numpy |
| **Frontend** | React, TypeScript, Vite, Tailwind CSS, lucide-react |
| **Testing** | pytest, httpx (FastAPI `TestClient`) |
| **CI/CD** | GitHub Actions (backend pytest + frontend `tsc --noEmit` build) |
| **Containerization** | Docker (multi-stage frontend build via nginx), Docker Compose |
| **Deployment** | Vercel (frontend), Render (backend) |

---

## 📂 Repository Structure

```
risk-sim/
├── backend/
│   └── main.py                  FastAPI app: /predict, /model/*, /drift/*, /audit/*, /system/*
├── risk_engine/
│   ├── feature_engineering.py   Leak-safe feature construction
│   ├── train_model.py           RandomForest + IsolationForest training
│   ├── explainability.py        SHAP-based per-decision explanations
│   ├── drift_monitor.py         PSI-based concept drift detection
│   ├── adaptive_thresholds.py   Drift-triggered threshold recalibration
│   ├── baseline_model.py        Rule-based fallback / comparison engine
│   ├── audit_chain.py           Hash-chained tamper-evident audit log
│   └── ...                      Additional analysis & resilience modules
├── simulator/
│   └── generate_threat_data.py  Synthetic transaction generator
├── data/                        Raw + processed data, trained model artifacts
├── frontend/
│   └── src/
│       ├── views/                Dashboard, Live Transactions, What-If Simulator,
│       │                         Model Performance, Audit Trail, Demo Scenario
│       ├── components/           Shared UI components
│       └── services/api.ts       Backend client
├── tests/                        pytest suite
├── .github/workflows/ci.yml      CI pipeline (backend + frontend)
├── Dockerfile / docker-compose.yml
├── run_pipeline.py               One-command: generate → engineer → train → diagnose
├── MODEL_CARD.md                 Intended use, performance, known limitations
└── README.md
```

---

## 🚀 Getting Started

### Option 1 — Docker (recommended, no local Python/Node needed)

```bash
git clone https://github.com/gokul-dev47/risk-sim.git
cd risk-sim
docker compose up --build
```

- Backend API → `http://localhost:8000` (`/health` for a liveness check)
- Frontend → `http://localhost:5173`

### Option 2 — Manual Setup

```bash
# Clone
git clone https://github.com/gokul-dev47/risk-sim.git
cd risk-sim

# Backend
pip install -r requirements.txt
python3 run_pipeline.py                       # generate data + train models
python3 -m uvicorn backend.main:app --reload   # start API

# Frontend (in a separate terminal)
cd frontend
npm install
npm run dev
```

### Run Tests

```bash
pytest tests/
```

---

## 🌐 Live Deployment

| Service | URL |
|---|---|
| **Frontend Dashboard** | [risk-sim.vercel.app](https://risk-sim.vercel.app/) |
| **Backend Health Check** | [risk-sim-xqou.onrender.com/health](https://risk-sim-xqou.onrender.com/health) |

---

## 🔌 Key API Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness / readiness check |
| `POST /predict` | Score a single transaction, return decision + explanation |
| `POST /api/v1/simulate-attack` | Live transaction injection through the same scoring pipeline |
| `GET /model/metrics` | Accuracy, precision, recall, confusion matrix |
| `GET /model/cost-curve` | Cost-aware threshold curve |
| `GET /drift/status` | Current drift status (PSI-based) |
| `GET /audit/recent` | Recent decisions for audit / review |
| `GET /model/diagnostics` | Calibration, fairness proxy, latency |
| `GET /system/status` | Circuit breaker state |

*(Full endpoint list available in the source code and API docs at `/docs` when running locally.)*

---

## 📊 Honest Metrics & Model Card

This project deliberately reports metrics most demo projects skip:

- **AUC-PR (Average Precision)** alongside ROC-AUC, since ROC-AUC can look misleadingly strong on imbalanced fraud data.
- **Calibration analysis** (Brier score + Platt scaling comparison).
- A disclosed **A/B/C experiment** measuring whether adaptive thresholding actually improves outcomes — reported honestly, including a null/marginal result.

See [`MODEL_CARD.md`](./MODEL_CARD.md) for full intended-use documentation, performance breakdowns, and known limitations.

---

## ⚠️ Limitations

- The `bin_enumeration` fraud subtype is the weakest-detected pattern (~94.7% recall) — an active area for improvement.
- Fusion precision favors catching more fraud at the cost of a higher false-positive rate — a deliberate but debatable tradeoff.
- The graph-based identity-clustering feature is a standalone ablation study and is **not yet wired into the live model**.
- Drift monitoring recommends retraining but does not perform it automatically; it does automatically (and transparently) tighten decision thresholds.

---

## 🗺️ Roadmap

- [ ] Improve `bin_enumeration` recall via additional BIN-level aggregation features
- [ ] Integrate the graph-based feature into the live model, pending further validation
- [ ] Add human-approved automated retraining *proposals* triggered by drift status
- [ ] Expand the synthetic dataset with more fraud subtypes and seasonal patterns

---

## 🔒 Data & Safety Disclaimer

All transaction data, card numbers, and cost assumptions used in this project are **synthetically generated** for demonstration purposes. This project uses no real card numbers or user data, has no live integration with any production payment system, and is intended strictly as a defensive risk-detection prototype.

---

## 👤 Author

**Gokul** — [GitHub](https://github.com/gokul-dev47)

---

## 📄 License

This project is licensed under the MIT License.
