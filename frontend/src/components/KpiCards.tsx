import { useEffect, useState } from 'react';
import { ArrowRightLeft, ShieldAlert, Target, IndianRupee, TrendingUp } from 'lucide-react';
import { getModelMetrics } from '@/services/api';
import LiveBadge from '@/components/LiveBadge';
import type { FullModelMetrics } from '@/types';

interface CardDef {
  label: string;
  value: string;
  icon: typeof ArrowRightLeft;
  accent: string;
  glow: string;
  sub: string;
  trendValue: string;
}

function buildCards(metrics: FullModelMetrics): CardDef[] {
  const totals = metrics.dataset_totals;
  return [
    {
      label: 'TOTAL TRANSACTIONS',
      value: totals.total_transactions.toLocaleString('en-IN'),
      icon: ArrowRightLeft,
      accent: 'text-soc-secondary',
      glow: 'from-soc-secondary/20',
      sub: 'Synthetic dataset (train + held-out test)',
      trendValue: `${(totals.attack_rate * 100).toFixed(1)}% attack rate`,
    },
    {
      label: 'THREATS DETECTED (dataset)',
      value: totals.total_attacks.toLocaleString('en-IN'),
      icon: ShieldAlert,
      accent: 'text-soc-danger',
      glow: 'from-soc-danger/20',
      sub: '3 attack subtypes: burst, low-and-slow, BIN enum',
      trendValue: `${(totals.attack_rate * 100).toFixed(1)}% of traffic`,
    },
    {
      label: 'MODEL RECALL (held-out)',
      value: `${(metrics.fusion.recall * 100).toFixed(1)}%`,
      icon: Target,
      accent: 'text-soc-primary',
      glow: 'from-soc-primary/20',
      sub: `Fusion (RF + IsolationForest) — RF alone: ${(metrics.recall * 100).toFixed(1)}%`,
      trendValue: `${(metrics.precision * 100).toFixed(1)}% precision`,
    },
    {
      label: 'FALSE POSITIVE COST (held-out)',
      value: `₹${metrics.estimated_false_positive_cost_inr.toLocaleString('en-IN')}`,
      icon: IndianRupee,
      accent: 'text-soc-warning',
      glow: 'from-soc-warning/20',
      sub: `${metrics.false_positives} false positive(s) on ${metrics.n_test} held-out transactions`,
      trendValue: `₹${metrics.cost_per_false_positive_inr}/FP`,
    },
  ];
}

const FALLBACK_CARDS: CardDef[] = [
  {
    label: 'TOTAL TRANSACTIONS',
    value: '—',
    icon: ArrowRightLeft,
    accent: 'text-soc-secondary',
    glow: 'from-soc-secondary/20',
    sub: 'Loading…',
    trendValue: '',
  },
  {
    label: 'THREATS DETECTED (dataset)',
    value: '—',
    icon: ShieldAlert,
    accent: 'text-soc-danger',
    glow: 'from-soc-danger/20',
    sub: 'Loading…',
    trendValue: '',
  },
  {
    label: 'MODEL RECALL (held-out)',
    value: '—',
    icon: Target,
    accent: 'text-soc-primary',
    glow: 'from-soc-primary/20',
    sub: 'Loading…',
    trendValue: '',
  },
  {
    label: 'FALSE POSITIVE COST (held-out)',
    value: '—',
    icon: IndianRupee,
    accent: 'text-soc-warning',
    glow: 'from-soc-warning/20',
    sub: 'Loading…',
    trendValue: '',
  },
];

export default function KpiCards() {
  const [cards, setCards] = useState<CardDef[]>(FALLBACK_CARDS);
  const [source, setSource] = useState<'backend' | 'unavailable'>('backend');

  useEffect(() => {
    let cancelled = false;
    getModelMetrics().then((result) => {
      if (cancelled) return;
      if (result.source === 'backend') {
        setCards(buildCards(result.data));
      } else {
        setCards(FALLBACK_CARDS.map((c) => ({ ...c, sub: 'Unavailable' })));
      }
      setSource(result.source);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <LiveBadge source={source} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="glass glass-hover rounded-2xl p-5 relative overflow-hidden group animate-slide-up"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div
                className={`absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br ${card.glow} to-transparent blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-500`}
              />
              <div className="relative flex items-start justify-between mb-3">
                <div
                  className={`w-11 h-11 rounded-xl bg-soc-card border border-soc-border flex items-center justify-center ${card.accent} group-hover:scale-110 transition-transform duration-300`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                {card.trendValue && (
                  <div className={`flex items-center gap-1 text-[10px] font-mono ${card.accent} opacity-70`}>
                    <TrendingUp className="w-3 h-3" />
                    {card.trendValue}
                  </div>
                )}
              </div>
              <div className="relative">
                <p className="text-[11px] font-medium text-soc-muted uppercase tracking-[0.1em] mb-2">
                  {card.label}
                </p>
                <p className="text-3xl font-bold text-soc-text font-mono tracking-tight">{card.value}</p>
                <p className="text-[11px] text-soc-muted mt-1.5">{card.sub}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
