import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { riskScoreDistribution } from '@/data/mockData';

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: { range: string; count: number } }[] }) {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div className="glass rounded-lg px-3 py-2 border border-soc-primary/30">
        <p className="text-xs font-mono text-soc-text">Range: {item.range}</p>
        <p className="text-xs text-soc-secondary font-semibold">{item.count.toLocaleString('en-IN')} txns</p>
      </div>
    );
  }
  return null;
}

function getBarColor(range: string): string {
  const val = parseInt(range);
  if (val >= 80) return '#FF4D6D';
  if (val >= 60) return '#F59E0B';
  return '#22C55E';
}

export default function RiskScoreDistributionChart() {
  return (
    <div className="glass glass-hover rounded-2xl p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-soc-text font-sans">Risk Score Distribution</h3>
        <p className="text-xs text-soc-muted mt-1">Transaction count by risk score range</p>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={riskScoreDistribution} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,149,255,0.08)" vertical={false} />
            <XAxis
              dataKey="range"
              tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
              axisLine={{ stroke: 'rgba(51,149,255,0.1)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#94A3B8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(51,149,255,0.05)' }} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={40}>
              {riskScoreDistribution.map((d, i) => (
                <Cell key={i} fill={getBarColor(d.range)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
