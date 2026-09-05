import { useEffect, useMemo, useState } from 'react';
import UnavailablePanel from '@/components/UnavailablePanel';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Target } from 'lucide-react';
import type { CostCurveResponse, ThresholdPoint } from '@/types';
import { GLASS_CARD_CLASSES, GLASS_CARD_HEADER_CLASSES, GLASS_CARD_BODY_CLASSES } from './socStyles';

interface CostCurveChartProps {
  data: CostCurveResponse | null;
  isLoading?: boolean;
}

function formatInr(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

function findNearest(sweep: ThresholdPoint[], threshold: number): ThresholdPoint | null {
  if (sweep.length === 0) return null;
  return sweep.reduce((closest, point) =>
    Math.abs(point.threshold - threshold) < Math.abs(closest.threshold - threshold) ? point : closest
  );
}

const COLOR_PRIMARY = '#3395FF'; // soc-primary
const COLOR_SUCCESS = '#22C55E'; // soc-success

export default function CostCurveChart({ data, isLoading }: CostCurveChartProps) {
  const sweep = useMemo(() => data?.sweep ?? [], [data]);
  const [selectedThreshold, setSelectedThreshold] = useState<number | null>(null);

  useEffect(() => {
    if (data && selectedThreshold === null) {
      setSelectedThreshold(
        data.optimal_threshold?.threshold ?? data.current_block_min ?? sweep[Math.floor(sweep.length / 2)]?.threshold ?? 0
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const { min, max } = useMemo(() => {
    if (sweep.length < 2) return { min: 0, max: 1, step: 0.01 };
    const thresholds = sweep.map((p) => p.threshold);
    const lo = Math.min(...thresholds);
    const hi = Math.max(...thresholds);
    return { min: lo, max: hi, step: (hi - lo) / Math.max(sweep.length - 1, 1) || 0.01 };
  }, [sweep]);

  const nearestPoint = useMemo(
    () => (selectedThreshold !== null ? findNearest(sweep, selectedThreshold) : null),
    [sweep, selectedThreshold]
  );

  return (
    <div className={GLASS_CARD_CLASSES}>
      <div className={GLASS_CARD_HEADER_CLASSES}>
        <div className="flex items-center gap-2.5">
          <TrendingUp className="h-4 w-4 text-soc-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-soc-text">Cost Curve</h3>
        </div>
        <span className="text-[11px] text-soc-muted">Net impact (₹) vs. threshold</span>
      </div>

      <div className={GLASS_CARD_BODY_CLASSES}>
        {isLoading && !data && (
          <div className="flex h-72 items-center justify-center text-xs text-soc-muted">Loading cost curve…</div>
        )}

        {!isLoading && !data && <UnavailablePanel label="Cost Curve Unavailable" heightClassName="h-72" />}


        {data && (
          <>
            {data.optimal_threshold && (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-soc-primary/30 bg-soc-primary/10 px-4 py-3">
                <Target className="h-5 w-5 flex-shrink-0 text-soc-primary" aria-hidden="true" />
                <p className="text-sm text-soc-text">
                  Recommended threshold{' '}
                  <span className="font-semibold text-soc-primary">{data.optimal_threshold.threshold}</span>{' '}
                  maximizes net impact at{' '}
                  <span className="font-semibold text-soc-primary">
                    {formatInr(data.optimal_threshold.net_impact_inr)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedThreshold(data.optimal_threshold!.threshold)}
                    className="ml-2 text-xs underline text-soc-primary hover:text-soc-secondary"
                  >
                    jump to it
                  </button>
                </p>
              </div>
            )}

            <div className="mb-4 grid grid-cols-3 gap-3">
              <Stat label="Net Impact" value={nearestPoint ? formatInr(nearestPoint.net_impact_inr) : '—'} />
              <Stat label="Precision" value={nearestPoint ? `${(nearestPoint.precision * 100).toFixed(1)}%` : '—'} />
              <Stat label="Recall" value={nearestPoint ? `${(nearestPoint.recall * 100).toFixed(1)}%` : '—'} />
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={sweep}
                  margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
                  onClick={(e) => {
                    const label = e?.activeLabel;
                    if (typeof label === 'number') setSelectedThreshold(label);
                    else if (typeof label === 'string') setSelectedThreshold(Number(label));
                  }}
                >
                  <CartesianGrid stroke="rgba(51,149,255,0.08)" vertical={false} />
                  <XAxis
                    dataKey="threshold"
                    stroke="rgba(148,163,184,0.6)"
                    fontSize={11}
                    domain={[min, max]}
                    type="number"
                  />
                  <YAxis
                    stroke="rgba(148,163,184,0.6)"
                    fontSize={11}
                    tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#101827',
                      border: '1px solid rgba(51,149,255,0.2)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value) => formatInr(Number(value))}
                    labelFormatter={(label) => `threshold ${label}`}
                  />
                  {data.current_allow_max !== undefined && (
                    <ReferenceLine x={data.current_allow_max} stroke="#22C55E" strokeDasharray="4 4" />
                  )}
                  {data.current_block_min !== undefined && (
                    <ReferenceLine x={data.current_block_min} stroke="#FF4D6D" strokeDasharray="4 4" />
                  )}
                  {selectedThreshold !== null && (
                    <ReferenceLine x={selectedThreshold} stroke={COLOR_PRIMARY} strokeWidth={2} />
                  )}
                  <Line
                    type="monotone"
                    dataKey="net_impact_inr"
                    stroke={COLOR_SUCCESS}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[10px] text-soc-muted">
              Click anywhere on the chart to move the threshold marker. Green/red dashed lines mark the current
              ALLOW/BLOCK bands; solid purple line is your selection.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-soc-border bg-soc-card px-3 py-2.5 text-center">
      <div className="text-[10px] uppercase tracking-wide text-soc-muted">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-soc-text font-mono">{value}</div>
    </div>
  );
}
