import { ShieldAlert, Gauge, Percent, Activity } from 'lucide-react';
import { analyticsSummary, kpis } from '@/data/mockData';

function RadialScore({ value, color }: { value: number; color: string }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  return (
    <div className="relative w-24 h-24">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(51,149,255,0.08)" strokeWidth="5" />
        <circle
          cx="50" cy="50" r={radius} fill="none"
          stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.2s ease-out', filter: `drop-shadow(0 0 5px ${color}80)` }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-bold font-mono" style={{ color }}>{value}%</span>
      </div>
    </div>
  );
}

const cards = [
  {
    label: 'OVERALL RISK SCORE',
    value: 51,
    color: '#F59E0B',
    icon: Activity,
    sub: 'Moderate threat exposure',
    isRadial: true,
  },
  {
    label: 'HIGH-RISK TRANSACTIONS',
    value: analyticsSummary.high_risk_count,
    icon: ShieldAlert,
    accent: 'text-soc-danger',
    glow: 'from-soc-danger/20',
    sub: 'risk score >= 75',
    trend: '+2 vs last period',
  },
  {
    label: 'AVERAGE THREAT SCORE',
    value: analyticsSummary.avg_risk_score,
    icon: Gauge,
    accent: 'text-soc-primary',
    glow: 'from-soc-primary/20',
    sub: 'across monitored transactions',
    trend: '+8.3%',
  },
  {
    label: 'THREAT DETECTION RATE',
    value: `${analyticsSummary.threat_rate}%`,
    icon: Percent,
    accent: 'text-soc-success',
    glow: 'from-soc-success/20',
    sub: `${kpis.threats_detected.toLocaleString('en-IN')} threats flagged`,
    trend: '100% recall',
  },
];

export default function RiskOverviewCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="glass glass-hover rounded-2xl p-5 relative overflow-hidden group animate-slide-up"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            {card.glow && (
              <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br ${card.glow} to-transparent blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-500`} />
            )}
            <div className="relative flex items-start justify-between mb-3">
              <div className={`w-11 h-11 rounded-xl bg-soc-card border border-soc-border flex items-center justify-center ${card.accent ?? ''} group-hover:scale-110 transition-transform duration-300`}>
                <Icon className="w-5 h-5" />
              </div>
              {card.isRadial && <RadialScore value={card.value} color={card.color} />}
            </div>
            <div className="relative">
              <p className="text-[11px] font-medium text-soc-muted uppercase tracking-[0.1em] mb-2">{card.label}</p>
              {!card.isRadial && (
                <p className="text-3xl font-bold text-soc-text font-mono tracking-tight">{card.value}</p>
              )}
              <p className="text-[11px] text-soc-muted mt-1.5">{card.sub}</p>
              {card.trend && (
                <p className={`text-[10px] font-mono mt-1 ${card.accent ?? 'text-soc-muted'}`}>{card.trend}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
