import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { threatTimeline } from '@/data/mockData';

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (active && payload && payload.length) {
    return (
      <div className="glass rounded-lg px-3 py-2 border border-soc-primary/30">
        <p className="text-xs font-mono text-soc-text mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} className="text-xs font-semibold" style={{ color: p.color }}>
            {p.name}: {p.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

export default function ThreatTimelineChart() {
  return (
    <div className="glass glass-hover rounded-2xl p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-soc-text font-sans">Threat Activity Over Time</h3>
        <p className="text-xs text-soc-muted mt-1">Synthetic transaction volume and highlighted threat spikes</p>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={threatTimeline} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="normalGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5DADFF" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#5DADFF" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="threatGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="highRiskGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FF4D6D" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#FF4D6D" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,149,255,0.06)" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fill: '#94A3B8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={{ stroke: 'rgba(51,149,255,0.1)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#94A3B8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="normal" stroke="#5DADFF" strokeWidth={2} fill="url(#normalGrad)" name="Normal Activity" animationDuration={1200} />
            <Area type="monotone" dataKey="threats" stroke="#F59E0B" strokeWidth={2} fill="url(#threatGrad)" name="Suspicious Activity" animationDuration={1200} />
            <Area type="monotone" dataKey="high_risk" stroke="#FF4D6D" strokeWidth={2.5} fill="url(#highRiskGrad)" name="High-Risk Spikes" animationDuration={1200} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap justify-center gap-6 mt-2">
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-soc-secondary" /><span className="text-xs text-soc-muted">Normal Activity</span></div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-soc-warning" /><span className="text-xs text-soc-muted">Suspicious Activity</span></div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-soc-danger" /><span className="text-xs text-soc-muted">High-Risk Spikes</span></div>
      </div>
    </div>
  );
}
