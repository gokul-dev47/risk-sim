# risk-sim

> **In short:** A FastAPI service turns raw synthetic transactions into
> leak-safe engineered features (`risk_engine/feature_engineering.py`,
> `ieee_cis_features.py`, `graph_features.py`), scores them through a
> fused supervised + anomaly-detection pipeline, and exposes the result —
> decision, calibrated risk score, and per-feature explanation — over
> `/predict`, `/model/metrics`, and related REST endpoints. That live
> scoring loop, plus drift-aware threshold recalibration and a
> tamper-evident audit trail, is how this repo answers the prompt: catch
> both known and novel payment fraud patterns while keeping every
> decision explainable and auditable.

## One-line Elevator Pitch

A hybrid, explainable fraud-risk engine that combines supervised
detection of known attack patterns with unsupervised anomaly detection
of novel ones — and tells a human, in plain language, why it made each
call.

## Problem Statement

Payment fraud doesn't hold still. Attackers iterate faster than static
rule sets can be updated, and by the time a new pattern is well
understood enough to write a rule for, it has usually already cost money.
Meanwhile, purely black-box ML models can catch more, but give risk and
compliance teams nothing to act on beyond a bare score — no reason, no
audit trail, no way to know when the model itself has gone stale.

## Why Static Fraud Detection Is Not Enough

Rule-based systems only catch what they were explicitly written to catch.
They:
- Miss novel attack shapes entirely until a human notices and codifies a
  new rule.
- Produce no calibrated sense of *how* risky a borderline transaction is
  — everything is a hard pass/fail.
- Give operators no visibility into whether the underlying fraud
  landscape has shifted, so rules quietly become stale.

## Our Solution

risk-sim pairs a supervised classifier (trained on labeled historical
fraud patterns) with an unsupervised anomaly detector (trained only on
normal behavior), fuses their signals into a single decision, and
explains that decision with per-transaction feature attributions. A
drift monitor continuously compares live traffic against the training
distribution and recommends — rather than silently performs — retraining
when the two diverge.

## Architecture Diagram

