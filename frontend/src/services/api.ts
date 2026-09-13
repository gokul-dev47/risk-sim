import type {
  PredictRequest,
  PredictResponse,
  Decision,
  FullModelMetrics,
  CostCurveResponse,
  DriftStatusResponse,
  BaselineComparisonResponse,
  StepUpInfo,
  ThresholdBusinessCaseResponse,
  LoadTestResponse,
  EvasionAnalysisResponse,
  AdaptiveEffectivenessResponse,
  SimulateAttackResponse,
  AuditChainResponse,
} from '@/types';

// In production, set VITE_API_URL to your deployed backend's base URL
// (e.g. https://risk-sim-backend.onrender.com) as an environment variable
// on your hosting provider (Vercel/Netlify). Falls back to localhost for
// local `npm run dev` against `docker compose up` / `uvicorn --reload`.
const BACKEND_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8010';

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 3000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// Render free-tier cold start can take 20-50s. Every other function in
// this file uses a short (3-4s) timeout, which is correct for a warm
// backend but means the FIRST request after inactivity always fails
// before the container even finishes booting -- showing "Unavailable"
// panels that then work fine on refresh. warmupBackend() is called once
// on app mount with a long timeout specifically to absorb that cold
// start, so the actual data-fetching calls that follow hit an
// already-warm backend and succeed on their normal short timeout.
export async function warmupBackend(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${BACKEND_URL}/health`, { method: 'GET' }, 60000);
    return res.ok;
  } catch {
    return false;
  }
}
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${BACKEND_URL}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

// Standard shape for every backend-report-backed function below: either
// real backend data, or an explicit 'unavailable' with no data at all.
// NOTHING in this file silently substitutes fabricated/illustrative
// numbers for a real backend figure — if the backend can't be reached,
// callers get `data: null` and must render an explicit unavailable
// state (see components/UnavailablePanel.tsx), never a chart or metric
// that looks real but isn't.
export type ApiResult<T> = { data: T; source: 'backend' } | { data: null; source: 'unavailable'; error: string };

async function fetchJson<T>(path: string, timeoutMs = 3000): Promise<ApiResult<T>> {
  try {
    const res = await fetchWithTimeout(`${BACKEND_URL}${path}`, { method: 'GET' }, timeoutMs);
    if (!res.ok) {
      let detail = `Backend returned HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
      } catch {
        /* non-JSON error body */
      }
      return { data: null, source: 'unavailable', error: detail };
    }
    const data = (await res.json()) as T;
    return { data, source: 'backend' };
  } catch (err) {
    return {
      data: null,
      source: 'unavailable',
      error: err instanceof Error ? err.message : 'Backend unreachable',
    };
  }
}

// A prediction requires the REAL backend scoring pipeline (RandomForest +
// IsolationForest fusion, or the backend's own genuine rule_fallback/
// cold_start_rule engine). There is intentionally NO client-side fraud
// scoring here: an earlier version of this file contained a
// `mockPredict()` function that fabricated a risk score in the browser
// with hand-picked weights and `Math.random()`, and mislabeled it
// `engine: 'ml_fusion'` / `degraded_mode: false` -- i.e. it silently lied
// about which engine produced the number. That has been removed. If the
// backend is unreachable, `predict()` now returns `data: null` and
// `source: 'unavailable'`, and callers must show an explicit
// "risk engine unavailable" state rather than rendering fabricated
// numbers as if they were real. This is different from the static
// dashboard metrics elsewhere in this file (MOCK_METRICS etc.), which
// are disclosed illustrative fallbacks for aggregate/historical reports,
// not a live, per-transaction fraud decision impersonating the model.
export async function predict(
  req: PredictRequest
): Promise<{ data: PredictResponse; source: 'backend' } | { data: null; source: 'unavailable'; error: string }> {
  try {
    const res = await fetchWithTimeout(`${BACKEND_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      let detail = `Backend returned HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.detail) detail = String(body.detail);
      } catch {
        /* response body wasn't JSON; keep the generic status message */
      }
      return { data: null, source: 'unavailable', error: detail };
    }
    const data = (await res.json()) as PredictResponse;
    return { data, source: 'backend' };
  } catch (err) {
    return {
      data: null,
      source: 'unavailable',
      error: err instanceof Error ? err.message : 'Risk engine unreachable',
    };
  }
}

