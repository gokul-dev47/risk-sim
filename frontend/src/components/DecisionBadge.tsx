import { CheckCircle, AlertTriangle, ShieldX } from 'lucide-react';
import type { Decision } from '@/types';

interface DecisionBadgeProps {
  decision: Decision;
}

const config: Record<Decision, { bg: string; text: string; border: string; icon: typeof CheckCircle; glow: string }> = {
  ALLOW: {
    bg: 'bg-soc-success/12',
    text: 'text-soc-success',
    border: 'border-soc-success/25',
    icon: CheckCircle,
    glow: 'shadow-[0_0_12px_-2px_rgba(34,197,94,0.3)]',
  },
  REVIEW: {
    bg: 'bg-soc-warning/12',
    text: 'text-soc-warning',
    border: 'border-soc-warning/25',
    icon: AlertTriangle,
    glow: 'shadow-[0_0_12px_-2px_rgba(245,158,11,0.3)]',
  },
  BLOCK: {
    bg: 'bg-soc-danger/12',
    text: 'text-soc-danger',
    border: 'border-soc-danger/25',
    icon: ShieldX,
    glow: 'shadow-[0_0_12px_-2px_rgba(255,77,109,0.3)]',
  },
};

export default function DecisionBadge({ decision }: DecisionBadgeProps) {
  const { bg, text, border, icon: Icon, glow } = config[decision];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${bg} ${text} ${border} ${glow}`}>
      <Icon className="w-3.5 h-3.5" />
      {decision}
    </span>
  );
}
