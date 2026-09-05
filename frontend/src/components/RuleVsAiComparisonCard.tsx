import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { BaselineComparisonResponse } from '@/types';
import { GLASS_CARD_CLASSES, GLASS_CARD_HEADER_CLASSES, GLASS_CARD_BODY_CLASSES } from './socStyles';

interface RuleVsAiComparisonCardProps {
  data: BaselineComparisonResponse;
}

const SUBTYPE_LABELS: Record<string, string> = {
  classic_burst: 'Classic Burst',
  low_and_slow: 'Low & Slow',
  bin_enumeration: 'BIN Enumeration',
};

const COLOR_RULE = '#FF4D6D'; // soc-danger
const COLOR_AI = '#22C55E'; // soc-success

function formatPct(x: number): string {
  return `${(x * 100).toFixed(0)}%`;
}

function StatRow({ label, ruleValue, aiValue }: { label: string; ruleValue: number; aiValue: number }) {
  return (
    <div className="grid grid-cols-3 items-center py-1 text-sm">
      <span className="text-soc-muted">{label}</span>
      <span className="text-center font-mono text-soc-text">{formatPct(ruleValue)}</span>
      <span className="text-center font-mono text-soc-success">{formatPct(aiValue)}</span>
    </div>
  );
}

export default function RuleVsAiComparisonCard({ data }: RuleVsAiComparisonCardProps) {
  const { naive_baseline, ml_fusion_summary } = data;

  const chartData = Object.keys(naive_baseline.subtype_recall).map((key) => ({
    subtype: SUBTYPE_LABELS[key] ?? key,
    'Naive Rule': Number((naive_baseline.subtype_recall[key].recall * 100).toFixed(1)),
    'ML Fusion': Number(((ml_fusion_summary.subtype_recall[key]?.recall ?? 0) * 100).toFixed(1)),
  }));

  // Dynamically compute the callout percentages instead of hardcoding them.
  const binMiss = 1 - (naive_baseline.subtype_recall.bin_enumeration?.recall ?? 0);
  const slowMiss = 1 - (naive_baseline.subtype_recall.low_and_slow?.recall ?? 0);
  const burstRecall = naive_baseline.subtype_recall.classic_burst?.recall ?? 0;

  return (
    <div className={GLASS_CARD_CLASSES}>
      <div className={GLASS_CARD_HEADER_CLASSES}>
        <h3 className="text-sm font-semibold text-soc-text">AI vs Traditional Rule Engine</h3>
        <span className="text-[11px] text-soc-muted">Same held-out test set, both engines</span>
      </div>

      <div className={GLASS_CARD_BODY_CLASSES}>
        {/* Header row: engine names + rule definition */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-soc-danger">Naive Rule Engine</h4>
            <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-soc-border bg-soc-card p-3 font-mono text-[11px] text-soc-muted">
              {naive_baseline.rule}
            </pre>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-soc-success">ML Fusion Engine</h4>
            <p className="mt-2 text-xs text-soc-muted">
              Multi-feature RandomForest + IsolationForest fusion; overall fusion recall{' '}
              <span className="font-mono text-soc-success">{formatPct(ml_fusion_summary.fusion_recall)}</span>.
            </p>
          </div>
        </div>

        {/* Overall stat row */}
        <div className="mb-6 rounded-lg border border-soc-border bg-soc-card p-3">
          <div className="grid grid-cols-3 pb-2 text-xs font-semibold uppercase text-soc-muted">
            <span>Metric</span>
            <span className="text-center">Naive Rule</span>
            <span className="text-center">ML Fusion</span>
          </div>
          <StatRow label="Precision" ruleValue={naive_baseline.precision} aiValue={ml_fusion_summary.precision} />
          <StatRow label="Recall" ruleValue={naive_baseline.recall} aiValue={ml_fusion_summary.recall} />
          <StatRow label="F1 Score" ruleValue={naive_baseline.f1_score} aiValue={ml_fusion_summary.f1_score} />
        </div>

        {/* Grouped bar chart: recall by subtype */}
        <div className="mb-6 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="rgba(51,149,255,0.08)" vertical={false} />
              <XAxis dataKey="subtype" stroke="rgba(148,163,184,0.6)" fontSize={12} />
              <YAxis stroke="rgba(148,163,184,0.6)" fontSize={12} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip
                contentStyle={{ background: '#101827', border: '1px solid rgba(51,149,255,0.2)', borderRadius: 8, fontSize: 12 }}
                formatter={(value) => `${value}%`}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Naive Rule" fill={COLOR_RULE} radius={[4, 4, 0, 0]} />
              <Bar dataKey="ML Fusion" fill={COLOR_AI} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Plain-English callout */}
        <div className="rounded-lg border border-soc-warning/30 bg-soc-warning/10 p-4 text-sm leading-relaxed text-soc-text">
          The naive rule catches classic card-testing bursts fine ({formatPct(burstRecall)} recall), but misses{' '}
          {formatPct(binMiss)} of BIN-enumeration attacks and {formatPct(slowMiss)} of low-and-slow attacks — exactly
          the patterns an attacker pivots to once the obvious pattern gets blocked. This is the concrete case for the
          ML approach.
        </div>
      </div>
    </div>
  );
}
