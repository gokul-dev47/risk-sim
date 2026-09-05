import { Percent, ShieldAlert, Gauge, Signal } from 'lucide-react';
import { analyticsSummary } from '@/data/mockData';

const cards = [
  {
    label: 'THREAT RATE',
    value: `${analyticsSummary.threat_rate}%`,
    icon: Percent,
    accent: 'text-soc-danger',
    glow: 'from-soc-danger/20',
    sub: 'of total transaction volume',
  },
  {
    label: 'HIGH-RISK TRANSACTIONS',
    value: analyticsSummary.high_risk_count.toString(),
    icon: ShieldAlert,
    accent: 'text-soc-warning',
    glow: 'from-soc-warning/20',
    sub: 'risk score ≥ 75',
  },
  {
    label: 'AVG RISK SCORE',
    value: analyticsSummary.avg_risk_score.toString(),
    icon: Gauge,
    accent: 'text-soc-primary',
    glow: 'from-soc-primary/20',
    sub: 'across all monitored transactions',
  },
  {
    label: 'MOST COMMON SIGNAL',
    value: analyticsSummary.most_common_signal,
    icon: Signal,
    accent: 'text-soc-secondary',
    glow: 'from-soc-secondary/20',
    sub: 'primary threat indicator',
    isText: true,
  },
];

export default function AnalyticsSummaryCards() {
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
            <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br ${card.glow} to-transparent blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-500`} />
            <div className="relative flex items-start justify-between mb-3">
              <div className={`w-11 h-11 rounded-xl bg-soc-card border border-soc-border flex items-center justify-center ${card.accent} group-hover:scale-110 transition-transform duration-300`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
            <div className="relative">
              <p className="text-[11px] font-medium text-soc-muted uppercase tracking-[0.1em] mb-2">{card.label}</p>
              <p className={`font-bold text-soc-text font-mono tracking-tight ${card.isText ? 'text-lg' : 'text-3xl'}`}>{card.value}</p>
              <p className="text-[11px] text-soc-muted mt-1.5">{card.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