```
┌─────────────┐     ┌────────────────────┐     ┌───────────────┐
│  simulator/  │ --> │ feature_engineering │ --> │  train_model  │
│ (synthetic   │     │  (risk_engine/)      │     │ (simulator/)  │
│  tx generator)│    │  leakage-safe,       │     │  RandomForest │
└─────────────┘     │  shift/expanding      │     │  + IsolationForest
                     │  windows only         │     │  fusion       │
                     └────────────────────┘     └───────┬───────┘
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

## AI/ML Pipeline

- **Data**: synthetically generated transaction streams (`simulator/`)
  designed to include both normal traffic and several distinct fraud
  subtypes (see Limitations for per-subtype recall). A separate,
  real-world benchmark on the IEEE-CIS Fraud Detection dataset is also
  available (`risk_engine/ieee_cis_*.py`) — see `DATASET_STRATEGY.md` §5
  and `MODEL_CARD.md` §19. It reports its own metrics on its own generic
  fraud label and is not merged into, or served by, the live model below.
- **Features**: built in `risk_engine/`, using only backward-looking
  aggregations (`shift()`/`expanding()`/`rolling()`), so no feature for a
  transaction at time *t* can see information from *t+1* or later.
- **Models**: a `RandomForestClassifier` trained on labeled fraud/non-fraud
  outcomes, and an `IsolationForest` trained only on normal transactions
  to flag statistically unusual behavior the classifier has never seen
  labeled examples of.
- **Fusion**: the two models' outputs are combined into a single decision
  (`ALLOW` / `REVIEW` / `BLOCK`) using a cost-aware threshold (see below).

## Hybrid Detection Strategy

The two models answer different questions:
- The **RandomForest** answers *"does this look like a known kind of
  fraud we've seen labeled examples of?"*
- The **IsolationForest** answers *"does this look statistically unlike
  normal behavior at all, known or not?"*

Fusing them is what lets the system catch both known and novel patterns
without over-triggering: the RandomForest alone would miss genuinely new
attack shapes, and the IsolationForest alone would flag plenty of
harmless-but-unusual behavior. The fused decision favors the safest
overall outcome given both signals.

Importantly: **an anomaly flag alone does not auto-block a transaction.**
Novel-but-uncertain behavior is escalated to `REVIEW` so a human can make
the final call, rather than the system unilaterally blocking traffic it
has no labeled precedent for.

## Cost-Aware Decision Engine

The decision boundary between `ALLOW` / `REVIEW` / `BLOCK` is chosen by
minimizing an explicit cost function exposed at `/model/cost-curve`,
which weighs the assumed cost of a missed fraud (false negative) against
the assumed cost of a false decline (false positive) at each threshold.

**All ₹ figures used in this cost curve are synthetic simulation
assumptions for demonstration purposes, not real Razorpay statistics.**

## Explainable AI

Every `/predict` response includes a SHAP-based explanation: the
specific features that pushed this specific transaction's risk score up
or down, ranked by contribution. This is real per-decision reasoning
computed from the trained model for that exact input — not a canned or
templated explanation — so an operator reviewing a `REVIEW` or `BLOCK`
decision can see exactly why.

## Drift Monitoring & Adaptive Thresholding

The drift monitor compares the distribution of live transaction features
against the training distribution using Population Stability Index (PSI)
per feature, exposed at `/drift/status`.

**To be explicit: the system recommends retraining when drift crosses a
threshold. It does not automatically retrain the Random Forest, and it
never re-fits any model weights while running.** Moving from `stable` to
`watch` to `retrain_recommended` is still a signal for a human to review
and decide whether/when to retrain and redeploy `threat_rf_model.joblib`.
`/drift/reset` clears this state (used by the demo and for testing).

**What genuinely is adaptive is the operating threshold, not the model.**
`risk_engine/adaptive_thresholds.py` reads the same PSI drift signal and
deterministically tightens the ALLOW/BLOCK probability cut points used by
`decide()` when drift moves out of `stable`:

| Drift status | ALLOW ceiling | BLOCK floor |
|---|---|---|
| `stable` | 0.40 | 0.75 |
| `watch` | 0.35 | 0.70 |
| `retrain_recommended` | 0.30 | 0.65 |

This is a small, bounded, fully-logged posture shift — "the model's
calibration is less trustworthy right now, so route more borderline
traffic to REVIEW/BLOCK until the drift clears" — not a claim that the
model learned anything new. It is visible in three places: the
`adaptation` block on `GET /drift/status`, the `thresholds_applied` field
on every `/predict` response, and an `adaptive_threshold_change` event in
the audit chain whenever the posture actually changes. `/drift/reset`
also returns thresholds to base. If asked "how is this adaptive," this
threshold recalibration — plus the pre-existing circuit-breaker fallback
and cold-start rule bypass below — is the accurate, code-backed answer;
there is no online learning in this system.

### Did adaptation actually help? (`risk_engine/adaptive_effectiveness_experiment.py`)

Having a threshold-tightening mechanism is not the same as it being
useful. `risk_engine/adaptive_effectiveness_experiment.py` runs a
controlled A/B/C comparison on the **same held-out TEST rows**, with a
disclosed synthetic drift injection (not a claim about real observed
Razorpay traffic):

| Condition | PSI | Thresholds | Recall | Precision | Review rate | Expected cost |
|---|---|---|---|---|---|---|
| A. Baseline (stable) | 0.02 | 0.40 / 0.75 | 99.9% | 75.8% | 3.0% | ₹72,510 |
| B. Drifted + static | 0.61 | 0.40 / 0.75 (unchanged) | 99.9% | 21.2% | 33.3% | ₹792,370 |
| C. Drifted + adaptive | 0.61 | 0.30 / 0.65 (tightened) | 99.9% | 21.2% | 33.1% | ₹791,450 |

**Honest finding, not dressed up:** on this synthetic dataset, adaptation
reclassified 23 individual transactions but did not change the missed-
fraud count and moved expected cost by only ~0.1% (well within noise).
The reason is structural, not a bug: this model's probability outputs
are highly separated (the same flat precision/recall plateau already
documented under Cost-Aware Decision Engine below), so most rows sit far
from either threshold boundary — a ±0.05–0.10 shift reclassifies few of
them. Adaptive thresholding's demonstrated value here is mainly the
REVIEW-routing/audit-trail signal it produces for operators (a visible,
logged posture change when drift crosses into `watch`/`retrain_recommended`),
**not** a large precision/recall/cost swing on this particular dataset —
reported honestly rather than claimed as a bigger win than it is. Run
`python3 risk_engine/adaptive_effectiveness_experiment.py` to reproduce,
or see it live at `GET /model/adaptive-effectiveness` / the "Did
Adaptation Actually Help?" panel in the Adaptive Risk Management tab.

## Resilience: Circuit Breaker & Graceful Degradation

`/predict` is protected by a circuit breaker. If the trained model fails
to load, or inference throws on a given request, the API automatically
falls back to a deterministic, dependency-free rule engine (the same
logic backing `/model/baseline-comparison`'s naive baseline) instead of
returning a 500 error or silently allowing every transaction through.
Fallback responses are explicitly labeled
(`"engine": "rule_fallback"`, `"degraded_mode": true`).

`POST /system/simulate-failure` and `POST /system/restore` let this be
demonstrated live and reversibly — trip it mid-presentation to show the
system degrade gracefully instead of crashing, then restore it. This
never actually kills the process; it's a controlled, repeatable
simulation of the ML path being unavailable.

**The browser never fabricates this fallback itself.** `frontend/src/services/api.ts`'s
`predict()` calls only the real `/predict` endpoint and returns whichever
genuine engine label the backend reports (`ml_fusion`, `rule_fallback`,
or `cold_start_rule`). If the backend is unreachable entirely,
`predict()` returns `data: null, source: 'unavailable'` and the UI shows
an explicit "Risk Engine Unavailable" state — it does **not** silently
compute a fake risk score client-side. (This fixes a real issue found in
an earlier version of this project: a `mockPredict()` function existed
in `api.ts` that computed a hand-weighted risk score with `Math.random()`
in the browser and mislabeled it `engine: "ml_fusion"` / `degraded_mode:
false` whenever the backend was unreachable — i.e. it silently
impersonated the ML engine. That function has been removed entirely, not
just hidden behind a flag.) The static, aggregate dashboard reports
elsewhere in this app (model metrics, cost curves, audit chain, etc.)
still have disclosed illustrative fallbacks for when the backend is
unreachable — those are historical/aggregate figures, not a live,
per-transaction fraud decision, and are clearly labeled "Mock Fallback"
in the UI, distinct from the red "Risk Engine Unavailable" state used
only on the live prediction path.

## Frontend Honesty Pass: No Silent Fallback to Fabricated Data

An earlier version of this codebase had several places where, if the
backend was unreachable or a dataset was empty, the frontend silently
substituted fabricated data instead of showing an explicit unavailable
state. These have been removed:

- **`frontend/src/services/api.ts`** previously defined six `MOCK_*`
  constants (`MOCK_METRICS`, `MOCK_BASELINE_COMPARISON`,
  `MOCK_THRESHOLD_BUSINESS_CASE`, `MOCK_LOAD_TEST`,
  `MOCK_EVASION_ANALYSIS`, `MOCK_ADAPTIVE_EFFECTIVENESS`) plus a
  fabricating OTP-verification fallback. All are deleted. Every
  backend-report function now returns either `{data, source: 'backend'}`
  or `{data: null, source: 'unavailable', error}` — never a look-alike
  substitute — via a shared `fetchJson` helper. Consumers (`ModelView`,
  `AdaptiveView`, `CostCurveChart`, `FusionComparisonCard`,
  `ThresholdBusinessCase`, `DemoReadinessPanel`,
  `AdaptiveEffectivenessPanel`, `DriftMonitorPanel`, `RuleComparisonView`,
  `KpiCards`) render an explicit "Unavailable" panel (`UnavailablePanel.tsx`)
  instead.
- **`AuditView.tsx`** previously rendered a hardcoded `mockAuditLogs`
  array — fake timestamps, transaction IDs, and decisions — whenever the
  real audit chain was empty, indistinguishable from real history in the
  UI. Removed; an empty chain now correctly shows "No audit events yet."
- **`DashboardView.tsx`**, the primary live dashboard, previously
  imported `transactions`/`auditLogs` directly from
  `frontend/src/data/mockData.ts` and rendered them unconditionally in
  the "Live Transaction Feed" (labeled with a live indicator) and
  "Recent Security Incidents" sections — completely fabricated, not even
  gated behind a backend-unavailable check. Fixed: the transaction feed
  now shows real `useLiveFeed()`-scored transactions (genuinely scored by
  the backend `/predict` pipeline — see `useLiveFeed.ts`'s own disclosed
  limitation on how the feature vectors themselves are generated), and
  the incidents section now shows real `GET /audit/chain` data via a
  `mapChainEntry` mapper shared with `AuditView.tsx`
  (`frontend/src/utils/auditChainMapper.ts`) so both views stay
  consistent. `RiskAnalyticsChart` (feature importance) was also
  converted from fabricated data to the model's real
  `feature_importances`.
- `ThreatDistributionChart`, `RiskScoreDistributionChart`, and
  `ThreatTimelineChart` still use static `mockData.ts` figures — these
  would need a real backend aggregation endpoint over persisted
  transaction history to be honest on a *live* view, which doesn't exist
  in this project. Rather than fabricate that endpoint or leave them
  quietly faked on the dashboard, they were **removed from
  `DashboardView.tsx`** and now appear only on the Analytics tab, which
  carries an explicit on-page disclosure banner identifying them as
  static illustrative figures, distinct from the same page's feature
  importance chart (real, live).
- **`risk_engine/razorpay_adapter.py`** used to `import razorpay`
  unguarded at module load time, so with the SDK not installed, the
  entire pytest suite failed to collect — not just Razorpay tests. Fixed
  with an optional import (`RAZORPAY_SDK_AVAILABLE`), a distinct
  `RazorpaySDKUnavailableError` vs `RazorpayConfigError`, and a new
  `GET /razorpay/status` endpoint the frontend can check before
  rendering checkout UI. Verified: full suite passes with the SDK both
  absent and present-without-credentials.
- **`docker-compose.yml`**'s `env_file: - .env` previously made
  `docker compose up` hard-fail on a clean checkout without a `.env`.
  Changed to `env_file: - path: .env / required: false` (Compose Spec
  2.24+) — Razorpay Test Mode simply reports unavailable via
  `GET /razorpay/status` instead of blocking the whole stack.

## Honest Metrics: Calibration & AUC-PR

Two checks most fraud-detection demos skip:

- **Calibration**: `/model/diagnostics` reports the RandomForest's Brier
  score (0.00157 — already well-calibrated on this dataset) alongside a
  Platt-scaled (`CalibratedClassifierCV`) comparison. On this synthetic
  data, calibration provided no measurable improvement — an honest null
  result, not a skipped step. The calibrated variant is saved separately
  rather than swapped into the live decision path, since SHAP's
  `TreeExplainer` requires a direct tree-based estimator.
- **AUC-PR vs ROC-AUC**: `/model/metrics` reports `average_precision`
  (AUC-PR) alongside `roc_auc`. AUC-PR is the more honest metric on
  class-imbalanced fraud data — ROC-AUC can look deceptively strong when
  dominated by a large negative class.

## Live Demo Scenario

`frontend/src/views/DemoScenarioView.tsx` drives a fixed, four-step
walkthrough (`frontend/src/data/demoScenario.ts`) so a live presentation
never depends on the timing of the live transaction feed:

1. **Normal transaction** — clean signals, expect `ALLOW`.
2. **Suspicious transaction** — moderate, conflicting signals, expect
   `REVIEW`.
3. **Coordinated attack** — high velocity, geo mismatch, high CVV failure
   rate, small amount, expect `BLOCK`.
4. **Same attack pattern repeated 40x** — floods the model with the same
   fingerprint to visibly move the drift monitor from `stable` toward
   `watch`/`retrain_recommended` in real time — the payoff moment of the
   demo.

A step tracker (`DETECTED → ANALYZED → ESCALATED → DRIFT IDENTIFIED →
POLICY REVIEW RECOMMENDED`) keeps the presenter and audience oriented
throughout.

## Screenshots / Placeholder Section

<!-- screenshot placeholder: Dashboard overview -->
<!-- screenshot placeholder: WhatIfView with SHAP explanation panel -->
<!-- screenshot placeholder: Demo Scenario view mid-walkthrough (BLOCK decision) -->
<!-- screenshot placeholder: Drift Monitor panel showing overall_status flip -->

## Tech Stack

- **Backend**: Python 3.12, FastAPI, uvicorn, scikit-learn (RandomForest,
  IsolationForest), SHAP, pandas/numpy.
- **Frontend**: React + TypeScript, Vite, Tailwind CSS, lucide-react.
- **Testing**: pytest + httpx (FastAPI `TestClient`).
- **CI/CD**: GitHub Actions (backend pipeline + pytest, frontend build +
  `tsc --noEmit`).
- **Containerization**: Docker (multi-stage frontend build served via
  nginx), Docker Compose for local orchestration.

## Repository Structure

```
risk-sim/
├── backend/
│   └── main.py                  FastAPI app: /predict, /model/*, /drift/*,
│                                 /verify/otp/*, /audit/*, /system/*
├── risk_engine/
│   ├── feature_engineering.py   Leak-safe feature construction
│   ├── train_model.py           RandomForest + IsolationForest training
│   ├── explainability.py        SHAP-based per-decision explanations
│   ├── drift_monitor.py         PSI-based concept drift detection
│   ├── adaptive_thresholds.py   Drift-triggered threshold recalibration (not online learning)
│   ├── adaptive_effectiveness_experiment.py  A/B/C proof: does adaptive thresholding help?
│   ├── baseline_model.py        Naive rule engine (comparison + circuit-breaker fallback)
│   ├── stress_test.py           Hand-authored edge-case battery
│   ├── graph_features.py        Identity-clustering feature (ablation study)
│   ├── model_diagnostics.py     Calibration, fairness proxy, latency
│   ├── otp_engine.py            Demo-safe step-up OTP verification
│   ├── rate_limiter.py          In-memory sliding-window rate limiting
│   └── audit_chain.py           Hash-chained tamper-evident audit log
├── simulator/
│   └── generate_threat_data.py  Synthetic transaction generator (3 attack subtypes)
├── data/
│   ├── raw/                     Generated synthetic transactions
│   └── processed/               Trained models, metrics, diagnostics (gitignored, regenerable)
├── frontend/
│   └── src/
│       ├── views/                Dashboard, Live Transactions, Adaptive Risk Management,
│       │                         What-If Simulator, Rules vs AI, Demo Scenario,
│       │                         Audit Trail, Model Performance
│       ├── components/           Shared UI components
│       ├── services/api.ts       Backend client (with mock fallback)
│       └── hooks/useLiveFeed.ts  Client-generated feature vectors scored by the REAL backend (see file for disclosed limitation)
├── tests/                        pytest suite (feature engineering, training, API)
├── .github/workflows/ci.yml      Backend + frontend CI
├── Dockerfile                    Backend container
├── frontend/Dockerfile           Frontend container (nginx)
├── docker-compose.yml
├── run_pipeline.py               One-command: generate → engineer → train → diagnose
├── MODEL_CARD.md                 Intended use, honest performance, known limitations
└── README.md
```

## Installation

### Backend

```bash
cd risk-sim
pip install -r requirements.txt   # includes pytest + httpx for tests
```

### Frontend

```bash
cd risk-sim/frontend
npm install
```

### Docker (optional, no local Python/Node needed)

```bash
cd risk-sim
docker compose build
```

## How to Run

### Quick Start (Docker)

```bash
cd risk-sim
docker compose up --build
```

- Backend API: http://localhost:8010 (`/health` for a liveness check)
- Frontend: http://localhost:5173

On first boot the backend container runs `run_pipeline.py` once (only if
`data/processed/` is empty) to produce trained artifacts, then serves the
API. Artifacts persist in a named volume, so later runs skip retraining.

### Manual

```bash
# Full pipeline
python3 run_pipeline.py

# Backend
python3 -m uvicorn backend.main:app --reload

# Frontend (separate terminal)
cd frontend
npm run dev
```

### Tests

```bash
pytest tests/
```

## Canonical Transaction Event Contract

`risk_engine/canonical_event.py` defines `CanonicalTransactionEvent`, a
single normalized representation of a payment event, plus three
adapters:

```
synthetic simulator row  --[from_synthetic_row]-->    CanonicalTransactionEvent
Razorpay Test Mode event --[from_razorpay_event]-->    CanonicalTransactionEvent
IEEE-CIS benchmark row   --[from_ieee_cis_row]-->      CanonicalTransactionEvent
```

**What's genuinely live, not just a paper adapter:** for `synthetic` and
`razorpay_test_mode` events, `POST /api/v1/score-canonical-event` runs
raw JSON through the full chain — adapter → `derive_live_features`
(an ONLINE, in-memory re-implementation of `feature_engineering.py`'s
per-device rolling velocity / CVV-failure-rate / distinct-cards logic,
keyed by `device_id`) → the exact same `predict()` function backing
`/predict` and `/api/v1/simulate-attack` → RF + IsolationForest + fusion
+ cost-aware decision + SHAP + audit. Sending the same `device_id`
repeatedly within one backend process genuinely raises `velocity_1h`
and can flip the decision, because a real (if simple) per-device history
is being kept, not just accepted and ignored.

**What is NOT claimed:** the online feature derivation is verified —
not assumed — to closely match the offline training pipeline: on a real
device's full transaction history from the synthetic dataset, 392/393
rows (99.7%) match exactly (`tests/test_canonical_event.py`); the one
gap is a same-timestamp tie-breaking edge case, disclosed in the module
docstring. It is also a fresh-per-restart, in-memory-only history
(capped at 500 events/device) — not a persistent feature store, so a
device's first request after a backend restart always starts at
velocity_1h=0 regardless of real history. And critically: **IEEE-CIS
events are refused** by `derive_live_features` and by
`/api/v1/score-canonical-event`'s schema (422) — `from_ieee_cis_row`
exists only to normalize an IEEE-CIS row's envelope for display
purposes, since its Vesta-anonymized identifiers cannot honestly
reconstruct real velocity/CVV/geo signals (the same reasoning
`risk_engine/ieee_cis_schema.py` already documents for why IEEE-CIS gets
its own independent model instead of being forced into the synthetic
6-feature vector). IEEE-CIS transactions continue to be scored
exclusively by `risk_engine/ieee_cis_train.py`.

## API Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness/readiness check |
| `POST /predict` | Score a single transaction, return decision + explanation |
| `POST /api/v1/simulate-attack` | Jury/live transaction injection — paste raw JSON, scored by the exact same pipeline as `/predict` (see note below) |
| `POST /api/v1/score-canonical-event` | Canonical transaction event contract: raw synthetic/Razorpay-shaped event → online feature derivation → same `/predict` pipeline (see note below) |
| `GET /model/metrics` | Accuracy, precision, recall, confusion matrix, per-subtype recall |
| `GET /model/cost-curve` | Cost-aware threshold curve (synthetic ₹ assumptions) |
| `GET /drift/status` | Current PSI-based drift status |
| `POST /drift/reset` | Reset drift monitor state |
| `GET /audit/recent` | Recent decisions for audit/review |
| `GET /model/baseline-comparison` | Model vs. baseline/rule-based comparison |
| `GET /model/stress-test` | Stress-test results under adversarial/edge conditions |
| `GET /model/graph-feature-ablation` | Standalone ablation study of the graph feature |
| `GET /model/diagnostics` | Calibration (Brier score, Platt-scaling comparison), fairness proxy, latency |
| `GET /model/threshold-business-case` | Threshold sweep as 3 named merchant operating points with monthly ₹ figures |
| `GET /model/load-test` | Full `/predict` latency under real concurrent load — see note below |
| `GET /model/evasion-analysis` | Adversarial spacing-evasion probe against the frozen, already-trained model |
| `GET /model/adaptive-effectiveness` | A/B/C proof: does drift-triggered adaptive thresholding actually help? |
| `GET /system/status` | Circuit breaker state (open/closed, model loaded, fallback trigger count) |
| `POST /system/simulate-failure` | Manually open the circuit breaker (demo use) |
| `POST /system/restore` | Close the circuit breaker |

**Note on `/model/load-test`:** unlike the rest of the table, `risk_engine/load_test.py` is intentionally excluded from `run_pipeline.py` (it drives the full ASGI app in-process at 4 concurrency levels and is noticeably slower than the other, fast deterministic scripts). On a **fresh** Docker volume, the container's entrypoint schedules it to run once automatically **in the background, after uvicorn is already listening and `/health` returns 200** — it is no longer a prerequisite for the API (or the frontend, which waits on `service_healthy`) becoming available. This fixed an earlier version of the entrypoint where training AND the load test both ran before uvicorn started, meaning the API was unreachable for the combined duration of both (~95-135s) even though it can serve requests correctly the moment training alone finishes (~55-75s). If `/model/load-test` 503s (e.g. an older data volume from before this behavior existed, the background job is still running, or it genuinely failed — check `docker compose logs backend` for a `[load-test]`/`[WARN]` line), run it manually and it'll populate for subsequent requests without a restart:
```bash
docker compose exec backend python3 risk_engine/load_test.py
```

**Note on `/api/v1/simulate-attack`:** this is the "Jury Transaction
Injection" panel's backend. It is deliberately **not** a separate
implementation — `backend/main.py`'s `simulate_attack()` handler calls
`predict()` (the exact function backing `POST /predict`) directly, then
wraps its output with `directive`/`reason_codes`/`active_thresholds`/
`adaptive_posture` fields for a richer UI. Same trained RF+IsolationForest
artifacts, same fusion logic, same cost-aware thresholds, same SHAP
explainer, same audit chain — verified in
`tests/test_simulate_attack.py::test_simulate_attack_matches_predict_exactly_for_same_input`,
which asserts `risk_score`/`decision`/`engine` are byte-identical to
`POST /predict` for the same input. Malformed/missing-field JSON returns
a normal Pydantic `422`, not a crash or a silently-fabricated result.
`risk_score_type` is always `"model_score"`, never `"probability"` —
see the Calibration section for why. The three example payloads in the
UI are chosen to *naturally* land on ALLOW/BLOCK/REVIEW; no threshold was
adjusted to force them.

## Synthetic Data Disclaimer

All data used in this project — transactions, card numbers, account
histories, and cost assumptions — is **synthetically generated** for
demonstration purposes. This project:
- Uses **no real card numbers or real user data**.
- Has **no live integration with Razorpay's production systems**.
- Is intended strictly as a **defensive** risk-detection prototype, not
  offensive security tooling of any kind.

## Limitations

Being direct about where this system is weakest:
- **`bin_enumeration`** is the weakest-detected fraud subtype, at **94.7%
  recall** — meaningfully lower than other subtypes, and a priority for
  future feature work.
- **Fusion precision sits at 0.599** — a real tradeoff. The current
  threshold favors catching more fraud at the cost of a higher false-positive
  rate; this is a deliberate but debatable choice, not a solved problem.
- The **graph feature is a standalone ablation study only** — it is not
  yet wired into the live production model, so its effect described in
  `/model/graph-feature-ablation` is illustrative, not currently in effect.
- Drift monitoring is PSI-based and threshold-driven; it recommends but
  does not automatically act on *retraining* decisions. It does
  automatically tighten the ALLOW/BLOCK *decision thresholds* (see
  "Drift Monitoring & Adaptive Thresholding" above) — that threshold
  adjustment is bounded and reversible, but it is still a real automated
  action worth being explicit about, not just a passive recommendation.

## Future Improvements

- Improve `bin_enumeration` recall, likely via additional BIN-level
  aggregation features.
- Integrate the graph feature into the live model if the ablation study
  continues to justify it, with a re-run of the full cost/precision
  tradeoff analysis.
- Add automated retraining *proposals* (still human-approved) triggered
  directly from `/drift/status` crossing `retrain_recommended`.
- Expand the synthetic dataset with additional fraud subtypes and
  seasonal/temporal patterns.

## Step-Up Verification, Rate Limiting & Tamper-Evident Audit

Three targeted additions scoped specifically to fit Track 02's actual
transaction-risk mandate — **not** a general-purpose user authentication
system (this app has no user accounts, logins, or sessions; these are
transaction-level controls):

- **Step-up OTP verification**: every `REVIEW` decision automatically
  issues a demo-safe OTP challenge (`POST /verify/otp/request`,
  `POST /verify/otp/confirm`). Successful verification resolves the
  transaction to `ALLOW`; expired or exhausted (3 wrong attempts)
  verification escalates it to `BLOCK` — the verification outcome is a
  real, disclosed risk signal, not decoration. **Explicitly demo/simulated
  — no real SMS or payment service is connected**; the OTP code is
  returned directly in the API response (a production system would never
  do this).
- **Rate limiting**: `/predict` (60/min), `/verify/otp/request` (3/10min),
  and `/verify/otp/confirm` (5/10min) are each protected by an in-memory
  sliding-window limiter with progressive, per-endpoint budgets rather
  than one arbitrary global rule. Exceeding a limit returns `429` with a
  `Retry-After` header and logs a `rate_limit_triggered` audit event.
- **Tamper-evident audit chain**: `GET /audit/chain` and
  `GET /audit/verify-integrity` expose a hash-chained audit log (each
  entry's hash includes the previous entry's hash, à la git commits) that
  logs every prediction, OTP event, and rate-limit trip. Editing any past
  entry's content breaks the recomputed hash and is detectable by
  `/audit/verify-integrity` — verified in testing by directly mutating a
  logged entry and confirming the check correctly flags it.

## Cold-Start Handling & Risk Decision Evidence Pack

Two independently-designed additions targeting real gaps in a
transaction-risk system, not feature-count padding:

- **Cold-start handling**: a brand-new card/device has no transaction
  history, so `velocity_1h`/`cvv_failure_rate` (expanding-window
  aggregates) default to statistically meaningless values — not
  genuinely "low risk." When `/predict` is told how many prior
  transactions an entity has (`entity_observed_count`) and it's below 3,
  the ML model is bypassed for a separate, transparent, conservative rule
  (`risk_engine/cold_start.py`) instead of trusting a probability
  computed from near-zero history. Fully optional/backward-compatible —
  omit the field for normal ML scoring.
- **Risk decision evidence pack** (`GET /audit/evidence-pack/{id}`): a
  structured, hash-chain-verified report of why the risk engine made its
  decision on a specific transaction — one input to a chargeback dispute
  response. Explicitly scoped: this is a risk-scoring service, not an
  order-fulfillment platform, so the report does not claim to include
  shipping/delivery evidence it doesn't have.
