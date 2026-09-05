import { ShieldOff } from 'lucide-react';

interface UnavailablePanelProps {
  label?: string;
  error?: string | null;
  heightClassName?: string;
}

/**
 * Shown whenever a backend-backed report/metric endpoint could not be
 * reached. Deliberately renders NO numbers, charts, or placeholder data —
 * only this explicit state — so the UI never gives the impression that a
 * real backend figure is being displayed when it is not.
 */
export default function UnavailablePanel({
  label = 'Backend Unavailable',
  error,
  heightClassName = 'h-40',
}: UnavailablePanelProps) {
  return (
    <div className={`flex ${heightClassName} flex-col items-center justify-center gap-2 px-4 text-center`}>
      <ShieldOff className="h-5 w-5 text-soc-danger" aria-hidden="true" />
      <span className="text-sm font-semibold text-soc-danger">{label}</span>
      {error && <span className="max-w-xs text-[11px] text-soc-muted">{error}</span>}
    </div>
  );
}
