import type { ExplanationFactor } from '@/types';

interface TopFactorsListProps {
  factors: ExplanationFactor[];
}

export default function TopFactorsList({ factors }: TopFactorsListProps) {
  if (factors.length === 0) {
    return <p className="text-xs text-soc-muted">No contributing factors returned.</p>;
  }

  const maxAbs = Math.max(...factors.map((f) => Math.abs(f.shap_contribution)), 0.0001);

  return (
    <ul className="space-y-2">
      {factors.map((factor) => {
        const isIncrease = factor.direction === 'increased';
        const widthPct = (Math.abs(factor.shap_contribution) / maxAbs) * 100;
        return (
          <li key={factor.feature}>
            <div className="mb-0.5 flex items-center justify-between text-xs">
              <span className="text-soc-text">{factor.label}</span>
              <span className={isIncrease ? 'text-soc-danger' : 'text-soc-success'}>
                {isIncrease ? '+' : ''}
                {factor.shap_contribution.toFixed(3)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-soc-card">
              <div
                className={`h-full rounded-full transition-all duration-300 ${isIncrease ? 'bg-soc-danger' : 'bg-soc-success'}`}
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
