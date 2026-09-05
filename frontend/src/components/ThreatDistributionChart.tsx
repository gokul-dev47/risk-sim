import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { threatDistribution } from '@/data/mockData';

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: { name: string; color: string } }[] }) {
  if (active && payload && payload.length) {
    const item = payload[0];
    return (
      <div className="glass rounded-lg px-3 py-2 border border-soc-primary/30">
        <p className="text-xs font-mono text-soc-text">{item.payload.name}</p>
        <p className="text-xs font-semibold" style={{ color: item.payload.color }}>{item.value.toLocaleString('en-IN')}</p>
      </div>
    );
  }
  return null;
}

export default function ThreatDistributionChart() {
  const total = threatDistribution.reduce((s, d) => s + d.value, 0);

  return (
    <div className="glass glass-hover rounded-2xl p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-soc-text font-sans">Threat Distribution</h3>
        <p className="text-xs text-soc-muted mt-1">Normal, suspicious, and high-risk transaction breakdown</p>
      </div>
      <div className="relative h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={threatDistribution}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={100}
              paddingAngle={3}
              dataKey="value"
              stroke="none"
              animationBegin={200}
              animationDuration={1000}
            >
              {threatDistribution.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-3xl font-bold text-soc-text font-mono">{total.toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-soc-muted uppercase tracking-wider mt-1">TOTAL EVENTS</p>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-6 mt-4">
        {threatDistribution.map((d) => (
          <div key={d.name} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="text-xs text-soc-muted">{d.name}</span>
            <span className="text-xs font-mono text-soc-text font-semibold">{d.value.toLocaleString('en-IN')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
