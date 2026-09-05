import type {
  Transaction,
  FeatureImportance,
  ModelMetrics,
  ConfusionMatrix,
  AuditLog,
} from '@/types';

export const transactions: Transaction[] = [
  {
    id: 'TXN-7A9F2C1D',
    amount: 499.0,
    velocity_1h: 14,
    geo_mismatch: true,
    cvv_failure_rate: 0.85,
    distinct_cards_1h: 6,
    risk_score: 96,
    decision: 'BLOCK',
    timestamp: '2026-08-30T09:42:11Z',
  },
  {
    id: 'TXN-3B8E1K9M',
    amount: 1299.5,
    velocity_1h: 9,
    geo_mismatch: true,
    cvv_failure_rate: 0.6,
    distinct_cards_1h: 5,
    risk_score: 91,
    decision: 'BLOCK',
    timestamp: '2026-08-30T09:41:55Z',
  },
  {
    id: 'TXN-5C2D7J4P',
    amount: 75.0,
    velocity_1h: 18,
    geo_mismatch: false,
    cvv_failure_rate: 0.7,
    distinct_cards_1h: 4,
    risk_score: 88,
    decision: 'BLOCK',
    timestamp: '2026-08-30T09:41:30Z',
  },
  {
    id: 'TXN-9F1A3B8Q',
    amount: 250.0,
    velocity_1h: 7,
    geo_mismatch: true,
    cvv_failure_rate: 0.4,
    distinct_cards_1h: 2,
    risk_score: 72,
    decision: 'REVIEW',
    timestamp: '2026-08-30T09:41:12Z',
  },
  {
    id: 'TXN-2D6K8M3R',
    amount: 1599.0,
    velocity_1h: 3,
    geo_mismatch: false,
    cvv_failure_rate: 0.0,
    distinct_cards_1h: 0,
    risk_score: 18,
    decision: 'ALLOW',
    timestamp: '2026-08-30T09:40:58Z',
  },
  {
    id: 'TXN-4E7N2P6S',
    amount: 60.0,
    velocity_1h: 22,
    geo_mismatch: true,
    cvv_failure_rate: 0.95,
    distinct_cards_1h: 7,
    risk_score: 99,
    decision: 'BLOCK',
    timestamp: '2026-08-30T09:40:41Z',
  },
  {
    id: 'TXN-8G3K1L5T',
    amount: 320.0,
    velocity_1h: 5,
    geo_mismatch: false,
    cvv_failure_rate: 0.2,
    distinct_cards_1h: 1,
    risk_score: 45,
    decision: 'REVIEW',
    timestamp: '2026-08-30T09:40:22Z',
  },
  {
    id: 'TXN-1H9F4J2U',
    amount: 899.0,
    velocity_1h: 2,
    geo_mismatch: false,
    cvv_failure_rate: 0.0,
    distinct_cards_1h: 0,
    risk_score: 12,
    decision: 'ALLOW',
    timestamp: '2026-08-30T09:40:05Z',
  },
  {
    id: 'TXN-6J2M8N3V',
    amount: 45.0,
    velocity_1h: 16,
    geo_mismatch: true,
    cvv_failure_rate: 0.8,
    distinct_cards_1h: 6,
    risk_score: 93,
    decision: 'BLOCK',
    timestamp: '2026-08-30T09:39:48Z',
  },
  {
    id: 'TXN-3K5P7R1W',
    amount: 210.0,
    velocity_1h: 4,
    geo_mismatch: false,
    cvv_failure_rate: 0.1,
    distinct_cards_1h: 0,
    risk_score: 28,
    decision: 'ALLOW',
    timestamp: '2026-08-30T09:39:30Z',
  },
  {
    id: 'TXN-7L2Q9S4X',
    amount: 550.0,
    velocity_1h: 11,
    geo_mismatch: true,
    cvv_failure_rate: 0.55,
    distinct_cards_1h: 4,
    risk_score: 84,
    decision: 'BLOCK',
    timestamp: '2026-08-30T09:39:12Z',
  },
  {
    id: 'TXN-9M4R6T8Y',
    amount: 180.0,
    velocity_1h: 6,
    geo_mismatch: false,
    cvv_failure_rate: 0.15,
    distinct_cards_1h: 1,
    risk_score: 38,
    decision: 'REVIEW',
    timestamp: '2026-08-30T09:38:55Z',
  },
];

export const featureImportances: FeatureImportance[] = [
  { feature: 'amount_log', importance: 0.3678 },
  { feature: 'cvv_failure_rate', importance: 0.298 },
  { feature: 'geo_mismatch', importance: 0.1395 },
  { feature: 'distinct_cards_1h', importance: 0.0947 },
  { feature: 'velocity_1h', importance: 0.0882 },
  { feature: 'is_small_amount', importance: 0.0118 },
];

export const modelMetrics: ModelMetrics = {
  accuracy: 1.0,
  precision: 1.0,
  recall: 1.0,
  f1: 1.0,
  roc_auc: 1.0,
};

export const confusionMatrix: ConfusionMatrix = {
  true_negative: 2000,
  false_positive: 0,
  false_negative: 0,
  true_positive: 100,
};

