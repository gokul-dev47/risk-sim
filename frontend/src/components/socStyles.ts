export const GLASS_CARD_CLASSES = 'glass rounded-2xl';
export const GLASS_CARD_HEADER_CLASSES =
  'flex items-center justify-between border-b border-soc-border px-5 py-4';
export const GLASS_CARD_BODY_CLASSES = 'px-5 py-4';

export type SocStatusLevel = 'stable' | 'watch' | 'retrain_recommended' | 'insufficient_data';

export const STATUS_COLOR_CLASSES: Record<
  SocStatusLevel,
  { badge: string; bar: string; text: string; dot: string }
> = {
  stable: {
    badge: 'bg-soc-success/15 text-soc-success border border-soc-success/30',
    bar: 'bg-soc-success',
    text: 'text-soc-success',
    dot: 'bg-soc-success',
  },
  watch: {
    badge: 'bg-soc-warning/15 text-soc-warning border border-soc-warning/30',
    bar: 'bg-soc-warning',
    text: 'text-soc-warning',
    dot: 'bg-soc-warning',
  },
  retrain_recommended: {
    badge: 'bg-soc-danger/15 text-soc-danger border border-soc-danger/30',
    bar: 'bg-soc-danger',
    text: 'text-soc-danger',
    dot: 'bg-soc-danger',
  },
  insufficient_data: {
    badge: 'bg-soc-muted/15 text-soc-muted border border-soc-muted/30',
    bar: 'bg-soc-muted',
    text: 'text-soc-muted',
    dot: 'bg-soc-muted',
  },
};

export const STATUS_LABELS: Record<SocStatusLevel, string> = {
  stable: 'Stable',
  watch: 'Watch',
  retrain_recommended: 'Retrain Recommended',
  insufficient_data: 'Insufficient Data',
};
