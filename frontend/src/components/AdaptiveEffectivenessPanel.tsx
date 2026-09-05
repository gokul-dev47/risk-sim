import { FlaskConical, Info, ArrowRight } from 'lucide-react';
import type { AdaptiveEffectivenessResponse, AdaptiveEffectivenessCondition } from '@/types';
import UnavailablePanel from './UnavailablePanel';
import { GLASS_CARD_CLASSES, GLASS_CARD_HEADER_CLASSES, GLASS_CARD_BODY_CLASSES } from './socStyles';

interface AdaptiveEffectivenessPanelProps {
  data: AdaptiveEffectivenessResponse | null;
  isLoading?: boolean;
}

const CONDITION_LABELS: Record<string, string> = {
  A_baseline_stable_static: 'A · Baseline (stable)',
  B_drifted_static: 'B · Drifted + static',
  C_drifted_adaptive: 'C · Drifted + adaptive',
};

function ConditionCard({ id, c }: { id: string; c: AdaptiveEffectivenessCondition }) {
  const psiColor =
    c.psi_status === 'stable'
      ? 'text-soc-success'
      : c.psi_status === 'watch'
        ? 'text-soc-warning'
        : 'text-soc-danger';
  return (
    <div className="rounded-lg border border-soc-border bg-soc-card px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-soc-text">{CONDITION_LABELS[id] ?? id}</span>
        <span className={`text-[10px] font-mono ${psiColor}`}>PSI {c.psi.toFixed(2)} · {c.psi_status}</span>
      </div>
      <div className="mt-1.5 text-[10px] text-soc-muted font-mono">
        allow&lt;{c.active_allow_max_probability} · block≥{c.active_block_min_probability}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
        <div>
          <div className="font-mono text-sm font-semibold text-soc-text">{(c.recall * 100).toFixed(1)}%</div>
          <div className="text-[9px] uppercase tracking-wide text-soc-muted">recall</div>
        </div>
        <div>
          <div className="font-mono text-sm font-semibold text-soc-text">{(c.precision * 100).toFixed(1)}%</div>
          <div className="text-[9px] uppercase tracking-wide text-soc-muted">precision</div>
        </div>
        <div>
          <div className="font-mono text-sm font-semibold text-soc-text">₹{c.expected_cost_inr.toLocaleString('en-IN')}</div>
          <div className="text-[9px] uppercase tracking-wide text-soc-muted">exp. cost</div>
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-soc-muted">
        <span>review {(c.review_rate * 100).toFixed(1)}%</span>
        <span>missed {c.missed_fraud_count}</span>
      </div>
    </div>
  );
}

export default function AdaptiveEffectivenessPanel({ data, isLoading }: AdaptiveEffectivenessPanelProps) {
  return (
    <div className={GLASS_CARD_CLASSES}>
      <div className={GLASS_CARD_HEADER_CLASSES}>
        <div className="flex items-center gap-2.5">
          <FlaskConical className="h-4 w-4 text-soc-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-soc-text">Did Adaptation Actually Help?</h3>
        </div>
        <span className="text-[11px] text-soc-muted">controlled experiment, same held-out TEST rows</span>
      </div>
      <div className={GLASS_CARD_BODY_CLASSES}>
        {isLoading && !data && (
          <div className="flex h-32 items-center justify-center text-xs text-soc-muted">Loading…</div>
        )}
        {!isLoading && !data && <UnavailablePanel label="Adaptive Effectiveness Experiment Unavailable" heightClassName="h-32" />}
        {data && (
          <>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <ConditionCard id="A_baseline_stable_static" c={data.conditions.A_baseline_stable_static} />
              <ConditionCard id="B_drifted_static" c={data.conditions.B_drifted_static} />
              <ConditionCard id="C_drifted_adaptive" c={data.conditions.C_drifted_adaptive} />
            </div>

            <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-soc-muted">
              <span>B → C: adaptive vs static, same drifted batch</span>
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
              <span
                className={`font-mono font-semibold ${
                  data.adaptive_vs_static_on_drifted_batch_delta.expected_cost_delta_inr <= 0
                    ? 'text-soc-success'
                    : 'text-soc-danger'
                }`}
              >
                {data.adaptive_vs_static_on_drifted_batch_delta.expected_cost_delta_inr > 0 ? '+' : ''}
                ₹{data.adaptive_vs_static_on_drifted_batch_delta.expected_cost_delta_inr.toLocaleString('en-IN')} cost
                · {data.adaptive_vs_static_on_drifted_batch_delta.decisions_changed_by_adaptation ?? 0} decisions changed
              </span>
            </div>

            <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-soc-primary/30 bg-soc-primary/10 px-3 py-2 text-[11px] text-soc-text">
              <Info className="h-3 w-3 mt-0.5 flex-shrink-0 text-soc-primary" aria-hidden="true" />
              {data.verdict}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
