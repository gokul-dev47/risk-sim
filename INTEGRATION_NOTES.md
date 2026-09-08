# Integration Notes — Frontend + Backend Merge

This documents how the parallel-built modules (M5-M7, M6, M13) were reconciled
against the real backend contract and existing components.

## What changed from the delivered drafts

All three parallel submissions were built without access to the real
`types.ts`, `services/api.ts`, `Sidebar.tsx`, `App.tsx`, or existing
components — by design, since files couldn't be shared live. Every draft
correctly flagged its own assumptions inline. Reconciliation fixes:

- **Field name drift**: `f1` -> `f1_score`, `subtype_recall: Record<string,number>`
  -> `subtype_recall: {n_test, recall}`, `top_features` -> `top_factors`,
  `rf: {precision,recall}` nested -> flat top-level `precision`/`recall` on
  `FullModelMetrics`.
- **Drift response shape**: real `/drift/status` returns `per_feature: Record<string,{psi,status}>`,
  not an array (`features: FeatureDrift[]`) — `DriftMonitorPanel.tsx` adapted.
- **Audit log shape**: real `AuditLog` type uses `severity/decision/explanation/
  transaction_id`, not `actor/action/details` — `AuditView.tsx` rewritten to
  map and derive severity from decision.
- **TransactionTable**: real component is much richer (filtering, sorting,
  search, risk-score bars) than the reconstructed draft — kept the real
  component untouched, adapted `TransactionsView.tsx` to feed it live data
  in the correct `Transaction` shape instead.
- **KpiCards**: real component is bespoke (self-contained mock data, custom
  icons/colors per card), not a generic `items` list — left untouched,
  added a new `LiveStatusStrip` alongside it instead of replacing it.
- **Backend fix**: `/audit/recent` didn't store the SHAP explanation summary
  per entry — added `explanation_summary` to the in-memory audit buffer in
  `backend/main.py` so `AuditView` shows real reasoning, not synthesized text.
- **Duplicate API layer removed**: `adaptiveApi.ts` and `whatif.types.ts`
  duplicated `services/api.ts`/`types.ts` — deleted, all views now import
  from the single real source of truth.

## Verification performed

- `npx tsc --noEmit` — zero errors
- `npm run build` — clean production build
- Backend `TestClient` smoke test of `/health`, `/predict`, `/model/metrics`,
  `/model/cost-curve`, `/drift/status`, `/audit/recent` — all 200, and the
  new `explanation_summary` field confirmed flowing end-to-end into the
  audit log exactly as `AuditView.tsx` expects.

## IEEE-CIS benchmark endpoint (additive, not part of the M5-M7/M6/M13 merge)

`GET /model/ieee-cis-benchmark` was added to serve
`data/processed/ieee_cis/ieee_cis_metrics.json` (503 if not yet trained).
It is intentionally not consumed by any existing frontend view: the
frontend's `services/api.ts`/`types.ts` contract for the deployed model
(`/model/metrics`, `/predict`, etc.) is unchanged. If a UI panel for this
benchmark is wanted later, it should read from this new endpoint only and
visually/textually distinguish itself as "real-world IEEE-CIS benchmark,
not the deployed BIN-enumeration model" — do not fold its numbers into
`ModelPerformance.tsx` or `KpiCards.tsx` without that distinction, per
DATASET_STRATEGY.md §4/§7.

## Frontend Honesty Pass — No Silent Fallback to Fabricated Data

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
  `KpiCards`) render an explicit "Unavailable" panel
  (`UnavailablePanel.tsx`) instead.
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

## Canonical Transaction Event Contract

`risk_engine/canonical_event.py` defines `CanonicalTransactionEvent`, a
single normalized representation of a payment event, plus three
adapters:

```
synthetic simulator row  --[from_synthetic_row]-->  CanonicalTransactionEvent
Razorpay Test Mode event --[from_razorpay_event]--> CanonicalTransactionEvent
IEEE-CIS benchmark row   --[from_ieee_cis_row]-->    CanonicalTransactionEvent
```

**What's genuinely live, not just a paper adapter:** for `synthetic` and
`razorpay_test_mode` events, `POST /api/v1/score-canonical-event` runs
raw JSON through the full chain — adapter → `derive_live_features` (an
ONLINE, in-memory re-implementation of `feature_engineering.py`'s
per-device rolling velocity / CVV-failure-rate / distinct-cards logic,
keyed by `device_id`) → the exact same `predict()` function backing
`/predict` and `/api/v1/simulate-attack` → RF + IsolationForest + fusion
+ cost-aware decision + SHAP + audit. Sending the same `device_id`
repeatedly within one backend process genuinely raises `velocity_1h` and
can flip the decision, because a real (if simple) per-device history is
being kept, not just accepted and ignored.

