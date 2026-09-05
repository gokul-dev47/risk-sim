import { ShieldX, AlertTriangle, CheckCircle, Clock, CreditCard } from 'lucide-react';
import type { AuditLog, Severity, Decision } from '@/types';

const severityConfig: Record<Severity, { icon: typeof ShieldX; color: string; bg: string; border: string; label: string }> = {
  HIGH: { icon: ShieldX, color: 'text-soc-danger', bg: 'bg-soc-danger/10', border: 'border-soc-danger/30', label: 'HIGH RISK' },
  MEDIUM: { icon: AlertTriangle, color: 'text-soc-warning', bg: 'bg-soc-warning/10', border: 'border-soc-warning/30', label: 'MEDIUM RISK' },
  LOW: { icon: CheckCircle, color: 'text-soc-success', bg: 'bg-soc-success/10', border: 'border-soc-success/30', label: 'LOW RISK' },
};

const decisionColor: Record<Decision, string> = {
  BLOCK: 'text-soc-danger',
  REVIEW: 'text-soc-warning',
  ALLOW: 'text-soc-success',
};

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function formatDate(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function truncateId(id: string, keep = 10): string {
  return id.length > keep + 3 ? `${id.slice(0, keep)}…` : id;
}

export default function AuditTrail({ logs }: { logs: AuditLog[] }) {
  return (
    <div className="space-y-3">
      {logs.map((log, i) => {
        const cfg = severityConfig[log.severity];
        const isRazorpay = log.kind === 'razorpay';
        const Icon = isRazorpay ? CreditCard : cfg.icon;
        const rp = log.razorpay;
        return (
          <div
            key={log.id}
            className={`glass glass-hover rounded-2xl p-4 border-l-2 ${
              isRazorpay ? 'border-l-indigo-400/60' : cfg.border.replace('border-', 'border-l-')
            } animate-slide-up`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                  isRazorpay ? 'bg-indigo-400/10 border-indigo-400/30' : `${cfg.bg} ${cfg.border}`
                }`}
              >
                <Icon className={`w-5 h-5 ${isRazorpay ? 'text-indigo-300' : cfg.color}`} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap mb-1.5">
                  {isRazorpay ? (
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                      RAZORPAY
                    </span>
                  ) : (
                    <span className={`text-xs font-bold uppercase tracking-wider ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  )}
                  <span className={`text-xs font-semibold ${decisionColor[log.decision]}`}>
                    · {log.decision}
                  </span>
                  {rp?.test_mode && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-300 border border-amber-400/30">
                      Test Mode
                    </span>
                  )}
                  <span className="text-xs font-mono text-soc-secondary">{log.transaction_id}</span>
                </div>

                <p className="text-sm text-slate-300 leading-relaxed">{log.explanation}</p>

                {isRazorpay && rp && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] font-mono text-soc-muted">
                    {rp.order_id && <span>order: {truncateId(rp.order_id)}</span>}
                    {rp.payment_id && <span>payment: {truncateId(rp.payment_id)}</span>}
                    {rp.amount_inr !== undefined && (
                      <span>
                        amount: ₹{rp.amount_inr.toFixed(2)} {rp.currency ?? ''}
                      </span>
                    )}
                    {rp.payment_status && <span>payment status: {rp.payment_status}</span>}
                    {rp.order_status && <span>order status: {rp.order_status}</span>}
                  </div>
                )}

                <div className="flex items-center gap-1.5 mt-2 text-[11px] text-soc-muted">
                  <Clock className="w-3 h-3" />
                  <span className="font-mono">{formatDate(log.timestamp)} · {formatTime(log.timestamp)} IST</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
