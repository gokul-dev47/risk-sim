import { useState, useEffect, useRef, useCallback } from 'react';
import type { PredictRequest, Decision, Explanation } from '@/types';
import { predict } from '@/services/api';

// ============================================================================
// Config
// ============================================================================

// ============================================================================
// KNOWN LIMITATION, disclosed rather than hidden: the FEATURE VECTORS below
// (velocity_1h, cvv_failure_rate, etc.) are generated client-side with
// Math.random()-based distributions, as a stand-in for real incoming
// transaction traffic in this demo. This is DIFFERENT from the mockPredict()
// issue that was removed elsewhere in this codebase: every generated vector
// here is still sent to the REAL backend /predict endpoint, and the
// decision/risk_probability/anomaly_score/explanation shown to the user are
// 100% genuine RF+IsolationForest model output — nothing about the SCORE is
// fabricated. If the backend is unreachable, this hook now skips the tick
// entirely (see `tick()` below) rather than inventing a decision.
// What IS still a simplification: the underlying "transaction" itself is a
// synthetic client-side event, not a real event produced and audited by the
// backend (a real audit-chain entry only exists for the /predict call this
// hook makes, not for a canonical event with its own transaction_id/history).
// A more architecturally honest version would move this generation to the
// backend and stream real audit-linked events over SSE; that has not been
// implemented in this revision.
// ============================================================================

const TICK_MS = 2000;
const MAX_TRANSACTIONS = 50;
const ATTACK_RATE = 0.1; // ~10% attack-like traffic

// ============================================================================
// Hook-facing types
// ============================================================================

export type TransactionSource = 'backend' | 'unavailable';
export type AttackSubtype = 'classic_burst' | 'low_and_slow' | 'bin_enumeration';

export interface ScoredTransaction {
  id: string;
  timestamp: number;
  features: PredictRequest;
  decision: Decision;
  risk_probability: number;
  anomaly_score: number;
  is_anomaly: boolean;
  explanation: Explanation;
  source: TransactionSource;
  attackSubtype: AttackSubtype | 'normal';
}

export interface DecisionCounts {
  ALLOW: number;
  REVIEW: number;
  BLOCK: number;
}

export interface UseLiveFeedResult {
  transactions: ScoredTransaction[];
  counts: DecisionCounts;
  isLive: boolean;
  backendConnected: boolean;
}

// ============================================================================
// Synthetic feature generation
// ----------------------------------------------------------------------------
// ~90% normal traffic, ~10% attacks split evenly across the three subtypes
// modeled in simulator/generate_threat_data.py. These are client-side
// stand-ins for demo purposes; real training data lives in the backend.
// ============================================================================

