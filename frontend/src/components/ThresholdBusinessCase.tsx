import { Landmark, Info, CheckCircle2 } from 'lucide-react';
import type { ThresholdBusinessCaseResponse } from '@/types';
import UnavailablePanel from './UnavailablePanel';
import { GLASS_CARD_CLASSES, GLASS_CARD_HEADER_CLASSES, GLASS_CARD_BODY_CLASSES } from './socStyles';

interface ThresholdBusinessCaseProps {
  data: ThresholdBusinessCaseResponse | null;
  isLoading?: boolean;
}

function formatInr(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

const POINT_ACCENT: Record<string, string> = {
  aggressive: 'border-soc-danger/30 bg-soc-danger/5',
  balanced: 'border-soc-primary/40 bg-soc-primary/10',
  conservative: 'border-soc-success/30 bg-soc-success/5',
};

export default function ThresholdBusinessCase({ data, isLoading }: ThresholdBusinessCaseProps) {
  return (
    <div className={GLASS_CARD_CLASSES}>
      <div className={GLASS_CARD_HEADER_CLASSES}>
        <div className="flex items-center gap-2.5">
          <Landmark className="h-4 w-4 text-soc-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-soc-text">Threshold as a Business Decision</h3>
        </div>
        <span className="text-[11px] text-soc-muted">Monthly-equivalent, extrapolated from TEST</span>
      </div>

      <div className={GLASS_CARD_BODY_CLASSES}>
        {isLoading && !data && (
          <div className="flex h-40 items-center justify-center text-xs text-soc-muted">
            Loading business case…
          </div>
        )}

        {!isLoading && !data && <UnavailablePanel label="Threshold Business Case Unavailable" />}

        {data && (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {data.operating_points.map((point) => {
                const isDeployed = point.name === data.deployed_default.name;
                return (
                  <div
                    key={point.name}
                    className={`relative rounded-xl border p-3 ${POINT_ACCENT[point.name] ?? 'border-soc-border'}`}
                  >
                    {isDeployed && (
                      <span className="absolute -top-2 right-2 inline-flex items-center gap-1 rounded-full bg-soc-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                        <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
                        Deployed
                      </span>
                    )}
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-soc-text">
                      {point.name}
                    </div>
                    <div className="text-[10px] text-soc-muted mb-2">threshold = {point.threshold}</div>

                    <div className="space-y-1 text-xs">
                      <Row label="Precision" value={`${(point.test_set_metrics.precision * 100).toFixed(1)}%`} />
                      <Row label="Recall" value={`${(point.test_set_metrics.recall * 100).toFixed(1)}%`} />
                      <Row label="Monthly friction" value={formatInr(point.monthly_equivalent.friction_cost_inr)} />
                      <Row
                        label="Monthly fraud prevented"
                        value={formatInr(point.monthly_equivalent.fraud_loss_prevented_inr)}
                      />
                      <Row
                        label="Monthly net impact"
                        value={formatInr(point.monthly_equivalent.net_impact_inr)}
                        accent
                      />
                    </div>

                    <p className="mt-2 text-[11px] leading-snug text-soc-muted">{point.merchant_recommendation}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-start gap-1.5 rounded-lg border border-soc-border bg-soc-card px-3 py-2 text-[11px] text-soc-muted">
              <Info className="h-3 w-3 mt-0.5 flex-shrink-0" aria-hidden="true" />
              {data.honest_finding}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-soc-muted">{label}</span>
      <span className={`font-mono font-medium ${accent ? 'text-soc-primary' : 'text-soc-text'}`}>{value}</span>
    </div>
  );
}