export async function simulateAttack(
  req: PredictRequest
): Promise<{ data: SimulateAttackResponse; source: 'backend' } | { data: null; source: 'unavailable'; error: string }> {
  try {
    const res = await fetchWithTimeout(
      `${BACKEND_URL}/api/v1/simulate-attack`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) },
      6000
    );
    if (!res.ok) {
      let detail = `Backend returned HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
      } catch {
        /* non-JSON error body */
      }
      return { data: null, source: 'unavailable', error: detail };
    }
    const data = (await res.json()) as SimulateAttackResponse;
    return { data, source: 'backend' };
  } catch (err) {
    return {
      data: null,
      source: 'unavailable',
      error: err instanceof Error ? err.message : 'Risk engine unreachable',
    };
  }
}

export async function getModelMetrics(): Promise<ApiResult<FullModelMetrics>> {
  return fetchJson<FullModelMetrics>('/model/metrics', 4000);
}

export async function getCostCurve(): Promise<ApiResult<CostCurveResponse>> {
  return fetchJson<CostCurveResponse>('/model/cost-curve', 4000);
}

export async function getDriftStatus(): Promise<ApiResult<DriftStatusResponse>> {
  return fetchJson<DriftStatusResponse>('/drift/status', 3000);
}

export async function resetDrift(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${BACKEND_URL}/drift/reset`, { method: 'POST' }, 3000);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Full tamper-evident audit chain from GET /audit/chain — includes both
 * normal risk-engine events (predict, otp_issued, rate_limit_triggered, ...)
 * and Razorpay events (razorpay_order_created, razorpay_payment_verified,
 * razorpay_payment_rejected). Returns { entries: [...] }, not { items: [...] }.
 */
export async function getAuditChain(limit = 100): Promise<ApiResult<AuditChainResponse>> {
  return fetchJson<AuditChainResponse>(`/audit/chain?limit=${limit}`, 3000);
}

// ---------------------------------------------------------------------------
// Circuit breaker / system status
// ---------------------------------------------------------------------------

export interface SystemStatus {
  breaker_open: boolean;
  forced_open: boolean;
  model_loaded: boolean;
  fallback_triggers_this_session: number;
}

export async function getSystemStatus(): Promise<ApiResult<SystemStatus>> {
  return fetchJson<SystemStatus>('/system/status', 3000);
}

export async function simulateFailure(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${BACKEND_URL}/system/simulate-failure`, { method: 'POST' }, 3000);
    return res.ok;
  } catch {
    return false;
  }
}

export async function restoreSystem(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${BACKEND_URL}/system/restore`, { method: 'POST' }, 3000);
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Rules-only vs RF vs IsolationForest vs hybrid baseline comparison
// ---------------------------------------------------------------------------

export async function getBaselineComparison(): Promise<ApiResult<BaselineComparisonResponse>> {
  return fetchJson<BaselineComparisonResponse>('/model/baseline-comparison', 4000);
}

// ---------------------------------------------------------------------------
// Step-up OTP verification (demo/simulated only — no real SMS/payment service)
//
// NOTE: unlike the report-style endpoints above, these DO change what the
// user sees as a real outcome (a "verified" step-up can flip a REVIEW into
// an ALLOW). A silent mock fallback here would mean the browser could
// fabricate a verification result and an implied decision when the
// backend — the only place that actually knows the real OTP and the real
// decision policy — is unreachable. So these follow the same
// backend-or-explicit-unavailable contract as predict()/simulateAttack(),
// not the disclosed-static-fallback pattern used for aggregate reports.
// ---------------------------------------------------------------------------

export interface OtpVerifyResult {
  verified: boolean;
  reason: string;
  message: string;
  attempts_remaining?: number;
  final_decision: Decision | null;
  max_attempts: number;
}

