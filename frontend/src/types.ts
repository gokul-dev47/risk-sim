export type Decision = 'ALLOW' | 'REVIEW' | 'BLOCK';

export interface Transaction {
  id: string;
  amount: number;
  velocity_1h: number;
  geo_mismatch: boolean;
  cvv_failure_rate: number;
  distinct_cards_1h: number;
  risk_score: number;
  decision: Decision;
  timestamp: string;
}

export interface PredictRequest {
  velocity_1h: number;
  geo_mismatch: number;
  cvv_failure_rate: number;
  amount_log: number;
  is_small_amount: number;
  distinct_cards_1h: number;
  transaction_id?: string;
  entity_observed_count?: number;
}

export interface ExplanationFactor {
  feature: string;
  label: string;
  value: number;
  shap_contribution: number;
  direction: 'increased' | 'decreased';
}

export interface Explanation {
  summary: string;
  top_factors: ExplanationFactor[];
}

export interface StepUpInfo {
  verification_id: string;
  expires_in_seconds: number;
  demo_otp: string;
  notice: string;
}

export interface PredictResponse {
  transaction_id?: string | null;
  prediction: number;
  risk_probability: number;
  anomaly_score: number;
  is_anomaly: boolean;
  fused_prediction: number;
  decision: Decision;
  explanation: Explanation;
  engine: 'ml_fusion' | 'rule_fallback' | 'cold_start_rule';
  degraded_mode: boolean;
  step_up?: StepUpInfo | null;
  thresholds_applied?: {
    allow_max_probability: number;
    block_min_probability: number;
    adaptation_active: boolean;
  } | null;
}

export interface DecisionDirective {
  action: 'ALLOW_PAYMENT' | 'STEP_UP' | 'BLOCK_PAYMENT';
  method?: string | null;
  reason_codes: string[];
}

export interface SimulateAttackResponse {
  transaction_id?: string | null;
  timestamp: number;
  risk_score: number;
  risk_score_type: string;
  rf_signal: { prediction: number; probability: number };
  isolation_forest_signal: { is_anomaly: boolean; anomaly_score: number };
  fusion: { fused_prediction: number };
  decision: Decision;
  directive: DecisionDirective;
  reason_codes: string[];
  top_risk_factors: ExplanationFactor[];
  shap_explanation: Explanation;
  active_thresholds: { allow_max_probability: number; block_min_probability: number; adaptation_active: boolean };
  adaptive_posture: { drift_status: string; adaptation_active: boolean; note: string };
  engine: 'ml_fusion' | 'rule_fallback' | 'cold_start_rule';
  degraded_mode: boolean;
  step_up?: StepUpInfo | null;
  audit_reference?: { sequence: number; entry_hash: string } | null;
}

export interface SubtypeRecall {
  [subtype: string]: { n_test: number; recall: number };
}

export interface FullModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  roc_auc: number;
  average_precision: number;
  confusion_matrix: ConfusionMatrix;
  false_positives: number;
  cost_per_false_positive_inr: number;
  avg_fraud_loss_prevented_inr: number;
  estimated_false_positive_cost_inr: number;
  feature_importances: Record<string, number>;
  subtype_recall: SubtypeRecall;
  isolation_forest: { recall: number; precision: number; description: string };
  fusion: {
    recall: number;
    precision: number;
    additional_true_positives_from_iforest: number;
    description: string;
  };
  threshold_sweep: ThresholdPoint[];
  // Optional: this is populated by a newer version of
  // risk_engine/train_model.py. The backend serves whatever is in
  // data/processed/model_metrics.json verbatim (see backend/main.py's
  // /model/metrics), so a stale artifact from an older pipeline run can
  // genuinely lack this field. Every consumer must handle its absence
  // instead of assuming it's always there.
  protection_summary?: {
    loss_class: string;
    counterfactual_no_system_loss_inr: number;
    at_deployed_policy: {
      allow_max_probability: number;
      attacks_prevented: number;
      attacks_missed: number;
      false_positives: number;
      loss_prevented_inr: number;
      residual_loss_inr: number;
      friction_cost_inr: number;
      net_protection_inr: number;
      legitimate_flagged_one_in_n: number | null;
      legitimate_flagged_one_in_n_description: string;
    };
    held_out_test_set_size: number;
    note: string;
  };
  n_test: number;
  n_train: number;
  dataset_totals: {
    total_transactions: number;
    total_attacks: number;
    attack_rate: number;
  };
}

