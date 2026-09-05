import { useState } from 'react';
import { Gavel, Send, Loader2, AlertTriangle, ShieldOff, CheckCircle2, ShieldAlert, Ban } from 'lucide-react';
import { simulateAttack } from '@/services/api';
import type { PredictRequest, SimulateAttackResponse, Decision } from '@/types';
import LiveBadge from '@/components/LiveBadge';
import TopFactorsList from '@/components/TopFactorsList';
import { GLASS_CARD_CLASSES, GLASS_CARD_HEADER_CLASSES, GLASS_CARD_BODY_CLASSES } from '@/components/socStyles';

interface ExamplePayload {
  label: string;
  description: string;
  payload: PredictRequest;
}

// These three payloads are handed to the REAL backend pipeline exactly
// like any other input on this page — nothing here is a canned result.
// They are chosen (not the decision logic) to naturally produce
// ALLOW / BLOCK / REVIEW respectively, matching WhatIfView's presets.
const EXAMPLES: ExamplePayload[] = [
  {
    label: '1. Normal',
    description: 'Typical low-risk checkout — expected: ALLOW',
    payload: { velocity_1h: 1, geo_mismatch: 0, cvv_failure_rate: 0.01, amount_log: 8.2, is_small_amount: 0, distinct_cards_1h: 0 },
  },
  {
    label: '2. Obvious attack',
    description: 'Card-testing burst: high velocity, geo mismatch, many distinct cards — expected: BLOCK',
    payload: { velocity_1h: 28, geo_mismatch: 1, cvv_failure_rate: 0.5, amount_log: 1.5, is_small_amount: 1, distinct_cards_1h: 22 },
  },
  {
    label: '3. Borderline / novel',
    description: 'Low-and-slow pattern: geo mismatch + CVV failures, low velocity — expected: REVIEW',
    payload: { velocity_1h: 1, geo_mismatch: 1, cvv_failure_rate: 0.4, amount_log: 5.2, is_small_amount: 0, distinct_cards_1h: 1 },
  },
];

const DECISION_BADGE: Record<Decision, string> = {
  ALLOW: 'bg-soc-success/15 text-soc-success border-soc-success/40',
  REVIEW: 'bg-soc-warning/15 text-soc-warning border-soc-warning/40',
  BLOCK: 'bg-soc-danger/15 text-soc-danger border-soc-danger/40',
};

const DECISION_ICON: Record<Decision, typeof CheckCircle2> = {
  ALLOW: CheckCircle2,
  REVIEW: ShieldAlert,
  BLOCK: Ban,
};

function prettyJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