export async function requestOtp(
  transactionId?: string
): Promise<{ data: StepUpInfo; source: 'backend' } | { data: null; source: 'unavailable'; error: string }> {
  try {
    const res = await fetchWithTimeout(`${BACKEND_URL}/verify/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id: transactionId ?? null }),
    });
    if (!res.ok) {
      let detail = `Backend returned HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
      } catch {
        /* non-JSON error body */
      }
      return { data: null, source: 'unavailable', error: detail };
    }
    const data = (await res.json()) as StepUpInfo;
    return { data, source: 'backend' };
  } catch (err) {
    return {
      data: null,
      source: 'unavailable',
      error: err instanceof Error ? err.message : 'Risk engine unreachable',
    };
  }
}

export async function confirmOtp(
  verificationId: string,
  code: string
): Promise<{ data: OtpVerifyResult; source: 'backend' } | { data: null; source: 'unavailable'; error: string }> {
  try {
    const res = await fetchWithTimeout(`${BACKEND_URL}/verify/otp/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verification_id: verificationId, code }),
    });
    if (!res.ok) {
      let detail = `Backend returned HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
      } catch {
        /* non-JSON error body */
      }
      return { data: null, source: 'unavailable', error: detail };
    }
    const data = (await res.json()) as OtpVerifyResult;
    return { data, source: 'backend' };
  } catch (err) {
    return {
      data: null,
      source: 'unavailable',
      error: err instanceof Error ? err.message : 'Risk engine unreachable',
    };
  }
}

export async function getAuditChainIntegrity(): Promise<
  ApiResult<{ intact: boolean; checked: number; broken_at_sequence: number | null; detail: string }>
> {
  return fetchJson('/audit/verify-integrity', 3000);
}

// ---------------------------------------------------------------------------
// Risk decision evidence pack
// ---------------------------------------------------------------------------

export interface EvidencePackResult {
  transaction_id: string;
  found: boolean;
  event_count?: number;
  chain_intact?: boolean;
  report_markdown: string;
}

export async function getEvidencePack(transactionId: string): Promise<ApiResult<EvidencePackResult>> {
  return fetchJson<EvidencePackResult>(`/audit/evidence-pack/${encodeURIComponent(transactionId)}`, 4000);
}

// ---------------------------------------------------------------------------
// Phase A: threshold as an explicit business decision
// ---------------------------------------------------------------------------

export async function getThresholdBusinessCase(): Promise<ApiResult<ThresholdBusinessCaseResponse>> {
  return fetchJson<ThresholdBusinessCaseResponse>('/model/threshold-business-case', 4000);
}

// ---------------------------------------------------------------------------
// Phase B: latency under realistic concurrent load
// ---------------------------------------------------------------------------

export async function getLoadTestResults(): Promise<ApiResult<LoadTestResponse>> {
  // The load-test background job runs many concurrent /predict calls
  // after a cold Render boot and can genuinely take 60-90s to finish,
  // longer than a simple /health wake-up. Retry generously to cover
  // that window rather than giving up after ~15s.
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = await fetchJson<LoadTestResponse>('/model/load-test', 4000);
    if (result.source === 'backend') return result;
    if (attempt < 9) await new Promise((r) => setTimeout(r, 8000));
  }
  return fetchJson<LoadTestResponse>('/model/load-test', 4000);
}

// ---------------------------------------------------------------------------
// Phase C: adversarial / evasion spacing analysis
// ---------------------------------------------------------------------------

export async function getEvasionAnalysis(): Promise<ApiResult<EvasionAnalysisResponse>> {
  return fetchJson<EvasionAnalysisResponse>('/model/evasion-analysis', 4000);
}

// ---------------------------------------------------------------------------
// Adaptive-threshold effectiveness experiment
// ---------------------------------------------------------------------------

export async function getAdaptiveEffectiveness(): Promise<ApiResult<AdaptiveEffectivenessResponse>> {
  return fetchJson<AdaptiveEffectivenessResponse>('/model/adaptive-effectiveness', 4000);
}
