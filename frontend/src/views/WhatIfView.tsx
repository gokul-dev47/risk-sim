import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, RadioTower, Loader2, SlidersHorizontal, UserPlus, ShieldOff } from 'lucide-react';
import { predict } from '@/services/api';
import LiveBadge from '@/components/LiveBadge';
import FeatureSlider from '@/components/FeatureSlider';
import FeatureToggle from '@/components/FeatureToggle';
import DecisionGauge from '@/components/DecisionGauge';
import TopFactorsList from '@/components/TopFactorsList';
import StepUpVerification from '@/components/StepUpVerification';
import type { Decision, PredictRequest, PredictResponse } from '@/types';

const DEBOUNCE_MS = 300;
const SMALL_AMOUNT_THRESHOLD_INR = 10;

const DECISION_BADGE_CLASSES: Record<Decision, string> = {
  ALLOW: 'bg-soc-success/15 text-soc-success border-soc-success/40',
  REVIEW: 'bg-soc-warning/15 text-soc-warning border-soc-warning/40',
  BLOCK: 'bg-soc-danger/15 text-soc-danger border-soc-danger/40',
};

interface Preset {
  label: string;
  description: string;
  values: PredictRequest;
}

const PRESETS: Preset[] = [
  {
    label: 'Normal shopper',
    description: 'Typical low-risk checkout',
    values: { velocity_1h: 1, geo_mismatch: 0, cvv_failure_rate: 0.01, amount_log: 8.2, is_small_amount: 0, distinct_cards_1h: 0 },
  },
  {
    label: 'Classic card-testing burst',
    description: 'High velocity, geo mismatch, CVV failures',
    values: { velocity_1h: 28, geo_mismatch: 1, cvv_failure_rate: 0.5, amount_log: 1.5, is_small_amount: 1, distinct_cards_1h: 22 },
  },
  {
    label: 'Low-and-slow attack',
    description: 'Low velocity, moderate amounts, spread over time',
    values: { velocity_1h: 1, geo_mismatch: 1, cvv_failure_rate: 0.4, amount_log: 5.2, is_small_amount: 0, distinct_cards_1h: 1 },
  },
  {
    label: 'BIN enumeration',
    description: 'Small device pool cycling through many distinct cards, high CVV failures',
    values: { velocity_1h: 2, geo_mismatch: 0, cvv_failure_rate: 0.65, amount_log: 3.2, is_small_amount: 0, distinct_cards_1h: 4 },
  },
  {
    label: 'New customer (clean)',
    description: 'First-ever transaction, small amount, no risk signals — bypasses ML, uses conservative rule',
    values: {
      velocity_1h: 0,
      geo_mismatch: 0,
      cvv_failure_rate: 0.0,
      amount_log: 2.0,
      is_small_amount: 1,
      distinct_cards_1h: 0,
      entity_observed_count: 0,
    },
  },
  {
    label: 'New customer (risky)',
    description: 'First-ever transaction with a large amount — cold-start rule escalates, ML never consulted',
    values: {
      velocity_1h: 0,
      geo_mismatch: 0,
      cvv_failure_rate: 0.0,
      amount_log: 9.0,
      is_small_amount: 0,
      distinct_cards_1h: 0,
      entity_observed_count: 0,
    },
  },
];

const DEFAULT_VALUES: PredictRequest = PRESETS[0].values;

interface PredictResult {
  data: PredictResponse | null;
  source: 'backend' | 'unavailable';
  error?: string;
}

