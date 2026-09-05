import { Brain, CheckCircle2, Zap, Database, Cpu } from 'lucide-react';

export default function ModelInsightPanel() {
  return (
    <div className="glass glass-hover rounded-2xl p-6 relative overflow-hidden border-soc-primary/20">
      <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full bg-soc-primary/10 blur-3xl" />
      <div className="absolute -bottom-16 -left-16 w-40 h-40 rounded-full bg-soc-secondary/5 blur-3xl" />

      <div className="relative">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-soc-primary to-soc-secondary flex items-center justify-center shadow-lg shadow-soc-primary/20">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-soc-text font-sans">THREAT INTELLIGENCE INSIGHT</h3>
              <p className="text-xs text-soc-muted">Model-driven interpretation of synthetic risk patterns</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-soc-success/10 border border-soc-success/25">
            <span className="w-2 h-2 rounded-full bg-soc-success animate-pulse-dot" />
            <span className="text-[10px] font-semibold text-soc-success uppercase tracking-wider">Confidence: High</span>
          </div>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed mb-5 max-w-4xl">
          Current synthetic data indicates elevated card-testing behavior driven primarily by repeated low-value transactions, rapid transaction velocity, and abnormal CVV failure patterns.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-soc-card border border-soc-border">
            <Zap className="w-4 h-4 text-soc-primary shrink-0" />
            <div><p className="text-[10px] text-soc-muted uppercase tracking-wider">Primary Signal</p><p className="text-xs font-semibold text-soc-text mt-0.5">Small Amount Pattern</p></div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-soc-card border border-soc-border">
            <Zap className="w-4 h-4 text-soc-danger shrink-0" />
            <div><p className="text-[10px] text-soc-muted uppercase tracking-wider">Secondary Signal</p><p className="text-xs font-semibold text-soc-text mt-0.5">CVV Failure Rate</p></div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-soc-card border border-soc-border">
            <Cpu className="w-4 h-4 text-soc-secondary shrink-0" />
            <div><p className="text-[10px] text-soc-muted uppercase tracking-wider">Model</p><p className="text-xs font-semibold text-soc-text mt-0.5">Random Forest</p></div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-soc-card border border-soc-border">
            <Database className="w-4 h-4 text-soc-warning shrink-0" />
            <div><p className="text-[10px] text-soc-muted uppercase tracking-wider">Data Source</p><p className="text-xs font-semibold text-soc-text mt-0.5">Synthetic / Demo Data</p></div>
          </div>
        </div>

        <div className="sm:hidden flex items-center gap-2 px-3 py-2 rounded-lg bg-soc-success/10 border border-soc-success/25 w-fit">
          <CheckCircle2 className="w-3.5 h-3.5 text-soc-success" />
          <span className="text-[10px] font-semibold text-soc-success uppercase tracking-wider">Confidence: High</span>
        </div>
      </div>
    </div>
  );
}
