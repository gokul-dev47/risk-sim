import { Gauge, Bug, Info } from 'lucide-react';
import type { LoadTestResponse, EvasionAnalysisResponse } from '@/types';
import UnavailablePanel from './UnavailablePanel';
import { GLASS_CARD_CLASSES, GLASS_CARD_HEADER_CLASSES, GLASS_CARD_BODY_CLASSES } from './socStyles';

interface DemoReadinessPanelProps {
  loadTest: LoadTestResponse | null;
  evasion: EvasionAnalysisResponse | null;
  isLoading?: boolean;
  loadTestError?: string | null;
  evasionError?: string | null;
}

export default function DemoReadinessPanel({ loadTest, evasion, isLoading, loadTestError, evasionError }: DemoReadinessPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Phase B: latency under load */}
      <div className={GLASS_CARD_CLASSES}>
        <div className={GLASS_CARD_HEADER_CLASSES}>
          <div className="flex items-center gap-2.5">
            <Gauge className="h-4 w-4 text-soc-primary" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-soc-text">Latency Under Concurrent Load</h3>
          </div>
          <span className="text-[11px] text-soc-muted">/predict, asyncio-driven</span>
        </div>
        <div className={GLASS_CARD_BODY_CLASSES}>
          {isLoading && !loadTest && (
            <div className="flex h-32 items-center justify-center text-xs text-soc-muted">Loading…</div>
          )}
          {!isLoading && !loadTest && (
            <UnavailablePanel label="Load Test Data Unavailable" error={loadTestError} heightClassName="h-32" />
          )}
          {loadTest && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {loadTest.results_by_concurrency.map((r) => (
                  <div key={r.concurrency} className="rounded-lg border border-soc-border bg-soc-card px-2 py-2 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-soc-muted">c={r.concurrency}</div>
                    <div className="font-mono text-sm font-semibold text-soc-text">{r.p50_ms}ms</div>
                    <div className="text-[10px] text-soc-muted">p50</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-soc-warning/30 bg-soc-warning/10 px-3 py-2 text-[11px] text-soc-text">
                <Info className="h-3 w-3 mt-0.5 flex-shrink-0 text-soc-warning" aria-hidden="true" />
                {loadTest.honest_summary}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Phase C: adversarial / evasion analysis */}
      <div className={GLASS_CARD_CLASSES}>
        <div className={GLASS_CARD_HEADER_CLASSES}>
          <div className="flex items-center gap-2.5">
            <Bug className="h-4 w-4 text-soc-primary" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-soc-text">Adversarial Spacing Analysis</h3>
          </div>
          <span className="text-[11px] text-soc-muted">low_and_slow, widened spacing</span>
        </div>
        <div className={GLASS_CARD_BODY_CLASSES}>
          {isLoading && !evasion && (
            <div className="flex h-32 items-center justify-center text-xs text-soc-muted">Loading…</div>
          )}
          {!isLoading && !evasion && (
            <UnavailablePanel label="Evasion Analysis Unavailable" error={evasionError} heightClassName="h-32" />
          )}
          {evasion && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-soc-border bg-soc-card px-2 py-2">
                  <div className="font-mono text-sm font-semibold text-soc-text">
                    {evasion.structural_velocity_breakpoint_minutes}min
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-soc-muted">velocity breakpoint</div>
                </div>
                <div className="rounded-lg border border-soc-border bg-soc-card px-2 py-2">
                  <div className="font-mono text-sm font-semibold text-soc-text">
                    {(evasion.recall_drop_baseline_to_worst * 100).toFixed(1)}%
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-soc-muted">recall drop</div>
                </div>
                <div className="rounded-lg border border-soc-border bg-soc-card px-2 py-2">
                  <div className="font-mono text-sm font-semibold text-soc-text">
                    {evasion.results_by_spacing.length > 0
                      ? evasion.results_by_spacing[evasion.results_by_spacing.length - 1].mean_identity_cluster_size.toFixed(0)
                      : '—'}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-soc-muted">cluster size @ max spacing</div>
                </div>
              </div>
              <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-soc-border bg-soc-card px-3 py-2 text-[11px] text-soc-muted">
                <Info className="h-3 w-3 mt-0.5 flex-shrink-0" aria-hidden="true" />
                {evasion.honest_conclusion}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