export const auditLogs: AuditLog[] = [
  {
    id: 'LOG-001',
    timestamp: '2026-08-30T09:42:11Z',
    severity: 'HIGH',
    decision: 'BLOCK',
    explanation:
      'Transaction blocked due to rapid transaction velocity (14 in 1h), repeated CVV failures (85%), and geographic mismatch between cardholder and device location.',
    transaction_id: 'TXN-7A9F2C1D',
  },
  {
    id: 'LOG-002',
    timestamp: '2026-08-30T09:41:55Z',
    severity: 'HIGH',
    decision: 'BLOCK',
    explanation:
      'Transaction blocked due to high transaction amount combined with geographic mismatch and elevated CVV failure rate (60%).',
    transaction_id: 'TXN-3B8E1K9M',
  },
  {
    id: 'LOG-003',
    timestamp: '2026-08-30T09:41:30Z',
    severity: 'HIGH',
    decision: 'BLOCK',
    explanation:
      'Transaction blocked due to extreme transaction velocity (18 in 1h) and repeated CVV failures (70%).',
    transaction_id: 'TXN-5C2D7J4P',
  },
  {
    id: 'LOG-004',
    timestamp: '2026-08-30T09:41:12Z',
    severity: 'MEDIUM',
    decision: 'REVIEW',
    explanation:
      'Transaction sent for manual review because of unusual device activity and geographic mismatch indicators.',
    transaction_id: 'TXN-9F1A3B8Q',
  },
  {
    id: 'LOG-005',
    timestamp: '2026-08-30T09:40:58Z',
    severity: 'LOW',
    decision: 'ALLOW',
    explanation:
      'Transaction cleared automatically. All risk indicators within normal parameters.',
    transaction_id: 'TXN-2D6K8M3R',
  },
  {
    id: 'LOG-006',
    timestamp: '2026-08-30T09:40:41Z',
    severity: 'HIGH',
    decision: 'BLOCK',
    explanation:
      'Transaction blocked due to extreme velocity (22 in 1h), near-total CVV failure rate (95%), and geographic mismatch.',
    transaction_id: 'TXN-4E7N2P6S',
  },
  {
    id: 'LOG-007',
    timestamp: '2026-08-30T09:40:22Z',
    severity: 'MEDIUM',
    decision: 'REVIEW',
    explanation:
      'Transaction sent for manual review because of elevated CVV failure rate (20%) on a new device fingerprint.',
    transaction_id: 'TXN-8G3K1L5T',
  },
  {
    id: 'LOG-008',
    timestamp: '2026-08-30T09:40:05Z',
    severity: 'LOW',
    decision: 'ALLOW',
    explanation:
      'Transaction cleared automatically. Low risk score with stable behavioral baseline.',
    transaction_id: 'TXN-1H9F4J2U',
  },
  {
    id: 'LOG-009',
    timestamp: '2026-08-30T09:39:48Z',
    severity: 'HIGH',
    decision: 'BLOCK',
    explanation:
      'Transaction blocked due to high velocity (16 in 1h), CVV failure rate of 80%, and geographic mismatch.',
    transaction_id: 'TXN-6J2M8N3V',
  },
  {
    id: 'LOG-010',
    timestamp: '2026-08-30T09:39:30Z',
    severity: 'LOW',
    decision: 'ALLOW',
    explanation:
      'Transaction cleared automatically. All behavioral signals nominal.',
    transaction_id: 'TXN-3K5P7R1W',
  },
];

export const kpis = {
  total_transactions: 10500,
  threats_detected: 500,
  model_accuracy: 100,
  false_positive_cost: 0,
};

export const threatDistribution = [
  { name: 'Normal', value: 10000, color: '#22C55E' },
  { name: 'Suspicious', value: 350, color: '#F59E0B' },
  { name: 'High-Risk', value: 150, color: '#FF4D6D' },
];

export const riskSeverityCounts = {
  low: 6000,
  medium: 3350,
  high: 1000,
  critical: 150,
};

export const threatTimeline = [
  { time: '00:00', threats: 12, normal: 180, high_risk: 2 },
  { time: '04:00', threats: 8, normal: 220, high_risk: 1 },
  { time: '08:00', threats: 24, normal: 340, high_risk: 5 },
  { time: '12:00', threats: 45, normal: 520, high_risk: 12 },
  { time: '16:00', threats: 68, normal: 680, high_risk: 28 },
  { time: '20:00', threats: 32, normal: 410, high_risk: 8 },
  { time: '24:00', threats: 15, normal: 250, high_risk: 3 },
];

export const riskScoreDistribution = [
  { range: '0-20', count: 3200 },
  { range: '21-40', count: 2800 },
  { range: '41-60', count: 2100 },
  { range: '61-80', count: 1400 },
  { range: '81-100', count: 1000 },
];

export const threatSignalMatrix = [
  { signal: 'High Velocity', low: 120, medium: 80, high: 45, critical: 18 },
  { signal: 'Geo Mismatch', low: 200, medium: 95, high: 38, critical: 12 },
  { signal: 'CVV Failures', low: 90, medium: 110, high: 62, critical: 28 },
  { signal: 'Small Amount', low: 150, medium: 140, high: 85, critical: 42 },
  { signal: 'Unusual Amount Pattern', low: 180, medium: 60, high: 30, critical: 8 },
];

export const analyticsSummary = {
  threat_rate: 4.76,
  high_risk_count: 6,
  avg_risk_score: 51,
  most_common_signal: 'Small Transaction Amount',
};