function gaussian(mean: number, std: number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * std;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function bernoulli(p: number): number {
  return Math.random() < p ? 1 : 0;
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function generateNormalVector(): PredictRequest {
  const velocity_1h = Math.round(clamp(gaussian(0.3, 0.6), 0, 8));
  const geo_mismatch = bernoulli(0.07);
  const cvv_failure_rate = round(clamp(Math.abs(gaussian(0.03, 0.05)), 0, 0.3));
  const amount_log = round(clamp(gaussian(8.2, 1.5), 0, 9.8));
  const is_small_amount = amount_log < 2.5 ? 1 : 0;
  // Normal customers plateau at 1 distinct card (their own); near-zero here.
  const distinct_cards_1h = Math.round(clamp(gaussian(0.05, 0.25), 0, 1));
  return { velocity_1h, geo_mismatch, cvv_failure_rate, amount_log, is_small_amount, distinct_cards_1h };
}

function generateClassicBurstVector(): PredictRequest {
  const velocity_1h = Math.round(clamp(gaussian(28, 8), 12, 60));
  const geo_mismatch = bernoulli(0.6);
  const cvv_failure_rate = round(clamp(Math.abs(gaussian(0.5, 0.15)), 0, 1));
  const amount_log = round(clamp(gaussian(1.5, 0.8), 0, 3));
  const is_small_amount = amount_log < 2.5 ? 1 : 0;
  const distinct_cards_1h = Math.round(clamp(gaussian(25, 8), 10, 55));
  return { velocity_1h, geo_mismatch, cvv_failure_rate, amount_log, is_small_amount, distinct_cards_1h };
}

function generateLowAndSlowVector(): PredictRequest {
  const velocity_1h = Math.round(clamp(gaussian(1, 1), 0, 3));
  const geo_mismatch = bernoulli(0.7);
  const cvv_failure_rate = round(clamp(Math.abs(gaussian(0.4, 0.15)), 0, 1));
  const amount_log = round(clamp(gaussian(5.2, 0.8), 3, 6.5));
  const is_small_amount = amount_log < 2.5 ? 1 : 0;
  const distinct_cards_1h = Math.round(clamp(gaussian(0.6, 0.8), 0, 3));
  return { velocity_1h, geo_mismatch, cvv_failure_rate, amount_log, is_small_amount, distinct_cards_1h };
}

function generateBinEnumerationVector(): PredictRequest {
  const velocity_1h = Math.round(clamp(gaussian(3, 2), 0, 8));
  const geo_mismatch = bernoulli(0.4);
  const cvv_failure_rate = round(clamp(Math.abs(gaussian(0.65, 0.15)), 0.2, 1));
  const amount_log = round(clamp(gaussian(3.2, 1.0), 0, 5));
  const is_small_amount = amount_log < 2.5 ? 1 : 0;
  const distinct_cards_1h = Math.round(clamp(gaussian(4, 2), 1, 10));
  return { velocity_1h, geo_mismatch, cvv_failure_rate, amount_log, is_small_amount, distinct_cards_1h };
}

function generateFeatureVector(): {
  features: PredictRequest;
  subtype: AttackSubtype | 'normal';
} {
  if (Math.random() >= ATTACK_RATE) {
    return { features: generateNormalVector(), subtype: 'normal' };
  }
  const r = Math.random();
  if (r < 1 / 3) return { features: generateClassicBurstVector(), subtype: 'classic_burst' };
  if (r < 2 / 3) return { features: generateLowAndSlowVector(), subtype: 'low_and_slow' };
  return { features: generateBinEnumerationVector(), subtype: 'bin_enumeration' };
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================================================
// Hook
// ============================================================================

export function useLiveFeed(): UseLiveFeedResult {
  const [transactions, setTransactions] = useState<ScoredTransaction[]>([]);
  const [counts, setCounts] = useState<DecisionCounts>({ ALLOW: 0, REVIEW: 0, BLOCK: 0 });
  const [isLive, setIsLive] = useState(false);
  const [backendConnected, setBackendConnected] = useState(true);

  const isMountedRef = useRef(true);
  const inFlightRef = useRef(false);

  const tick = useCallback(async () => {
    // Skip this tick if the previous predict() call hasn't resolved yet, so
    // a slow backend can't cause overlapping/out-of-order requests.
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const { features, subtype } = generateFeatureVector();

    // predict() no longer silently falls back to a client-side mock (see
    // services/api.ts) — if the backend is unreachable, `result.data` is
    // `null` and this tick is skipped entirely rather than fabricating a
    // scored transaction with an invented decision/risk score.
    const result = await predict(features);

    if (!isMountedRef.current) {
      inFlightRef.current = false;
      return;
    }

    setBackendConnected(result.source === 'backend');

    if (result.source === 'unavailable') {
      inFlightRef.current = false;
      return;
    }

    const { data } = result;

    const scored: ScoredTransaction = {
      id: makeId(),
      timestamp: Date.now(),
      features,
      decision: data.decision,
      risk_probability: data.risk_probability,
      anomaly_score: data.anomaly_score,
      is_anomaly: data.is_anomaly,
      explanation: data.explanation,
      source: result.source,
      attackSubtype: subtype,
    };

    setTransactions((prev) => {
      const next = [scored, ...prev];
      return next.length > MAX_TRANSACTIONS ? next.slice(0, MAX_TRANSACTIONS) : next;
    });

    setCounts((prev) => ({ ...prev, [scored.decision]: prev[scored.decision] + 1 }));

    inFlightRef.current = false;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    setIsLive(true);

    tick(); // fire one immediately so the UI isn't empty for the first ~2s

    const intervalId = setInterval(tick, TICK_MS);

    return () => {
      isMountedRef.current = false;
      setIsLive(false);
      clearInterval(intervalId);
    };
  }, [tick]);

  return { transactions, counts, isLive, backendConnected };
}

export default useLiveFeed;
