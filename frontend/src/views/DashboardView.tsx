import { useEffect, useState } from 'react';
import KpiCards from '@/components/KpiCards';
import TransactionTable from '@/components/TransactionTable';
import RiskAnalyticsChart from '@/components/RiskAnalyticsChart';
import ThreatAlertPanel from '@/components/ThreatAlertPanel';
import AuditTrail from '@/components/AuditTrail';
import LiveBadge from '@/components/LiveBadge';
import UnavailablePanel from '@/components/UnavailablePanel';
import MerchantLossPreventionCard from '@/components/MerchantLossPreventionCard';
import useLiveFeed, { type ScoredTransaction } from '@/hooks/useLiveFeed';
import { getModelMetrics, getAuditChain } from '@/services/api';
import { mapChainEntry } from '@/utils/auditChainMapper';
import type { FullModelMetrics, Transaction, AuditLog } from '@/types';
import { Activity, ScrollText, Radar } from 'lucide-react';

// Reconstructs a display amount from amount_log = log1p(amount), the SAME
// transform backend/main.py's feature engineering uses — i.e. this is an
// accurate inverse, not an invented number.
function amountFromLog(amountLog: number): number {
  return Math.round(Math.expm1(amountLog));
}

function toTransaction(sc: ScoredTransaction): Transaction {
  return {
    id: sc.id,
    amount: amountFromLog(sc.features.amount_log),
    velocity_1h: sc.features.velocity_1h,
    geo_mismatch: sc.features.geo_mismatch === 1,
    cvv_failure_rate: sc.features.cvv_failure_rate,
    distinct_cards_1h: sc.features.distinct_cards_1h,
    risk_score: sc.risk_probability,
    decision: sc.decision,
    timestamp: new Date(sc.timestamp).toISOString(),
  };
}

function LossPreventionSection() {
  const [metrics, setMetrics] = useState<FullModelMetrics | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getModelMetrics().then((result) => {
      if (cancelled) return;
      setMetrics(result.data);
      setUnavailable(result.source === 'unavailable');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (unavailable) {
    return <UnavailablePanel label="Loss-Prevention Data Unavailable" heightClassName="h-24" />;
  }
  if (!metrics) {
    return <div className="glass rounded-2xl p-6 text-sm text-soc-muted">Loading loss-prevention proof…</div>;
  }
  return <MerchantLossPreventionCard metrics={metrics} />;
}

function LiveStatusStrip() {
  const { counts, backendConnected } = useLiveFeed();
  const [metrics, setMetrics] = useState<FullModelMetrics | null>(null);

  useEffect(() => {
    let cancelled = false;
    getModelMetrics().then((result) => {
      if (!cancelled) setMetrics(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const total = counts.ALLOW + counts.REVIEW + counts.BLOCK;

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Radar className="w-4 h-4 text-soc-primary" />
          <h3 className="text-sm font-semibold text-soc-text font-sans">Live System Status</h3>
          <span className="text-xs text-soc-muted">— this session, scored against the real model</span>
        </div>
        <LiveBadge source={backendConnected ? 'backend' : 'unavailable'} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StripStat label="Scored" value={String(total)} accent="text-soc-secondary" />
        <StripStat label="Allow" value={String(counts.ALLOW)} accent="text-soc-success" />
        <StripStat label="Review" value={String(counts.REVIEW)} accent="text-soc-warning" />
        <StripStat label="Block" value={String(counts.BLOCK)} accent="text-soc-danger" />
        <StripStat
          label="Model Recall"
          value={metrics ? `${(metrics.recall * 100).toFixed(1)}%` : '—'}
          accent="text-soc-primary"
        />
      </div>
    </div>
  );
}

function StripStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-soc-border bg-soc-card px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-soc-muted">{label}</div>
      <div className={`text-lg font-bold font-mono ${accent}`}>{value}</div>
    </div>
  );
}

// Recent Security Incidents: real audit-chain entries (GET /audit/chain),
// mapped with the SAME shared mapper AuditView.tsx uses — NOT the
// fabricated `auditLogs` from data/mockData.ts that used to be hardcoded
// here regardless of what the backend actually recorded.
function RecentIncidentsSection() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAuditChain(5).then((result) => {
      if (cancelled) return;
      if (result.source === 'unavailable') {
        setError(result.error);
        setLogs([]);
      } else {
        setError(null);
        setLogs((result.data.entries ?? []).map(mapChainEntry).reverse());
      }
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return <div className="text-sm text-soc-muted">Loading recent incidents…</div>;
  }
  if (error) {
    return <UnavailablePanel label="Audit Chain Unavailable" error={error} heightClassName="h-24" />;
  }
  if (logs.length === 0) {
    return <p className="text-sm text-soc-muted">No audit events yet — visit Live Transactions or What-If Simulator to generate some.</p>;
  }
  return <AuditTrail logs={logs} />;
}

export default function DashboardView() {
  const { transactions: liveTransactions, backendConnected } = useLiveFeed();
  const displayTransactions = liveTransactions.slice(0, 6).map(toTransaction);

  return (
    <div className="space-y-6 animate-fade-in">
      <LossPreventionSection />

      <KpiCards />

      <LiveStatusStrip />

      {/* Alert panel — real, session-derived (see ThreatAlertPanel.tsx).
          NOTE: ThreatDistributionChart / RiskScoreDistributionChart /
          ThreatTimelineChart were removed from this LIVE dashboard —
          they were rendering hardcoded data/mockData.ts figures
          unconditionally, mislabeled as live. Cross-session aggregate
          trend charts like these need a real backend aggregation
          endpoint (persisted transaction history) to be honest on a
          live view; that does not exist yet, so rather than leave
          fabricated charts on the primary dashboard, they were left
          only on the Analytics tab, explicitly labeled there as
          illustrative/demo. See AnalyticsView.tsx. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <ThreatAlertPanel />
        </div>
      </div>

      {/* Live transaction feed — real scored transactions from useLiveFeed(),
          which sends genuinely generated feature vectors to the REAL
          backend /predict endpoint; decision/risk_score/anomaly flags shown
          here are actual model output, not fabricated (see useLiveFeed.ts
          for the disclosed limitation on how the underlying feature
          vectors themselves are produced). */}
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-soc-primary" />
        <h3 className="text-base font-semibold text-soc-text font-sans">Live Transaction Feed</h3>
        <span className="text-xs text-soc-muted">— showing latest {displayTransactions.length} transactions</span>
      </div>
      {displayTransactions.length === 0 ? (
        backendConnected ? (
          <div className="glass rounded-2xl p-6 text-sm text-soc-muted">Waiting for live events…</div>
        ) : (
          <UnavailablePanel label="Risk Engine Unavailable" heightClassName="h-24" />
        )
      ) : (
        <TransactionTable transactions={displayTransactions} compact showControls={false} showLiveIndicator />
      )}

      {/* Feature importance — real model output */}
      <RiskAnalyticsChart />

      {/* Recent incidents */}
      <div className="flex items-center gap-2">
        <ScrollText className="w-4 h-4 text-soc-primary" />
        <h3 className="text-base font-semibold text-soc-text font-sans">Recent Security Incidents</h3>
      </div>
      <RecentIncidentsSection />
    </div>
  );
}