export interface ThresholdPoint {
  threshold: number;
  precision: number;
  recall: number;
  false_positives: number;
  false_negatives: number;
  true_positives: number;
  true_negatives: number;
  fp_cost_inr: number;
  fraud_prevented_inr: number;
  net_impact_inr: number;
  legitimate_flagged_one_in_n: number | null;
}

export interface CostCurveResponse {
  sweep: ThresholdPoint[];
  current_allow_max: number;
  current_block_min: number;
  optimal_threshold: ThresholdPoint | null;
  optimal_threshold_note: string | null;
  assumptions: { cost_per_false_positive_inr: number; avg_fraud_loss_prevented_inr: number };
}

export interface SystemStatus {
  breaker_open: boolean;
  forced_open: boolean;
  model_loaded: boolean;
  fallback_triggers_this_session: number;
}

export interface DriftFeatureStatus {
  psi: number;
  status: 'stable' | 'watch' | 'retrain_recommended';
}

export interface DriftStatusResponse {
  overall_status: 'stable' | 'watch' | 'retrain_recommended' | 'insufficient_data';
  retrain_recommended: boolean;
  per_feature: Record<string, DriftFeatureStatus>;
  batch_size: number;
  thresholds: { watch: number; retrain: number };
  adaptation?: {
    allow_max_probability: number;
    block_min_probability: number;
    adaptation_active: boolean;
    note: string;
  } | null;
}

export interface FeatureImportance {
  feature: string;
  importance: number;
}

export interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  roc_auc: number;
}

export interface ConfusionMatrix {
  true_negative: number;
  false_positive: number;
  false_negative: number;
  true_positive: number;
}

export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';

export type AuditLogKind = 'risk' | 'razorpay' | 'system';

export interface RazorpayAuditDetails {
  order_id?: string;
  payment_id?: string;
  amount_inr?: number;
  currency?: string;
  payment_status?: string;
  order_status?: string;
  test_mode?: boolean;
  reason?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  severity: Severity;
  decision: Decision;
  explanation: string;
  transaction_id: string;
  /** Optional: distinguishes Razorpay/system events from normal risk-engine
   * decisions so the UI can render them differently. Defaults to 'risk'
   * when absent, so existing mock data and callers are unaffected. */
  kind?: AuditLogKind;
  /** Optional: the raw backend event_type (e.g. 'razorpay_payment_verified'). */
  event_type?: string;
  /** Optional: present only when kind === 'razorpay'. */
  razorpay?: RazorpayAuditDetails;
}

// ---------------------------------------------------------------------------
// Tamper-evident audit chain (GET /audit/chain)
// ---------------------------------------------------------------------------

export interface AuditChainEntry {
  sequence: number;
  /** Unix seconds, as returned by time.time() on the backend. */
  timestamp: number;
  event_type: string;
  content: Record<string, unknown>;
  prev_hash: string;
  entry_hash: string;
}

export interface AuditChainResponse {
  entries: AuditChainEntry[];
}

export interface SubtypeRecallEntry {
  n_test: number;
  recall: number;
}

export interface BaselineMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  confusion_matrix: ConfusionMatrix;
  subtype_recall: Record<string, SubtypeRecallEntry>;
  rule: string;
}

export interface MlFusionSummary {
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  subtype_recall: Record<string, SubtypeRecallEntry>;
  fusion_recall: number;
}

export interface BaselineComparisonResponse {
  naive_baseline: BaselineMetrics;
  ml_fusion_summary: MlFusionSummary;
}

export type ViewKey =
  | 'dashboard'
  | 'transactions'
  | 'analytics'
  | 'audit'
  | 'model'
  | 'adaptive'
  | 'whatif'
  | 'rulecompare'
  | 'demo'
  | 'jury'
  | 'razorpay';

