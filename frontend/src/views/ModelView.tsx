import { useEffect, useState } from 'react';
import { Loader2, Layers, ShieldPlus, Cpu } from 'lucide-react';
import { getModelMetrics } from '@/services/api';
import ModelPerformance from '@/components/ModelPerformance';
import LiveBadge from '@/components/LiveBadge';
import UnavailablePanel from '@/components/UnavailablePanel';
import type { FullModelMetrics, ModelMetrics, ConfusionMatrix } from '@/types';

const GLASS_CARD = 'glass rounded-2xl p-6';

function mapToModelPerformanceProps(raw: FullModelMetrics): { metrics: ModelMetrics; matrix: ConfusionMatrix } {
  return {
    metrics: {
      accuracy: raw.accuracy,
      precision: raw.precision,
      recall: raw.recall,
      f1: raw.f1_score,
      roc_auc: raw.roc_auc,
    },
    matrix: raw.confusion_matrix,
  };
}

function pct(value: number | undefined): string {
  return value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;
}

export default function ModelView() {
  const [rawMetrics, setRawMetrics] = useState<FullModelMetrics | null>(null);
  const [source, setSource] = useState<'backend' | 'unavailable'>('backend');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getModelMetrics()
      .then((result) => {
        if (!cancelled) {
          setRawMetrics(result.data);
          setSource(result.source);
          setError(result.source === 'unavailable' ? result.error : null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-soc-primary" />
          <h3 className="text-base font-semibold text-soc-text font-sans">Model Performance</h3>
          <span className="text-xs text-soc-muted">— held-out evaluation of the live classifier</span>
        </div>
        <LiveBadge source={source} />
      </div>

      {isLoading && !rawMetrics && (
        <div className="flex h-40 items-center justify-center gap-2 text-sm text-soc-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading model metrics…
        </div>
      )}

      {!isLoading && !rawMetrics && source === 'unavailable' && (
        <UnavailablePanel label="Model Metrics Unavailable" error={error} />
      )}

      {rawMetrics && (
        <>
          <ModelPerformance {...mapToModelPerformanceProps(rawMetrics)} />

          {/* Recall by attack subtype */}
          <div className={GLASS_CARD}>
            <div className="mb-4 flex items-center gap-2">
              <Layers className="h-4 w-4 text-soc-primary" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-soc-text">Recall by Attack Subtype</h3>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {Object.entries(rawMetrics.subtype_recall).map(([subtype, stats]) => (
                <div key={subtype} className="rounded-xl border border-soc-border bg-soc-card px-3 py-2.5">
                  <div className="text-[11px] uppercase tracking-wide text-soc-muted">
                    {subtype.replace(/_/g, ' ')}
                  </div>
                  <div className="mt-0.5 text-lg font-semibold text-soc-text font-mono">
                    {pct(stats.recall)}
                  </div>
                  <div className="text-[10px] text-soc-muted">n={stats.n_test} (held-out)</div>
                </div>
              ))}
            </div>
          </div>

          {/* Isolation forest / fusion stats */}
          <div className={GLASS_CARD}>
            <div className="mb-4 flex items-center gap-2">
              <ShieldPlus className="h-4 w-4 text-soc-success" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-soc-text">Anomaly Fusion</h3>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-soc-border bg-soc-card px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-soc-muted">RandomForest (only)</div>
                <div className="text-xs text-soc-muted mt-1">
                  Precision <span className="font-semibold text-soc-text">{pct(rawMetrics.precision)}</span>
                </div>
                <div className="text-xs text-soc-muted">
                  Recall <span className="font-semibold text-soc-text">{pct(rawMetrics.recall)}</span>
                </div>
              </div>
              <div className="rounded-xl border border-soc-border bg-soc-card px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-soc-muted">IsolationForest (only)</div>
                <div className="text-xs text-soc-muted mt-1">
                  Precision{' '}
                  <span className="font-semibold text-soc-text">{pct(rawMetrics.isolation_forest.precision)}</span>
                </div>
                <div className="text-xs text-soc-muted">
                  Recall{' '}
                  <span className="font-semibold text-soc-text">{pct(rawMetrics.isolation_forest.recall)}</span>
                </div>
              </div>
              <div className="rounded-xl border border-soc-success/30 bg-soc-success/5 px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-soc-muted">Fusion (RF or IForest)</div>
                <div className="text-xs text-soc-muted mt-1">
                  Precision <span className="font-semibold text-soc-text">{pct(rawMetrics.fusion.precision)}</span>
                </div>
                <div className="text-xs text-soc-muted">
                  Recall <span className="font-semibold text-soc-text">{pct(rawMetrics.fusion.recall)}</span>
                </div>
                <div className="text-xs text-soc-success font-semibold mt-1">
                  +{rawMetrics.fusion.additional_true_positives_from_iforest} caught vs. RF alone
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-snug text-soc-muted">
              "Fusion" here is a standalone <span className="font-semibold">analytical ablation</span> —
              precision/recall if a transaction were flagged whenever EITHER model fires. It is not the
              deployed decision policy's precision: in production, IsolationForest can only escalate an
              ALLOW to REVIEW for human review, never trigger a BLOCK on its own — so its lower precision
              here never becomes a live false-positive rate. See RandomForest (only) above for the metric
              that reflects the actual deployed policy.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
