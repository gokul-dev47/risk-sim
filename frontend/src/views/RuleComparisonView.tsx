import { useEffect, useState } from 'react';
import { GitCompare } from 'lucide-react';
import { getBaselineComparison } from '@/services/api';
import type { BaselineComparisonResponse } from '@/types';
import RuleVsAiComparisonCard from '@/components/RuleVsAiComparisonCard';
import LiveBadge from '@/components/LiveBadge';
import UnavailablePanel from '@/components/UnavailablePanel';

export default function RuleComparisonView() {
  const [data, setData] = useState<BaselineComparisonResponse | null>(null);
  const [source, setSource] = useState<'backend' | 'unavailable' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getBaselineComparison()
      .then((result) => {
        if (cancelled) return;
        setData(result.data);
        setSource(result.source);
        setError(result.source === 'unavailable' ? result.error : null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-soc-primary" />
          <h3 className="text-base font-semibold text-soc-text font-sans">AI vs Traditional Rule Engine</h3>
          <span className="text-xs text-soc-muted">
            — where a simple rule holds up, and where ML fusion is doing real work
          </span>
        </div>
        {source && <LiveBadge source={source} />}
      </div>

      {loading && <div className="text-sm text-soc-muted">Loading comparison data…</div>}

      {!loading && !data && (
        <UnavailablePanel label="Baseline Comparison Unavailable" error={error} />
      )}

      {!loading && data && <RuleVsAiComparisonCard data={data} />}
    </div>
  );
}
