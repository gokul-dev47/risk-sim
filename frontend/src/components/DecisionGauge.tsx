import type { Decision } from '@/types';

interface DecisionGaugeProps {
  value: number;
  decision: Decision;
}

const DECISION_COLORS: Record<Decision, string> = {
  ALLOW: '#22C55E',
  REVIEW: '#F59E0B',
  BLOCK: '#FF4D6D',
};

const SIZE = 140;
const STROKE = 12;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function DecisionGauge({ value, decision }: DecisionGaugeProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const offset = CIRCUMFERENCE * (1 - clamped);
  const color = DECISION_COLORS[decision];

  return (
    <div className="relative flex items-center justify-center" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="-rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="rgba(51,149,255,0.08)" strokeWidth={STROKE} />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 400ms ease-out, stroke 300ms ease-out', filter: `drop-shadow(0 0 6px ${color}80)` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold tabular-nums text-soc-text font-mono">{(clamped * 100).toFixed(1)}%</span>
        <span className="text-[10px] uppercase tracking-wide text-soc-muted">Risk</span>
      </div>
    </div>
  );
}
