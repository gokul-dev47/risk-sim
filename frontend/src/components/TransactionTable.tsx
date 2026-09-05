import { useState, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, Search, ArrowUpDown, Radio } from 'lucide-react';
import type { Transaction, Decision } from '@/types';
import DecisionBadge from './DecisionBadge';

interface TransactionTableProps {
  transactions: Transaction[];
  compact?: boolean;
  showControls?: boolean;
  showLiveIndicator?: boolean;
}

type DecisionFilter = 'ALL' | Decision;
type RiskFilter = 'ALL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type SortDir = 'asc' | 'desc';

function getRiskLevel(score: number): RiskFilter {
  if (score >= 90) return 'CRITICAL';
  if (score >= 75) return 'HIGH';
  if (score >= 45) return 'MEDIUM';
  return 'LOW';
}

function RiskScoreBar({ score }: { score: number }) {
  const isCritical = score >= 90;
  const color =
    score >= 90 ? 'bg-soc-danger shadow-[0_0_8px_rgba(255,77,109,0.5)]' :
    score >= 75 ? 'bg-soc-danger' :
    score >= 45 ? 'bg-soc-warning' :
    'bg-soc-success';
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-20 h-1.5 rounded-full bg-soc-card overflow-hidden">
        <div
          className={`h-full rounded-full ${color} animate-grow-bar transition-all duration-700`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-xs font-mono font-semibold ${isCritical ? 'text-soc-danger' : 'text-soc-text'}`}>{score}</span>
    </div>
  );
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

const decisionFilters: DecisionFilter[] = ['ALL', 'ALLOW', 'REVIEW', 'BLOCK'];
const riskFilters: RiskFilter[] = ['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const decisionBtnStyles: Record<DecisionFilter, string> = {
  ALL: 'active:bg-soc-primary/20 active:text-soc-text active:border-soc-primary/30',
  ALLOW: 'active:bg-soc-success/15 active:text-soc-success active:border-soc-success/30',
  REVIEW: 'active:bg-soc-warning/15 active:text-soc-warning active:border-soc-warning/30',
  BLOCK: 'active:bg-soc-danger/15 active:text-soc-danger active:border-soc-danger/30',
};

const riskBtnStyles: Record<RiskFilter, string> = {
  ALL: 'active:bg-soc-primary/20 active:text-soc-text active:border-soc-primary/30',
  LOW: 'active:bg-soc-success/15 active:text-soc-success active:border-soc-success/30',
  MEDIUM: 'active:bg-soc-warning/15 active:text-soc-warning active:border-soc-warning/30',
  HIGH: 'active:bg-soc-danger/15 active:text-soc-danger active:border-soc-danger/30',
  CRITICAL: 'active:bg-soc-danger/20 active:text-soc-danger active:border-soc-danger/40 active:shadow-[0_0_10px_-2px_rgba(255,77,109,0.4)]',
};

export default function TransactionTable({ transactions, compact, showControls = true, showLiveIndicator = false }: TransactionTableProps) {
  const [search, setSearch] = useState('');
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>('ALL');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('ALL');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const filtered = useMemo(() => {
    let result = transactions;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(tx => tx.id.toLowerCase().includes(q));
    }
    if (decisionFilter !== 'ALL') {
      result = result.filter(tx => tx.decision === decisionFilter);
    }
    if (riskFilter !== 'ALL') {
      result = result.filter(tx => getRiskLevel(tx.risk_score) === riskFilter);
    }

    result = [...result].sort((a, b) => sortDir === 'desc' ? b.risk_score - a.risk_score : a.risk_score - b.risk_score);

    return result;
  }, [transactions, search, decisionFilter, riskFilter, sortDir]);

  const rows = compact ? filtered.slice(0, 6) : filtered;

  return (
    <div className="space-y-4">
      {/* Live feed indicator */}
      {showLiveIndicator && (
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg glass">
            <Radio className="w-3.5 h-3.5 text-soc-secondary" />
            <span className="text-xs font-mono text-soc-secondary tracking-wide font-semibold">LIVE SYNTHETIC FEED</span>
            <span className="w-1.5 h-1.5 rounded-full bg-soc-secondary animate-pulse-cyan" />
          </div>
          <span className="text-xs text-soc-muted">Monitoring synthetic payment activity</span>
        </div>
      )}

      {/* Controls */}
      {showControls && (
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          {/* Search */}
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-soc-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search transaction ID..."
              className="w-full pl-9 pr-3 py-2 rounded-lg glass text-sm text-soc-text placeholder-soc-muted focus:outline-none focus:border-soc-primary/40 transition-colors"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            {/* Decision filter */}
            <div className="flex items-center gap-1 p-1 rounded-lg glass">
              {decisionFilters.map(f => (
                <button
                  key={f}
                  onClick={() => setDecisionFilter(f)}
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold tracking-wide border border-transparent transition-all ${decisionFilter === f ? decisionBtnStyles[f] + ' bg-soc-primary/15 text-soc-text border-soc-primary/25' : 'text-soc-muted hover:text-soc-text'}`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Risk filter */}
            <div className="flex items-center gap-1 p-1 rounded-lg glass">
              {riskFilters.map(f => (
                <button
                  key={f}
                  onClick={() => setRiskFilter(f)}
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold tracking-wide border border-transparent transition-all ${riskFilter === f ? riskBtnStyles[f] + ' bg-soc-primary/15 text-soc-text border-soc-primary/25' : 'text-soc-muted hover:text-soc-text'}`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Sort */}
            <button
              onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg glass text-[11px] font-semibold text-soc-muted hover:text-soc-text transition-colors"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              Risk {sortDir === 'desc' ? '↓' : '↑'}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-soc-border bg-white/[0.015]">
                <th className="text-left px-5 py-4 text-[11px] font-semibold text-soc-muted uppercase tracking-[0.1em]">Transaction ID</th>
                <th className="text-left px-5 py-4 text-[11px] font-semibold text-soc-muted uppercase tracking-[0.1em]">Timestamp</th>
                <th className="text-right px-5 py-4 text-[11px] font-semibold text-soc-muted uppercase tracking-[0.1em]">Amount</th>
                <th className="text-center px-5 py-4 text-[11px] font-semibold text-soc-muted uppercase tracking-[0.1em]">Velocity (1H)</th>
                <th className="text-center px-5 py-4 text-[11px] font-semibold text-soc-muted uppercase tracking-[0.1em]">Geo Mismatch</th>
                <th className="text-center px-5 py-4 text-[11px] font-semibold text-soc-muted uppercase tracking-[0.1em]">CVV Failure Rate</th>
                <th className="text-center px-5 py-4 text-[11px] font-semibold text-soc-muted uppercase tracking-[0.1em]">Distinct Cards (1H)</th>
                <th className="text-left px-5 py-4 text-[11px] font-semibold text-soc-muted uppercase tracking-[0.1em]">Risk Score</th>
                <th className="text-center px-5 py-4 text-[11px] font-semibold text-soc-muted uppercase tracking-[0.1em]">Decision</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-soc-muted">
                    No transactions match the current filters.
                  </td>
                </tr>
              ) : (
                rows.map((tx, i) => {
                  const isHighRisk = tx.risk_score >= 75;
                  return (
                    <tr
                      key={tx.id}
                      className={`border-b border-soc-border/40 hover:bg-soc-primary/[0.03] transition-colors duration-200 animate-slide-up ${
                        isHighRisk ? 'bg-soc-danger/[0.025] border-l-2 border-l-soc-danger/40' : i % 2 === 0 ? '' : 'bg-white/[0.008]'
                      }`}
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      <td className="px-5 py-4">
                        <span className="font-mono text-xs text-soc-secondary">{tx.id}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono text-xs text-soc-muted">{formatTimestamp(tx.timestamp)}</span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="font-mono text-soc-text font-medium">₹{tx.amount.toFixed(2)}</span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={`font-mono text-xs ${tx.velocity_1h >= 10 ? 'text-soc-danger' : tx.velocity_1h >= 5 ? 'text-soc-warning' : 'text-soc-text'}`}>
                          {tx.velocity_1h}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        {tx.geo_mismatch ? (
                          <span className="inline-flex items-center gap-1 text-xs text-soc-danger font-medium">
                            <ArrowUpRight className="w-3 h-3" /> Yes
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-soc-muted">
                            <ArrowDownRight className="w-3 h-3 opacity-50" /> No
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={`font-mono text-xs ${tx.cvv_failure_rate >= 0.5 ? 'text-soc-danger' : tx.cvv_failure_rate >= 0.2 ? 'text-soc-warning' : 'text-soc-text'}`}>
                          {(tx.cvv_failure_rate * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span
                          className={`font-mono text-xs ${tx.distinct_cards_1h >= 3 ? 'text-soc-danger' : tx.distinct_cards_1h >= 1 ? 'text-soc-warning' : 'text-soc-text'}`}
                          title="Distinct card numbers this device has attempted in the last hour"
                        >
                          {tx.distinct_cards_1h}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <RiskScoreBar score={tx.risk_score} />
                      </td>
                      <td className="px-5 py-4 text-center">
                        <DecisionBadge decision={tx.decision} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
