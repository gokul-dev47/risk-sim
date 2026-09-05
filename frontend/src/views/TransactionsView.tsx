import { useMemo } from 'react';
import TransactionTable from '@/components/TransactionTable';
import LiveBadge from '@/components/LiveBadge';
import useLiveFeed from '@/hooks/useLiveFeed';
import type { Transaction } from '@/types';
import { Activity } from 'lucide-react';

export default function TransactionsView() {
  const { transactions, backendConnected, isLive } = useLiveFeed();

  const mapped: Transaction[] = useMemo(
    () =>
      transactions.map((tx) => ({
        id: tx.id,
        amount: Math.round(Math.expm1(tx.features.amount_log)),
        velocity_1h: tx.features.velocity_1h,
        geo_mismatch: tx.features.geo_mismatch === 1,
        cvv_failure_rate: tx.features.cvv_failure_rate,
        distinct_cards_1h: tx.features.distinct_cards_1h,
        risk_score: Math.round(tx.risk_probability * 100),
        decision: tx.decision,
        timestamp: new Date(tx.timestamp).toISOString(),
      })),
    [transactions]
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-soc-primary" />
          <h3 className="text-base font-semibold text-soc-text font-sans">Live Transactions</h3>
          <span className="text-xs text-soc-muted">
            — {isLive ? 'real-time synthetic payment monitoring' : 'feed paused'}
          </span>
        </div>
        <LiveBadge source={backendConnected ? 'backend' : 'mock'} />
      </div>
      <TransactionTable transactions={mapped} showControls showLiveIndicator />
    </div>
  );
}