export default function WhatIfView() {
  const [features, setFeatures] = useState<PredictRequest>(DEFAULT_VALUES);
  const [result, setResult] = useState<PredictResult | null>(null);
  const [resolvedDecision, setResolvedDecision] = useState<Decision | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [flash, setFlash] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);
  const prevDecisionRef = useRef<Decision | null>(null);

  const amountInr = useMemo(() => Math.expm1(features.amount_log), [features.amount_log]);

  useEffect(() => {
    // is_small_amount is NOT an independent feature in the real system —
    // backend/risk_engine/feature_engineering.py derives it purely as
    // `amount <= 10`, always, with no independent toggle. Mirror that
    // exactly here (bidirectional sync) so the UI can never show an
    // internally-inconsistent state like "₹22,025, small amount: ON".
    const shouldBeSmall = amountInr <= SMALL_AMOUNT_THRESHOLD_INR ? 1 : 0;
    setFeatures((prev) => (prev.is_small_amount === shouldBeSmall ? prev : { ...prev, is_small_amount: shouldBeSmall }));
  }, [amountInr]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      const seq = ++requestSeqRef.current;
      setIsLoading(true);
      const res = await predict(features);
      if (seq !== requestSeqRef.current) return;
      setResult(res);
      setResolvedDecision(null); // clear any prior step-up resolution on a fresh prediction
      setIsLoading(false);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [features]);

  useEffect(() => {
    const decision = result?.data?.decision ?? null;
    if (decision && decision !== prevDecisionRef.current) {
      prevDecisionRef.current = decision;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 400);
      return () => clearTimeout(t);
    }
  }, [result]);

  const applyPreset = (preset: Preset) => setFeatures(preset.values);
  const update = <K extends keyof PredictRequest>(key: K, value: PredictRequest[K]) => {
    setFeatures((prev) => ({ ...prev, [key]: value }));
  };

  const decision = resolvedDecision ?? result?.data?.decision;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-soc-primary" />
          <h3 className="text-base font-semibold text-soc-text font-sans">What-If Simulator</h3>
          <span className="text-xs text-soc-muted">— drag the sliders and watch the model react in real time</span>
        </div>
        {result && <LiveBadge source={result.source} />}
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyPreset(preset)}
            title={preset.description}
            className="rounded-lg border border-soc-border bg-white/5 px-3 py-1.5 text-xs font-medium text-soc-text transition-colors hover:bg-white/10"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="glass rounded-2xl p-5">
          <h3 className="mb-4 text-sm font-semibold text-soc-text">Transaction Features</h3>
          <div className="space-y-5">
            <FeatureSlider
              label="Velocity (txns / hr)"
              value={features.velocity_1h}
              min={0}
              max={50}
              step={0.5}
              onChange={(v) => update('velocity_1h', v)}
              formatValue={(v) => v.toFixed(1)}
            />
            <FeatureToggle
              label="Geo mismatch"
              checked={features.geo_mismatch === 1}
              onChange={(checked) => update('geo_mismatch', checked ? 1 : 0)}
            />
            <FeatureSlider
              label="CVV failure rate"
              value={features.cvv_failure_rate}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => update('cvv_failure_rate', v)}
              formatValue={(v) => `${(v * 100).toFixed(0)}%`}
            />
            <FeatureSlider
              label="Distinct cards (1h)"
              value={features.distinct_cards_1h}
              min={0}
              max={30}
              step={1}
              onChange={(v) => update('distinct_cards_1h', Math.round(v))}
              formatValue={(v) => v.toFixed(0)}
              helperText="Different card numbers this device attempted in the past hour — the BIN-enumeration signature. A genuine repeat customer plateaus at 0-1."
            />
            <FeatureSlider
              label="Amount"
              value={features.amount_log}
              min={0}
              max={10}
              step={0.1}
              onChange={(v) => update('amount_log', v)}
              formatValue={(v) => v.toFixed(2)}
              helperText={`≈ ₹${Math.round(amountInr).toLocaleString('en-IN')}`}
            />
            <FeatureToggle
              label="Small amount"
              checked={features.is_small_amount === 1}
              onChange={() => {}}
              autoSynced
              disabled
            />
            <p className="-mt-3 text-[11px] text-soc-muted">
              Fully derived from amount (≤ ₹{SMALL_AMOUNT_THRESHOLD_INR}) — matches the real feature pipeline, not independently settable.
            </p>
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-soc-text">Live Prediction</h3>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-soc-muted" aria-hidden="true" />}
          </div>

          {result?.data ? (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between gap-4">
                <span
                  className={`inline-flex items-center rounded-xl border px-4 py-2 text-lg font-bold tracking-wide transition-transform duration-300 ${
                    DECISION_BADGE_CLASSES[decision as Decision]
                  } ${flash ? 'scale-110' : 'scale-100'}`}
                >
                  {decision}
                </span>
                <DecisionGauge value={result.data.risk_probability} decision={decision as Decision} />
              </div>

              {result.data.engine === 'cold_start_rule' && (
                <div className="flex items-center gap-2 rounded-lg border border-soc-primary/30 bg-soc-primary/10 px-3 py-2 text-xs text-soc-primary">
                  <UserPlus className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                  Cold-start rule engine — ML bypassed. This entity's history is too thin for velocity/CVV
                  aggregates to be statistically meaningful, so a conservative, transparent rule decided instead.
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-soc-border bg-white/5 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-soc-muted">RF Risk</div>
                  <div className="mt-0.5 font-mono text-sm text-soc-text">
                    {(result.data.risk_probability * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="rounded-lg border border-soc-border bg-white/5 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-soc-muted">IForest Anomaly</div>
                  <div className="mt-0.5 font-mono text-sm text-soc-text">{result.data.anomaly_score.toFixed(3)}</div>
                </div>
                <div className="rounded-lg border border-soc-border bg-white/5 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-soc-muted">Fused</div>
                  <div className="mt-0.5 font-mono text-sm text-soc-text">
                    {result.data.fused_prediction === 1 ? 'Flagged' : 'Clear'}
                  </div>
                </div>
              </div>

              {result.data.thresholds_applied && (
                <p className="-mt-2 text-[11px] text-soc-muted">
                  Decision cut points used: ALLOW ≤ {(result.data.thresholds_applied.allow_max_probability * 100).toFixed(0)}%,
                  BLOCK ≥ {(result.data.thresholds_applied.block_min_probability * 100).toFixed(0)}%
                  {result.data.thresholds_applied.adaptation_active ? ' (tightened — live drift detected)' : ' (base policy)'}.
                </p>
              )}

              <div className="flex items-center justify-between rounded-lg border border-soc-border bg-white/5 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <RadioTower className="h-4 w-4 text-soc-muted" aria-hidden="true" />
                  <span className="text-xs font-medium text-soc-text">Novel Pattern Detector</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs tabular-nums text-soc-muted font-mono">
                    score {result.data.anomaly_score.toFixed(3)}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      result.data.is_anomaly
                        ? 'bg-soc-danger/15 text-soc-danger border border-soc-danger/30'
                        : 'bg-soc-success/15 text-soc-success border border-soc-success/30'
                    }`}
                  >
                    {result.data.is_anomaly && <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />}
                    {result.data.is_anomaly ? 'Anomaly' : 'Normal'}
                  </span>
                </div>
              </div>

              <p className="text-sm leading-relaxed text-soc-text">{result.data.explanation.summary}</p>

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-soc-muted">
                  Top Contributing Factors
                </h4>
                <TopFactorsList factors={result.data.explanation.top_factors} />
              </div>

              {result.data.step_up && !resolvedDecision && (
                <StepUpVerification stepUp={result.data.step_up} onResolved={setResolvedDecision} />
              )}

              <div className="flex items-center justify-between rounded-lg border border-soc-border bg-white/5 px-3 py-2 text-[11px] text-soc-muted">
                <span>Audit event recorded — engine: {result.data.engine}</span>
                {result.data.transaction_id && <span className="font-mono">{result.data.transaction_id}</span>}
              </div>
            </div>
          ) : (
            <div className="flex h-48 flex-col items-center justify-center gap-2 px-4 text-center">
              {isLoading ? (
                <span className="text-xs text-soc-muted">Scoring…</span>
              ) : result?.source === 'unavailable' ? (
                <>
                  <ShieldOff className="h-5 w-5 text-soc-danger" aria-hidden="true" />
                  <span className="text-sm font-semibold text-soc-danger">Risk Engine Unavailable</span>
                  <span className="max-w-xs text-[11px] text-soc-muted">
                    The backend scoring pipeline could not be reached
                    {result.error ? `: ${result.error}` : ''}. No score is shown — this UI never fabricates a
                    fraud decision client-side.
                  </span>
                </>
              ) : (
                <span className="text-xs text-soc-muted">Adjust a control to see a prediction.</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