export default function JuryInjectionView() {
  const [raw, setRaw] = useState<string>(prettyJson(EXAMPLES[0].payload));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SimulateAttackResponse | null>(null);
  const [source, setSource] = useState<'backend' | 'unavailable' | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);

  function loadExample(example: ExamplePayload) {
    setRaw(prettyJson(example.payload));
    setJsonError(null);
    setResult(null);
    setSource(null);
    setBackendError(null);
  }

  async function handleSend() {
    setJsonError(null);
    let parsed: PredictRequest;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      setJsonError(e instanceof Error ? `Invalid JSON: ${e.message}` : 'Invalid JSON');
      return;
    }

    setIsLoading(true);
    setResult(null);
    setBackendError(null);
    const res = await simulateAttack(parsed);
    setSource(res.source);
    if (res.source === 'backend') {
      setResult(res.data);
    } else {
      setBackendError(res.error);
    }
    setIsLoading(false);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2">
        <Gavel className="w-4 h-4 text-soc-primary" aria-hidden="true" />
        <h3 className="text-base font-semibold text-soc-text font-sans">Jury Transaction Injection</h3>
        <span className="text-xs text-soc-muted">
          — paste raw JSON, it is scored by the exact same RF + IsolationForest + fusion + cost-aware policy
          pipeline as a real checkout transaction (POST /api/v1/simulate-attack calls the identical /predict
          function). No separate demo model, no client-side scoring.
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => loadExample(ex)}
            title={ex.description}
            className="rounded-lg border border-soc-border bg-white/5 px-3 py-1.5 text-xs font-medium text-soc-text transition-colors hover:bg-white/10"
          >
            {ex.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={GLASS_CARD_CLASSES}>
          <div className={GLASS_CARD_HEADER_CLASSES}>
            <h4 className="text-sm font-semibold text-soc-text">Raw Transaction JSON</h4>
          </div>
          <div className={GLASS_CARD_BODY_CLASSES}>
            <textarea
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                setJsonError(null);
              }}
              spellCheck={false}
              rows={14}
              className="w-full rounded-lg border border-soc-border bg-black/30 p-3 font-mono text-xs text-soc-text focus:border-soc-primary focus:outline-none"
            />
            {jsonError && (
              <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-soc-danger/30 bg-soc-danger/10 px-3 py-2 text-xs text-soc-danger">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" aria-hidden="true" />
                {jsonError}
              </div>
            )}
            <button
              type="button"
              onClick={handleSend}
              disabled={isLoading}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-soc-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-soc-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              {isLoading ? 'Scoring…' : 'SEND / ANALYZE'}
            </button>
          </div>
        </div>

        <div className={GLASS_CARD_CLASSES}>
          <div className={GLASS_CARD_HEADER_CLASSES}>
            <h4 className="text-sm font-semibold text-soc-text">Risk Decision</h4>
            {source && <LiveBadge source={source} />}
          </div>
          <div className={GLASS_CARD_BODY_CLASSES}>
            {!result && !backendError && (
              <div className="flex h-64 items-center justify-center text-xs text-soc-muted">
                {isLoading ? 'Scoring…' : 'Send a transaction to see the real decision.'}
              </div>
            )}

            {backendError && (
              <div className="flex h-64 flex-col items-center justify-center gap-2 px-4 text-center">
                <ShieldOff className="h-6 w-6 text-soc-danger" aria-hidden="true" />
                <span className="text-sm font-semibold text-soc-danger">Risk Engine Unavailable</span>
                <span className="max-w-xs text-[11px] text-soc-muted">{backendError}</span>
              </div>
            )}

            {result && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-lg font-bold tracking-wide ${DECISION_BADGE[result.decision]}`}
                  >
                    {(() => {
                      const Icon = DECISION_ICON[result.decision];
                      return <Icon className="h-5 w-5" aria-hidden="true" />;
                    })()}
                    {result.decision}
                  </span>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wide text-soc-muted">
                      {result.risk_score_type === 'model_score' ? 'Risk Score (model output, not calibrated %)' : 'Risk Probability'}
                    </div>
                    <div className="font-mono text-xl font-semibold text-soc-text">
                      {(result.risk_score * 100).toFixed(1)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-soc-border bg-white/5 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-soc-muted">RF Signal</div>
                    <div className="mt-0.5 font-mono text-sm text-soc-text">
                      {(result.rf_signal.probability * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded-lg border border-soc-border bg-white/5 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-soc-muted">IForest</div>
                    <div className="mt-0.5 font-mono text-sm text-soc-text">
                      {result.isolation_forest_signal.is_anomaly ? 'Anomaly' : 'Normal'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-soc-border bg-white/5 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-soc-muted">Fusion</div>
                    <div className="mt-0.5 font-mono text-sm text-soc-text">
                      {result.fusion.fused_prediction === 1 ? 'Flagged' : 'Clear'}
                    </div>
                  </div>
                </div>

                <div>
                  <h5 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-soc-muted">
                    Directive
                  </h5>
                  <div className="rounded-lg border border-soc-border bg-white/5 px-3 py-2 text-xs text-soc-text">
                    <span className="font-mono font-semibold">{result.directive.action}</span>
                    {result.directive.method && (
                      <span className="text-soc-muted"> · method: {result.directive.method}</span>
                    )}
                  </div>
                </div>

                {result.reason_codes.length > 0 && (
                  <div>
                    <h5 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-soc-muted">
                      Reason Codes
                    </h5>
                    <div className="flex flex-wrap gap-1.5">
                      {result.reason_codes.map((code) => (
                        <span
                          key={code}
                          className="rounded-full border border-soc-border bg-white/5 px-2 py-0.5 text-[10px] font-mono text-soc-text"
                        >
                          {code}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {result.top_risk_factors.length > 0 && (
                  <div>
                    <h5 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-soc-muted">
                      Top Risk Factors (SHAP)
                    </h5>
                    <TopFactorsList factors={result.top_risk_factors} />
                  </div>
                )}

                <p className="text-[11px] text-soc-muted">
                  Active thresholds: ALLOW ≤ {(result.active_thresholds.allow_max_probability * 100).toFixed(0)}%,
                  BLOCK ≥ {(result.active_thresholds.block_min_probability * 100).toFixed(0)}%
                  {result.adaptive_posture.adaptation_active ? ' (tightened — live drift detected)' : ' (base policy)'}.
                  Drift posture: <span className="font-mono">{result.adaptive_posture.drift_status}</span>.
                </p>

                <div className="flex items-center justify-between rounded-lg border border-soc-border bg-white/5 px-3 py-2 text-[11px] text-soc-muted">
                  <span>Engine: {result.engine}{result.degraded_mode ? ' (degraded)' : ''}</span>
                  {result.audit_reference && (
                    <span className="font-mono">
                      ✓ audit #{result.audit_reference.sequence} ({result.audit_reference.entry_hash.slice(0, 10)}…)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
