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
