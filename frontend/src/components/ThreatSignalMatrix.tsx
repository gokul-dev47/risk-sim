import { threatSignalMatrix } from '@/data/mockData';

const levels = ['low', 'medium', 'high', 'critical'] as const;
type Level = typeof levels[number];

const levelLabels: Record<Level, string> = {
  low: 'LOW',
  medium: 'MEDIUM',
  high: 'HIGH',
  critical: 'CRITICAL',
};

const levelColors: Record<Level, string> = {
  low: '#22C55E',
  medium: '#F59E0B',
  high: '#FF4D6D',
  critical: '#FF4D6D',
};

function getMaxForRow(row: { low: number; medium: number; high: number; critical: number }): number {
  return Math.max(row.low, row.medium, row.high, row.critical);
}

function getDominantLevel(row: { low: number; medium: number; high: number; critical: number }): Level {
  const entries: [Level, number][] = [
    ['low', row.low],
    ['medium', row.medium],
    ['high', row.high],
    ['critical', row.critical],
  ];
  return entries.reduce((max, cur) => (cur[1] > max[1] ? cur : max))[0];
}

function SignalRow({ row, index }: { row: typeof threatSignalMatrix[0]; index: number }) {
  const maxVal = getMaxForRow(row);
  const dominant = getDominantLevel(row);
  const dominantColor = levelColors[dominant];
  const dominantPct = maxVal > 0 ? (row[dominant] / maxVal) * 100 : 0;

  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center gap-3 py-4 border-t border-soc-border/30 animate-slide-up"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Signal name */}
      <div className="sm:w-48 shrink-0">
        <p className="text-sm text-soc-text font-medium">{row.signal}</p>
      </div>

      {/* Intensity bar */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="flex-1 h-2 rounded-full bg-soc-card overflow-hidden">
            <div
              className="h-full rounded-full animate-grow-bar transition-all duration-700"
              style={{
                width: `${dominantPct}%`,
                backgroundColor: dominantColor,
                boxShadow: dominant === 'critical' || dominant === 'high' ? `0 0 8px ${dominantColor}80` : 'none',
              }}
            />
          </div>
        </div>
        {/* Mini bars for each level */}
        <div className="flex items-center gap-3">
          {levels.map(l => (
            <div key={l} className="flex items-center gap-1.5">
              <div className="w-10 h-1 rounded-full bg-soc-card overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${maxVal > 0 ? (row[l] / maxVal) * 100 : 0}%`,
                    backgroundColor: levelColors[l],
                    opacity: row[l] > 0 ? 0.6 : 0.15,
                  }}
                />
              </div>
              <span className="text-[9px] font-mono text-soc-muted">{row[l]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Severity label */}
      <div className="sm:w-24 shrink-0 flex sm:justify-end">
        <span
          className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border"
          style={{
            color: dominantColor,
            borderColor: `${dominantColor}40`,
            backgroundColor: `${dominantColor}15`,
          }}
        >
          {levelLabels[dominant]}
        </span>
      </div>
    </div>
  );
}

export default function ThreatSignalMatrix() {
  return (
    <div className="glass glass-hover rounded-2xl p-6">
      <div className="mb-2">
        <h3 className="text-base font-semibold text-soc-text font-sans">Risk Signal Analysis</h3>
        <p className="text-xs text-soc-muted mt-1">ML signal intensity across threat severity levels</p>
      </div>

      {/* Column headers */}
      <div className="hidden sm:flex items-center gap-3 py-2 border-b border-soc-border/30">
        <div className="sm:w-48 shrink-0">
          <span className="text-[10px] font-semibold text-soc-muted uppercase tracking-[0.1em]">Signal</span>
        </div>
        <div className="flex-1">
          <span className="text-[10px] font-semibold text-soc-muted uppercase tracking-[0.1em]">Intensity Distribution</span>
        </div>
        <div className="sm:w-24 shrink-0 text-right">
          <span className="text-[10px] font-semibold text-soc-muted uppercase tracking-[0.1em]">Severity</span>
        </div>
      </div>

      {threatSignalMatrix.map((row, i) => (
        <SignalRow key={i} row={row} index={i} />
      ))}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-soc-border/30">
        <span className="text-[10px] text-soc-muted uppercase tracking-wider">Severity</span>
        {levels.map(l => (
          <div key={l} className="flex items-center gap-2">
            <span className="w-4 h-4 rounded" style={{ backgroundColor: `${levelColors[l]}30` }} />
            <span className="text-[10px] text-soc-muted">{levelLabels[l]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
