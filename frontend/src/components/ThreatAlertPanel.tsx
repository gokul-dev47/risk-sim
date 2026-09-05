import { AlertTriangle, Zap, MapPin, CreditCard, IndianRupee, Clock } from 'lucide-react';

const indicators = [
  { icon: Zap, label: 'Multiple rapid transactions' },
  { icon: IndianRupee, label: 'Small transaction amounts' },
  { icon: CreditCard, label: 'High CVV failure rate' },
  { icon: MapPin, label: 'Country/billing mismatch' },
];

export default function ThreatAlertPanel() {
  return (
    <div className="glass rounded-2xl p-6 relative overflow-hidden border-soc-danger/20 animate-glow-pulse">
      {/* Red glow background */}
      <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full bg-soc-danger/10 blur-3xl" />
      <div className="absolute -bottom-16 -left-16 w-40 h-40 rounded-full bg-soc-danger/5 blur-3xl" />

      <div className="relative">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-xl bg-soc-danger/15 border border-soc-danger/30 flex items-center justify-center shadow-[0_0_20px_-4px_rgba(255,77,109,0.4)]">
            <AlertTriangle className="w-6 h-6 text-soc-danger" />
          </div>
          <div>
            <h3 className="text-base font-bold text-soc-danger font-sans tracking-wide">HIGH-RISK ACTIVITY DETECTED</h3>
            <p className="text-xs text-soc-muted mt-0.5">Card Testing Pattern Identified</p>
          </div>
        </div>

        {/* Indicators */}
        <div className="space-y-2.5 mb-5">
          {indicators.map((ind, i) => {
            const Icon = ind.icon;
            return (
              <div
                key={i}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-soc-danger/[0.04] border border-soc-danger/10"
              >
                <Icon className="w-4 h-4 text-soc-danger shrink-0" />
                <span className="text-xs text-slate-300">{ind.label}</span>
              </div>
            );
          })}
        </div>

        {/* Risk level */}
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-soc-danger/8 border border-soc-danger/20 mb-3">
          <span className="text-xs font-medium text-soc-muted uppercase tracking-wider">Risk Level</span>
          <span className="text-sm font-bold text-soc-danger tracking-wide flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-soc-danger animate-pulse" />
            CRITICAL
          </span>
        </div>

        {/* Timestamp */}
        <div className="flex items-center gap-1.5 text-[11px] text-soc-muted">
          <Clock className="w-3 h-3" />
          <span className="font-mono">Detected: 30 Aug 2026 · 09:42:11 IST</span>
        </div>
      </div>
    </div>
  );
}
