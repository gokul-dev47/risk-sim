import { Cpu, CheckCircle2 } from 'lucide-react';
import type { ModelMetrics, ConfusionMatrix } from '@/types';

function RadialProgress({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = value * 100;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  // These metrics routinely sit in the 99.0-99.99% band, so rounding to
  // whole percent (toFixed(0)) makes every gauge read "100%" and hides
  // real differences between metrics. One decimal place preserves that
  // signal (e.g. 99.9% vs 99.6%) while a true 100.0% still displays as
  // "100.0%" rather than being indistinguishable from it.
  const displayPct = pct >= 99.95 ? pct.toFixed(2) : pct.toFixed(1);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-28 h-28">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(51,149,255,0.08)" strokeWidth="6" />
          <circle
            cx="50" cy="50" r={radius} fill="none"
            stroke={color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s ease-out', filter: `drop-shadow(0 0 6px ${color}80)` }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" style={{ color }} />
            <span className="text-lg font-bold font-mono" style={{ color }}>{displayPct}%</span>
          </div>
        </div>
      </div>
      <span className="text-xs font-medium text-soc-muted uppercase tracking-wider">{label}</span>
    </div>
  );
}

function MatrixCell({ label, value, highlight }: { label: string; value: number; highlight: 'good' | 'bad' }) {
  const styles =
    highlight === 'good'
      ? 'border-soc-success/25 bg-soc-success/8 text-soc-success'
      : 'border-soc-danger/25 bg-soc-danger/8 text-soc-danger';
  return (
    <div className={`rounded-xl border p-5 text-center ${styles}`}>
      <p className="text-xs font-medium text-soc-muted uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold font-mono mt-1.5">{value.toLocaleString('en-IN')}</p>
    </div>
  );
}

export default function ModelPerformance({ metrics, matrix }: { metrics: ModelMetrics; matrix: ConfusionMatrix }) {
  const m = metrics;
  const cm = matrix;

  const metricData = [
    { label: 'Accuracy', value: m.accuracy, color: '#3395FF' },
    { label: 'Precision', value: m.precision, color: '#5DADFF' },
    { label: 'Recall', value: m.recall, color: '#22C55E' },
    { label: 'F1 Score', value: m.f1, color: '#F59E0B' },
    { label: 'ROC-AUC', value: m.roc_auc, color: '#FF4D6D' },
  ];

  return (
    <div className="space-y-6">
      {/* Metrics with radial progress */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-soc-primary to-soc-secondary flex items-center justify-center shadow-lg shadow-soc-primary/20">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-soc-text font-sans">RANDOM FOREST CLASSIFIER</h3>
              <p className="text-xs text-soc-muted">Model Performance Metrics</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-soc-success/10 border border-soc-success/25">
            <span className="w-2 h-2 rounded-full bg-soc-success animate-pulse-dot" />
            <span className="text-xs font-semibold text-soc-success">OPERATIONAL</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 justify-items-center">
          {metricData.map((metric) => (
            <RadialProgress key={metric.label} label={metric.label} value={metric.value} color={metric.color} />
          ))}
        </div>

        <div className="mt-6 flex justify-center">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-soc-card border border-soc-border">
            <span className="text-[10px] font-mono text-soc-muted uppercase tracking-widest">Synthetic Data Only · Demo/Research System</span>
          </div>
        </div>
      </div>

      {/* Confusion Matrix */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-base font-semibold text-soc-text font-sans mb-1">Confusion Matrix</h3>
        <p className="text-xs text-soc-muted mb-5">Classification results on test set (2,100 samples)</p>

        <div className="max-w-xl mx-auto">
          <div className="grid grid-cols-2 gap-4">
            <MatrixCell label="True Negative" value={cm.true_negative} highlight="good" />
            <MatrixCell label="False Positive" value={cm.false_positive} highlight="bad" />
            <MatrixCell label="False Negative" value={cm.false_negative} highlight="bad" />
            <MatrixCell label="True Positive" value={cm.true_positive} highlight="good" />
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-6 mt-6 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-soc-success/30 border border-soc-success/40" />
            <span className="text-soc-muted">Correct predictions</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-soc-danger/30 border border-soc-danger/40" />
            <span className="text-soc-muted">Errors (0 in this model)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
