import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Loader2, Radar, ShieldAlert, ShieldCheck } from 'lucide-react';
import DriftMonitorPanel from '@/components/DriftMonitorPanel';
import CostCurveChart from '@/components/CostCurveChart';
import FusionComparisonCard from '@/components/FusionComparisonCard';
import ThresholdBusinessCase from '@/components/ThresholdBusinessCase';
import DemoReadinessPanel from '@/components/DemoReadinessPanel';
import AdaptiveEffectivenessPanel from '@/components/AdaptiveEffectivenessPanel';
import LiveBadge from '@/components/LiveBadge';
import {
  getCostCurve,
  getModelMetrics,
  getSystemStatus,
  simulateFailure,
  restoreSystem,
  getThresholdBusinessCase,
  getLoadTestResults,
  getEvasionAnalysis,
  getAdaptiveEffectiveness,
} from '@/services/api';
import type {
  CostCurveResponse,
  FullModelMetrics,
  SystemStatus,
  ThresholdBusinessCaseResponse,
  LoadTestResponse,
  EvasionAnalysisResponse,
  AdaptiveEffectivenessResponse,
} from '@/types';

export default function AdaptiveView() {
  const [costCurve, setCostCurve] = useState<CostCurveResponse | null>(null);
  const [metrics, setMetrics] = useState<FullModelMetrics | null>(null);
  const [source, setSource] = useState<'backend' | 'unavailable'>('backend');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const [businessCase, setBusinessCase] = useState<ThresholdBusinessCaseResponse | null>(null);
  const [loadTest, setLoadTest] = useState<LoadTestResponse | null>(null);
  const [loadTestError, setLoadTestError] = useState<string | null>(null);
  const [evasion, setEvasion] = useState<EvasionAnalysisResponse | null>(null);
  const [evasionError, setEvasionError] = useState<string | null>(null);
  const [adaptiveEffectiveness, setAdaptiveEffectiveness] = useState<AdaptiveEffectivenessResponse | null>(null);

  const loadAll = useCallback(async () => {
    setIsRefreshing(true);
    const [costResult, metricsResult, businessCaseResult, loadTestResult, evasionResult, adaptiveEffectivenessResult] = await Promise.all([
      getCostCurve(),
      getModelMetrics(),
      getThresholdBusinessCase(),
      getLoadTestResults(),
      getEvasionAnalysis(),
      getAdaptiveEffectiveness(),
    ]);
    setCostCurve(costResult.data);
    setMetrics(metricsResult.data);
    setBusinessCase(businessCaseResult.data);
    setLoadTest(loadTestResult.data);
    setLoadTestError(loadTestResult.source === 'unavailable' ? loadTestResult.error : null);
    setEvasion(evasionResult.data);
    setEvasionError(evasionResult.source === 'unavailable' ? evasionResult.error : null);
    setAdaptiveEffectiveness(adaptiveEffectivenessResult.data);
    setSource(costResult.source === 'backend' && metricsResult.source === 'backend' ? 'backend' : 'unavailable');
    setIsRefreshing(false);
  }, []);

  const refreshSystemStatus = useCallback(async () => {
    const result = await getSystemStatus();
    if (result.source === 'backend') setSystemStatus(result.data);
  }, []);

  useEffect(() => {
    loadAll();
    refreshSystemStatus();
    const id = setInterval(refreshSystemStatus, 3000);
    return () => clearInterval(id);
  }, [loadAll, refreshSystemStatus]);

  const handleToggleBreaker = useCallback(async () => {
    if (isToggling) return;
    setIsToggling(true);
    if (systemStatus?.forced_open) {
      await restoreSystem();
    } else {
      await simulateFailure();
    }
    await refreshSystemStatus();
    setIsToggling(false);
  }, [isToggling, systemStatus, refreshSystemStatus]);

  const isDegraded = systemStatus?.breaker_open ?? false;
  const systemStatusUnknown = systemStatus === null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radar className="w-4 h-4 text-soc-primary" />
          <h3 className="text-base font-semibold text-soc-text font-sans">Adaptive Risk Management</h3>
          <span className="text-xs text-soc-muted">
            — drift-triggered threshold recalibration, cost-optimal thresholding, and fusion-model impact. The
            model itself is not retrained online; see the drift panel for what "adaptive" actually means here.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LiveBadge source={source} />
          <button
            type="button"
            onClick={loadAll}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-soc-border bg-white/5 px-3 py-1.5 text-xs font-medium text-soc-text hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {isRefreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Refresh
          </button>
        </div>
      </div>

      {/* Circuit breaker control — demonstrates graceful degradation live */}
      <div
        className={`glass rounded-2xl p-5 flex items-center justify-between gap-4 border ${
          systemStatusUnknown ? 'border-soc-danger/30' : isDegraded ? 'border-soc-danger/30' : 'border-soc-border'
        }`}
      >
        <div className="flex items-center gap-3">
          {systemStatusUnknown ? (
            <ShieldAlert className="h-5 w-5 text-soc-danger flex-shrink-0" aria-hidden="true" />
          ) : isDegraded ? (
            <ShieldAlert className="h-5 w-5 text-soc-danger flex-shrink-0" aria-hidden="true" />
          ) : (
            <ShieldCheck className="h-5 w-5 text-soc-success flex-shrink-0" aria-hidden="true" />
          )}
          <div>
            <h3 className="text-sm font-semibold text-soc-text">
              {systemStatusUnknown
                ? 'System Status Unavailable'
                : isDegraded
                  ? 'Fallback Mode — Deterministic Rule Engine Active'
                  : 'ML Fusion Engine Online'}
            </h3>
            <p className="text-xs text-soc-muted mt-0.5">
              {systemStatusUnknown
                ? 'Could not reach the backend to check circuit-breaker/model-load status. This is not a claim that the engine is healthy — it genuinely could not be checked.'
                : isDegraded
                  ? 'The trained model path is unavailable. Every /predict call is being scored by a transparent, dependency-free rule engine instead — the checkout flow never breaks and never fails silently open.'
                  : 'RandomForest + IsolationForest fusion is scoring transactions normally.'}
              {systemStatus && systemStatus.fallback_triggers_this_session > 0 && (
                <> Fallback triggered {systemStatus.fallback_triggers_this_session}x this session.</>
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggleBreaker}
          disabled={isToggling || systemStatusUnknown}
          className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            isDegraded
              ? 'border-soc-success/30 bg-soc-success/15 text-soc-success hover:bg-soc-success/25'
              : 'border-soc-danger/30 bg-soc-danger/15 text-soc-danger hover:bg-soc-danger/25'
          }`}
        >
          {isToggling && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {isDegraded ? 'Restore ML Engine' : 'Simulate ML Outage'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <DriftMonitorPanel />
        </div>
        <div className="xl:col-span-2">
          <CostCurveChart data={costCurve} isLoading={isRefreshing} />
        </div>
      </div>

      <AdaptiveEffectivenessPanel data={adaptiveEffectiveness} isLoading={isRefreshing} />

      <FusionComparisonCard metrics={metrics} isLoading={isRefreshing} />

      <ThresholdBusinessCase data={businessCase} isLoading={isRefreshing} />

      <DemoReadinessPanel loadTest={loadTest} evasion={evasion} isLoading={isRefreshing} loadTestError={loadTestError} evasionError={evasionError} />
    </div>
  );
}
