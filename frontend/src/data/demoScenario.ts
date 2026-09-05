/**
 * demoScenario.ts
 * ================
 * A fixed, ordered walkthrough for the live pitch/demo so the presenter
 * never depends on the timing or randomness of the live transaction feed.
 *
 * Every feature vector below was verified against the actual trained
 * model (via FastAPI TestClient) before being committed here — not
 * hand-guessed — so each step reliably lands on its expectedDecision.
 * If the model is retrained (python3 run_pipeline.py), re-verify these
 * before recording a demo, since decision boundaries can shift slightly.
 */
import type { PredictRequest, Decision } from '@/types';

export interface DemoStep {
  label: string;
  description: string;
  features: PredictRequest;
  expectedDecision: Decision;
}

const NORMAL_TRANSACTION: PredictRequest = {
  velocity_1h: 1,
  geo_mismatch: 0,
  cvv_failure_rate: 0.0,
  amount_log: 7.3, // ≈ ₹1,480
  is_small_amount: 0,
  distinct_cards_1h: 0,
};

const SUSPICIOUS_TRANSACTION: PredictRequest = {
  velocity_1h: 4,
  geo_mismatch: 0,
  cvv_failure_rate: 0.35,
  amount_log: 5.5, // ≈ ₹244
  is_small_amount: 0,
  distinct_cards_1h: 1,
};

// Strong, multi-signal attack pattern: high velocity + geo mismatch +
// high CVV failure rate + a suspiciously small amount (classic
// card-testing / coordinated-attack fingerprint).
const COORDINATED_ATTACK: PredictRequest = {
  velocity_1h: 27,
  geo_mismatch: 1,
  cvv_failure_rate: 0.85,
  amount_log: 1.2, // ≈ ₹2.3
  is_small_amount: 1,
  distinct_cards_1h: 18,
};

export const demoScenario: DemoStep[] = [
  {
    label: 'Normal transaction',
    description:
      'A routine, low-risk purchase — no velocity, no geo mismatch, no CVV issues. This is what the vast majority of real traffic looks like.',
    features: NORMAL_TRANSACTION,
    expectedDecision: 'ALLOW',
  },
  {
    label: 'Suspicious transaction',
    description:
      'Moderate velocity and a 35% CVV failure rate. RandomForest alone scores this low-risk (~27%, below the ALLOW threshold) — but the IsolationForest independently flags it as distributionally unusual, and the fusion policy escalates anomaly-only flags to REVIEW rather than silently allowing them through.',
    features: SUSPICIOUS_TRANSACTION,
    expectedDecision: 'REVIEW',
  },
  {
    label: 'Coordinated attack',
    description:
      'Extreme velocity (27 txns/hr), a country mismatch, an 85% CVV failure rate, and a near-zero amount — the fingerprint of automated card testing. Both RandomForest and IsolationForest agree this is high-risk.',
    features: COORDINATED_ATTACK,
    expectedDecision: 'BLOCK',
  },
  {
    label: 'Same attack pattern repeated 40x',
    description:
      'The exact same attack fingerprint, submitted 40 times in a row. Individually each call is just another BLOCK — but the sudden concentration of this pattern is exactly what the PSI-based drift monitor is designed to catch: watch the Adaptive Risk Management tab flip from "stable" to "retrain recommended" in real time.',
    // Reuses step 3's features intentionally — this is what drives the
    // drift-monitor payoff moment in DemoScenarioView.
    features: COORDINATED_ATTACK,
    expectedDecision: 'BLOCK',
  },
];

// How many times to actually call predict() for step index 3 (0-based) to
// produce the "40x" volume referenced in its label/description.
export const REPEAT_COUNT_FOR_ATTACK_STEP = 40;
export const ATTACK_STEP_INDEX = 3;
