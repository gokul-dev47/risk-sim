import { ShieldCheck, TrendingDown, Info, AlertTriangle } from 'lucide-react';
import type { FullModelMetrics } from '@/types';

interface MerchantLossPreventionCardProps {
  metrics: FullModelMetrics;
}

function formatInr(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

export default function MerchantLossPreventionCard({ metrics }: MerchantLossPreventionCardProps) {
  const summary = metrics.protection_summary;

  // A stale data/processed/model_metrics.json from an older pipeline run
  // can genuinely lack this field (see the comment on FullModelMetrics in
  // types.ts) — degrade gracefully instead of crashing the dashboard.
  if (!summary || !summary.at_deployed_policy) {
    return (
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-2.5 text-sm text-soc-muted">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-soc-warning" aria-hidden="true" />
          <div>
            <p className="font-semibold text-soc-text">Loss-prevention summary unavailable</p>
            <p className="mt-1 text-xs">
              The trained-model artifact is missing the protection-summary data this card needs. Retrain with{' '}
              <code className="font-mono text-soc-secondary">python3 run_pipeline.py</code> to regenerate it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const deployed = summary.at_deployed_policy;
  const undefended = summary.counterfactual_no_system_loss_inr;
  const preventedPct = undefended > 0 ? (deployed.loss_prevented_inr / undefended) * 100 : 0;
  const residualPct = undefended > 0 ? (deployed.residual_loss_inr / undefended) * 100 : 0;

  return (
    <div className="glass rounded-2xl p-6">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-5 w-5 text-soc-success" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold text-soc-text">Merchant Loss Prevention</h3>
            <p className="text-xs text-soc-muted">{summary.loss_class}</p>
          </div>
        </div>
        <span className="text-[11px] text-soc-muted">
          Held-out test set — {summary.held_out_test_set_size.toLocaleString('en-IN')} transactions
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Before / after headline numbers */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-soc-danger">
              <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
              Without this system
            </div>
            <div className="mt-1 text-3xl font-bold font-mono text-soc-danger">{formatInr(undefended)}</div>
            <div className="text-xs text-soc-muted">
              would have been lost — every attack in the held-out set succeeds undetected
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-xs text-soc-success">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              With this system, at the deployed policy
            </div>
            <div className="mt-1 text-3xl font-bold font-mono text-soc-success">
              {formatInr(deployed.net_protection_inr)}
            </div>
            <div className="text-xs text-soc-muted">
              net protection — {formatInr(deployed.loss_prevented_inr)} prevented minus{' '}
              {formatInr(deployed.friction_cost_inr)} in false-positive friction
            </div>
          </div>
        </div>

        {/* Stacked bar visual */}
        <div className="flex flex-col justify-center space-y-3">
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-soc-muted">
              <span>Undefended</span>
              <span>{formatInr(undefended)}</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-soc-card">
              <div className="h-full rounded-full bg-soc-danger" style={{ width: '100%' }} />
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-soc-muted">
              <span>With system (prevented vs. residual)</span>
              <span>{preventedPct.toFixed(1)}% prevented</span>
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-soc-card">
              <div className="h-full bg-soc-success" style={{ width: `${preventedPct}%` }} />
              <div className="h-full bg-soc-danger" style={{ width: `${residualPct}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2">
            <Stat label="Attacks Prevented" value={String(deployed.attacks_prevented)} accent="text-soc-success" />
            <Stat label="Attacks Missed" value={String(deployed.attacks_missed)} accent="text-soc-danger" />
            <Stat label="False Positives" value={String(deployed.false_positives)} accent="text-soc-warning" />
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-start gap-1.5 rounded-lg border border-soc-border bg-soc-card px-3 py-2 text-[11px] text-soc-muted">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" aria-hidden="true" />
        {summary.note}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg border border-soc-border bg-soc-card px-2.5 py-2 text-center">
      <div className={`text-lg font-bold font-mono ${accent}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-soc-muted">{label}</div>
    </div>
  );
}