**What is NOT claimed:** the online feature derivation is verified — not
assumed — to closely match the offline training pipeline: on a real
device's full transaction history from the synthetic dataset, 392/393
rows (99.7%) match exactly (`tests/test_canonical_event.py`); the one gap
is a same-timestamp tie-breaking edge case, disclosed in the module
docstring. It is also a fresh-per-restart, in-memory-only history (capped
at 500 events/device) — not a persistent feature store, so a device's
first request after a backend restart always starts at `velocity_1h=0`
regardless of real history. And critically: **IEEE-CIS events are
refused** by `derive_live_features` and by
`/api/v1/score-canonical-event`'s schema (422) — `from_ieee_cis_row`
exists only to normalize an IEEE-CIS row's envelope for display purposes,
since its Vesta-anonymized identifiers cannot honestly reconstruct real
velocity/CVV/geo signals (the same reasoning
`risk_engine/ieee_cis_schema.py` already documents for why IEEE-CIS gets
its own independent model instead of being forced into the synthetic
6-feature vector). IEEE-CIS transactions continue to be scored
exclusively by `risk_engine/ieee_cis_train.py`.

## Operational Notes on Specific Endpoints

**`/model/load-test`:** `risk_engine/load_test.py` is intentionally
excluded from `run_pipeline.py` (it drives the full ASGI app in-process
at 4 concurrency levels and is noticeably slower than the other, fast
deterministic scripts). On a **fresh** Docker volume, the container's
entrypoint schedules it to run once automatically **in the background,
after uvicorn is already listening and `/health` returns 200** — it is no
longer a prerequisite for the API (or the frontend, which waits on
`service_healthy`) becoming available. This fixed an earlier version of
the entrypoint where training AND the load test both ran before uvicorn
started, meaning the API was unreachable for the combined duration of
both (~95-135s) even though it can serve requests correctly the moment
training alone finishes (~55-75s). If `/model/load-test` 503s (e.g. an
older data volume from before this behavior existed, the background job
is still running, or it genuinely failed — check
`docker compose logs backend` for a `[load-test]`/`[WARN]` line), run it
manually and it'll populate for subsequent requests without a restart:

```bash
docker compose exec backend python3 risk_engine/load_test.py
```

**`/api/v1/simulate-attack`:** this is the "Jury Transaction Injection"
panel's backend. It is deliberately **not** a separate implementation —
`backend/main.py`'s `simulate_attack()` handler calls `predict()` (the
exact function backing `POST /predict`) directly, then wraps its output
with `directive`/`reason_codes`/`active_thresholds`/`adaptive_posture`
fields for a richer UI. Same trained RF+IsolationForest artifacts, same
fusion logic, same cost-aware thresholds, same SHAP explainer, same audit
chain — verified in
`tests/test_simulate_attack.py::test_simulate_attack_matches_predict_exactly_for_same_input`,
which asserts `risk_score`/`decision`/`engine` are byte-identical to
`POST /predict` for the same input. Malformed/missing-field JSON returns
a normal Pydantic `422`, not a crash or a silently-fabricated result.
`risk_score_type` is always `"model_score"`, never `"probability"` — see
`MODEL_CARD.md` §9 for why. The three example payloads in the UI are
chosen to *naturally* land on ALLOW/BLOCK/REVIEW; no threshold was
adjusted to force them.

## Engineering Incident: Missing Adaptive Risk Analysis Artifacts

During final integration, the application was fully operational, but
three Adaptive Risk Management analyses became unavailable:

- Threshold Business Case
- Evasion Analysis
- Adaptive Effectiveness Experiment

The backend logs showed the corresponding generated artifacts were
missing. Root cause: the Docker startup logic checked only for the
trained model artifact — if the model already existed, the complete
pipeline was skipped even when newer analysis artifacts were absent.

**Recovery** — the missing artifacts were regenerated directly inside the
backend container:

```bash
docker compose exec backend python3 risk_engine/threshold_business_case.py
docker compose exec backend python3 risk_engine/evasion_analysis.py
docker compose exec backend python3 risk_engine/adaptive_effectiveness_experiment.py
```

and verified with:

```bash
docker compose exec backend ls -lh data/processed/
```
