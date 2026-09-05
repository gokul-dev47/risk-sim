import { Radio, AlertTriangle, ShieldOff } from 'lucide-react';

// 'backend' = real data from the API. 'mock' = disclosed, static
// illustrative fallback used ONLY for aggregate/historical dashboard
// reports (e.g. model metrics, cost curves) when the backend is
// unreachable -- never for a live, per-transaction fraud decision.
// 'unavailable' = no data at all; used specifically by the live
// prediction path (What-If Simulator, Demo Scenarios, Jury Injection)
// when the backend can't be reached, so the UI shows an explicit
// "risk engine unavailable" state instead of rendering any number.
export type DataSource = 'backend' | 'mock' | 'unavailable';

interface LiveBadgeProps {
  source: DataSource;
  className?: string;
}

export default function LiveBadge({ source, className = '' }: LiveBadgeProps) {
  const isLive = source === 'backend';
  const isUnavailable = source === 'unavailable';

  const styles = isLive
    ? 'border-soc-success/30 bg-soc-success/15 text-soc-success'
    : isUnavailable
      ? 'border-soc-danger/30 bg-soc-danger/15 text-soc-danger'
      : 'border-soc-warning/30 bg-soc-warning/15 text-soc-warning';

  const label = isLive ? 'Live' : isUnavailable ? 'Risk Engine Unavailable' : 'Mock Fallback';
  const title = isLive
    ? 'Live data from the backend'
    : isUnavailable
      ? 'Backend risk engine unreachable — no score was generated. The browser never fabricates a fraud decision.'
      : 'Backend unreachable — showing a disclosed static illustrative fallback (not a live per-transaction score)';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles} ${className}`}
      title={title}
    >
      {isLive ? (
        <Radio className="h-2.5 w-2.5" aria-hidden="true" />
      ) : isUnavailable ? (
        <ShieldOff className="h-2.5 w-2.5" aria-hidden="true" />
      ) : (
        <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}
