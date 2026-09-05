import { BarChart3, ShieldPlus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { FullModelMetrics } from '@/types';
import UnavailablePanel from './UnavailablePanel';
import { GLASS_CARD_CLASSES, GLASS_CARD_HEADER_CLASSES, GLASS_CARD_BODY_CLASSES } from './socStyles';

interface FusionComparisonCardProps {
  metrics: FullModelMetrics | null;
  isLoading?: boolean;
}

const COLOR_RF = '#94a3b8';
const COLOR_IFOREST = '#5DADFF'; // soc-secondary
const COLOR_FUSION = '#22C55E'; // soc-success

function pct(value: number | undefined): string {
  return value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;
}

function round1(value: number | undefined): number {
  return value === undefined ? 0 : Math.round(value * 1000) / 10;
}

export default function FusionComparisonCard({ metrics, isLoading }: FusionComparisonCardProps) {
  const chartData = metrics
    ? [
        {
          metric: 'Precision',
          'RF-only': round1(metrics.precision),
          IsolationForest: round1(metrics.isolation_forest?.precision),
          Fusion: round1(metrics.fusion?.precision),
        },
        {
          metric: 'Recall',
          'RF-only': round1(metrics.recall),
          IsolationForest: round1(metrics.isolation_forest?.recall),
          Fusion: round1(metrics.fusion?.recall),
        },
      ]
    : [];

  return (
    <div className={GLASS_CARD_CLASSES}>
      <div className={GLASS_CARD_HEADER_CLASSES}>
        <div className="flex items-center gap-2.5">
          <BarChart3 className="h-4 w-4 text-soc-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-soc-text">Model Fusion</h3>
        </div>
        <span className="text-[11px] text-soc-muted">RF vs. IsolationForest vs. Fusion</span>
      </div>

      <div className={GLASS_CARD_BODY_CLASSES}>
        {isLoading && !metrics && (
          <div className="flex h-56 items-center justify-center text-xs text-soc-muted">Loading model metrics…</div>
        )}

        {!isLoading && !metrics && <UnavailablePanel label="Model Metrics Unavailable" heightClassName="h-56" />}

        {metrics && (
          <>
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-soc-success/30 bg-soc-success/10 px-4 py-3">
              <ShieldPlus className="h-5 w-5 flex-shrink-0 text-soc-success" aria-hidden="true" />
              <p className="text-sm text-soc-text">
                <span className="text-lg font-semibold text-soc-success">
                  +{metrics.fusion?.additional_true_positives_from_iforest ?? 0}
                </span>{' '}
                additional attacks caught by fusion (vs. RF alone), on the held-out test set
              </p>
            </div>

            <div className="mb-5 grid grid-cols-3 gap-3">
              <ModelStat
                label="RF-only"
                color={COLOR_RF}
                precision={metrics.precision}
                recall={metrics.recall}
              />
              <ModelStat
                label="IsolationForest"
                color={COLOR_IFOREST}
                precision={metrics.isolation_forest?.precision}
                recall={metrics.isolation_forest?.recall}
              />
              <ModelStat
                label="Fusion"
                color={COLOR_FUSION}
                precision={metrics.fusion?.precision}
                recall={metrics.fusion?.recall}
                emphasized
              />
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="rgba(51,149,255,0.08)" vertical={false} />
                  <XAxis dataKey="metric" stroke="rgba(148,163,184,0.6)" fontSize={11} />
                  <YAxis
                    stroke="rgba(148,163,184,0.6)"
                    fontSize={11}
                    tickFormatter={(v: number) => `${v}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#101827',
                      border: '1px solid rgba(51,149,255,0.2)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value) => `${value}%`}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="RF-only" fill={COLOR_RF} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="IsolationForest" fill={COLOR_IFOREST} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Fusion" fill={COLOR_FUSION} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Recall by attack subtype */}
            <div className="mt-5">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-soc-muted">
                Recall by Attack Subtype (RF)
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(metrics.subtype_recall).map(([subtype, stats]) => (
                  <div key={subtype} className="rounded-lg border border-soc-border bg-soc-card px-2.5 py-2">
                    <div className="text-[10px] text-soc-muted">{subtype.replace(/_/g, ' ')}</div>
                    <div className="text-sm font-semibold text-soc-text font-mono">{pct(stats.recall)}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ModelStat({
  label,
  color,
  precision,
  recall,
  emphasized,
}: {
  label: string;
  color: string;
  precision: number | undefined;
  recall: number | undefined;
  emphasized?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        emphasized ? 'border-soc-success/40 bg-soc-success/5' : 'border-soc-border bg-soc-card'
      }`}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[11px] font-medium text-soc-text">{label}</span>
      </div>
      <div className="text-xs text-soc-muted">
        Precision <span className="font-semibold text-soc-text">{pct(precision)}</span>
      </div>
      <div className="text-xs text-soc-muted">
        Recall <span className="font-semibold text-soc-text">{pct(recall)}</span>
      </div>
    </div>
  );
}
