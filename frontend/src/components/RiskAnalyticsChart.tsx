import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getModelMetrics } from '@/services/api';
import UnavailablePanel from './UnavailablePanel';

const colors = ['#3395FF', '#5DADFF', '#FF4D6D', '#F59E0B', '#22C55E', '#A855F7'];

interface FeatureRow {
  feature: string;
  importance: number;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: FeatureRow }[] }) {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div className="glass rounded-lg px-3 py-2 border border-soc-primary/30">
        <p className="text-xs font-mono text-soc-text">{item.feature}</p>
        <p className="text-xs text-soc-secondary font-semibold">{(item.importance * 100).toFixed(2)}%</p>
      </div>
    );
  }
  return null;
}

export default function RiskAnalyticsChart() {
  const [rows, setRows] = useState<FeatureRow[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getModelMetrics().then((result) => {
      if (cancelled) return;
      if (result.source === 'unavailable' || !result.data.feature_importances) {
        setUnavailable(true);
        return;
      }
      const sorted = Object.entries(result.data.feature_importances)
        .map(([feature, importance]) => ({ feature, importance }))
        .sort((a, b) => b.importance - a.importance);
      setRows(sorted);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="glass glass-hover rounded-2xl p-6">
      <div className="mb-1">
        <h3 className="text-base font-semibold text-soc-text font-sans">Random Forest Signal Contribution</h3>
        <p className="text-[10px] text-soc-primary font-mono uppercase tracking-widest mt-1">
          MODEL INSIGHT — Random Forest Feature Importance
        </p>
      </div>
      <p className="text-xs text-soc-muted mt-2 mb-4 leading-relaxed">
        Feature importance indicates the relative contribution of each engineered signal to the trained model, as
        reported directly by the deployed RandomForestClassifier — not an illustrative estimate.
      </p>
      <div className="h-72">
        {!rows && !unavailable && (
          <div className="flex h-full items-center justify-center text-xs text-soc-muted">Loading…</div>
        )}
        {unavailable && <UnavailablePanel label="Feature Importance Unavailable" heightClassName="h-full" />}
        {rows && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ left: 20, right: 30, top: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,149,255,0.06)" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                axisLine={{ stroke: 'rgba(51,149,255,0.1)' }}
                tickLine={false}
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              />
              <YAxis
                type="category"
                dataKey="feature"
                tick={{ fill: '#94A3B8', fontSize: 12, fontFamily: 'JetBrains Mono' }}
                axisLine={{ stroke: 'rgba(51,149,255,0.1)' }}
                tickLine={false}
                width={130}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(51,149,255,0.05)' }} />
              <Bar dataKey="importance" radius={[0, 6, 6, 0]} barSize={28} animationDuration={1000}>
                {rows.map((_, i) => (
                  <Cell key={i} fill={colors[i % colors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
