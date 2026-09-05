import type { PredictRequest } from '@/types';

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

function classicBurst(): PredictRequest {
  return {
    velocity_1h: Math.round(clamp(gaussian(30, 7), 15, 60)),
    geo_mismatch: bernoulli(0.6),
    cvv_failure_rate: round(clamp(Math.abs(gaussian(0.5, 0.15)), 0, 1)),
    amount_log: round(clamp(gaussian(1.5, 0.8), 0, 3)),
    is_small_amount: 1,
    // classic_burst devices cycle through a fresh stolen card almost every
    // attempt (see simulator/generate_threat_data.py), so distinct card
    // count tracks velocity closely, unlike a real repeat customer.
    distinct_cards_1h: Math.round(clamp(gaussian(25, 8), 10, 55)),
  };
}

function lowAndSlow(): PredictRequest {
  return {
    velocity_1h: Math.round(clamp(gaussian(1, 1), 0, 3)),
    geo_mismatch: bernoulli(0.7),
    cvv_failure_rate: round(clamp(Math.abs(gaussian(0.4, 0.15)), 0, 1)),
    amount_log: round(clamp(gaussian(5.2, 0.8), 3, 6.5)),
    is_small_amount: 0,
    // Deliberately spread over hours/days, so within any single trailing
    // hour this ring rarely shows more than one OTHER distinct card.
    distinct_cards_1h: Math.round(clamp(gaussian(0.6, 0.8), 0, 3)),
  };
}

function binEnumeration(): PredictRequest {
  return {
    velocity_1h: Math.round(clamp(gaussian(3, 2), 0, 8)),
    geo_mismatch: bernoulli(0.4),
    cvv_failure_rate: round(clamp(Math.abs(gaussian(0.65, 0.15)), 0.2, 1)),
    amount_log: round(clamp(gaussian(3.2, 1.0), 0, 5)),
    is_small_amount: 0,
    // The defining BIN-enumeration signature: a small device/IP pool
    // cycling through many distinct card numbers sharing one BIN prefix.
    distinct_cards_1h: Math.round(clamp(gaussian(4, 2), 1, 10)),
  };
}

/**
 * Returns a fixed-size (default 40) batch of attack-like feature vectors,
 * mixed across the three subtypes, for the "Simulate Attack Wave" demo
 * button in DriftMonitorPanel. This is a fixed, non-learning generator —
 * it does not adapt or evolve based on model responses.
 */
export function generateAttackWave(size = 40): PredictRequest[] {
  const wave: PredictRequest[] = [];
  const perSubtype = Math.floor(size / 3);
  for (let i = 0; i < perSubtype; i += 1) wave.push(classicBurst());
  for (let i = 0; i < perSubtype; i += 1) wave.push(lowAndSlow());
  for (let i = 0; i < size - 2 * perSubtype; i += 1) wave.push(binEnumeration());

  for (let i = wave.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [wave[i], wave[j]] = [wave[j], wave[i]];
  }
  return wave;
}