export interface ThresholdBusinessCasePoint {
  name: 'aggressive' | 'balanced' | 'conservative';
  threshold: number;
  requested_threshold: number;
  test_set_metrics: {
    precision: number;
    recall: number;
    false_positives: number;
    true_positives: number;
    false_negatives: number;
  };
  monthly_equivalent: {
    friction_cost_inr: number;
    fraud_loss_prevented_inr: number;
    net_impact_inr: number;
  };
  merchant_recommendation: string;
}

export interface ThresholdBusinessCaseResponse {
  loss_class: string;
  methodology: string;
  monthly_extrapolation_assumption: string;
  test_set_span_days: number;
  monthly_multiplier: number;
  operating_points: ThresholdBusinessCasePoint[];
  deployed_default: { name: string; threshold: number; reason: string };
  honest_finding: string;
}

export interface LoadTestConcurrencyResult {
  concurrency: number;
  n_requests: number;
  wall_clock_seconds: number;
  throughput_req_per_sec: number | null;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  mean_ms: number | null;
  max_ms: number | null;
  status_codes: Record<string, number>;
  engines_observed: Record<string, number>;
}

export interface LoadTestResponse {
  endpoint: string;
  tool: string;
  requests_per_concurrency_level: number;
  concurrency_levels_tested: number[];
  results_by_concurrency: LoadTestConcurrencyResult[];
  degradation_vs_baseline: {
    p50_ratio_highest_vs_baseline: number | null;
    p99_ratio_highest_vs_baseline: number | null;
  };
  honest_summary: string;
  limitations: string;
}

export interface EvasionSpacingResult {
  spacing_minutes: number;
  mean_velocity_1h: number;
  pct_rows_with_zero_velocity_1h: number;
  rf_recall: number;
  fusion_recall: number;
  mean_identity_cluster_size: number;
}

export interface EvasionAnalysisResponse {
  attack_subtype_probed: string;
  loss_class: string;
  method: string;
  spacing_sweep_minutes: number[];
  results_by_spacing: EvasionSpacingResult[];
  structural_velocity_breakpoint_minutes: number;
  empirical_zero_velocity_spacing_minutes: number | null;
  recall_drop_baseline_to_worst: number;
  graph_feature_cluster_size_note: string;
  honest_conclusion: string;
  limitations: string;
}

export interface AdaptiveEffectivenessCondition {
  condition: string;
  psi: number;
  psi_status: 'stable' | 'watch' | 'retrain_recommended';
  active_allow_max_probability: number;
  active_block_min_probability: number;
  n_rows: number;
  precision: number;
  recall: number;
  f1_score: number;
  false_positive_rate: number;
  false_negative_rate: number;
  review_rate: number;
  block_rate: number;
  confusion_matrix: { true_negative: number; false_positive: number; false_negative: number; true_positive: number };
  missed_fraud_count: number;
  expected_cost_inr: number;
  decision_changes_vs_static_on_same_drifted_batch: number | null;
}

export interface AdaptiveEffectivenessResponse {
  description: string;
  cost_assumptions_inr: {
    cost_per_false_positive: number;
    avg_fraud_loss_prevented: number;
    review_cost: number;
    missed_fraud_cost: number;
    note: string;
  };
  drift_injection: { method: string; fraction_of_rows_shifted: number; seed: number };
  conditions: {
    A_baseline_stable_static: AdaptiveEffectivenessCondition;
    B_drifted_static: AdaptiveEffectivenessCondition;
    C_drifted_adaptive: AdaptiveEffectivenessCondition;
  };
  adaptive_vs_static_on_drifted_batch_delta: {
    recall_delta: number;
    precision_delta: number;
    f1_delta: number;
    false_positive_rate_delta: number;
    false_negative_rate_delta: number;
    review_rate_delta: number;
    missed_fraud_delta: number;
    expected_cost_delta_inr: number;
    decisions_changed_by_adaptation: number | null;
  };
  verdict: string;
}
