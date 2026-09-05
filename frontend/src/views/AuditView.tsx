import { useEffect, useState } from 'react';
import { getAuditChain } from '@/services/api';
import UnavailablePanel from '@/components/UnavailablePanel';
import AuditTrail from '@/components/AuditTrail';
import LiveBadge from '@/components/LiveBadge';
import EvidencePackLookup from '@/components/EvidencePackLookup';
import type { AuditLog } from '@/types';
import { mapChainEntry } from '@/utils/auditChainMapper';
import { ScrollText } from 'lucide-react';

export default function AuditView() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [source, setSource] = useState<'backend' | 'unavailable'>('backend');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getAuditChain()
      .then((result) => {
        if (cancelled) return;
        if (result.source === 'unavailable') {
          setLogs([]);
          setSource('unavailable');
          setError(result.error);
          return;
        }
        const entries = result.data.entries ?? [];
        // An empty chain is a legitimate, honest state (no transactions
        // have been scored yet in this session) — it is NOT a signal to
        // fall back to fabricated demo log entries. Previously this
        // branch rendered `mockAuditLogs`, a hardcoded set of fake
        // timestamps/transaction IDs/decisions from data/mockData.ts,
        // indistinguishable in the UI from real audit history. That has
        // been removed: an empty backend-confirmed chain now correctly
        // renders as an empty list with an explicit "no events yet"
        // message (see the empty-state JSX below), never fake rows.
        setLogs(entries.map(mapChainEntry).reverse());
        setSource('backend');
        setError(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-soc-primary" />
          <h3 className="text-base font-semibold text-soc-text font-sans">Security Audit Trail</h3>
          <span className="text-xs text-soc-muted">
            — {source === 'backend' ? 'live tamper-evident audit chain' : 'chronological incident log'}
          </span>
        </div>
        <LiveBadge source={source} />
      </div>
      {!isLoading && logs.length === 0 && source === 'unavailable' ? (
        <UnavailablePanel label="Audit Chain Unavailable" error={error} />
      ) : !isLoading && logs.length === 0 ? (
        <p className="text-sm text-soc-muted">No audit events yet — visit Live Transactions or What-If Simulator to generate some.</p>
      ) : (
        <AuditTrail logs={logs} />
      )}
      <EvidencePackLookup />
    </div>
  );
}
