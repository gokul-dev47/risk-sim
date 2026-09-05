import type { AuditChainEntry, AuditLog, Severity, Decision } from '@/types';

const SEVERITY_BY_DECISION: Record<Decision, Severity> = {
  BLOCK: 'HIGH',
  REVIEW: 'MEDIUM',
  ALLOW: 'LOW',
};

/** Paise (integer, as Razorpay/backend store amounts) -> rupees for display. */
function paiseToInr(amount: unknown): number | undefined {
  if (typeof amount !== 'number') return undefined;
  return amount / 100;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/**
 * Maps one entry from the tamper-evident audit chain (GET /audit/chain,
 * { entries: [...] }) into the AuditLog shape the existing UI renders.
 * Every backend event_type produced by risk_engine/audit_chain.py callers
 * is handled explicitly so nothing silently disappears from the trail.
 *
 * Shared by AuditView.tsx (full trail) and DashboardView.tsx ("Recent
 * Security Incidents" summary) so both show the SAME real backend data,
 * mapped the same way — not two different implementations that could
 * silently drift, and not a fabricated placeholder in either place.
 */
export function mapChainEntry(entry: AuditChainEntry, index: number): AuditLog {
  const c = entry.content ?? {};
  const timestamp = new Date(entry.timestamp * 1000).toISOString();
  const transactionId = asString(c.transaction_id) ?? asString(c.order_id) ?? `evt_${entry.sequence}`;
  const baseId = `${entry.event_type}-${entry.sequence}-${index}`;

  switch (entry.event_type) {
    case 'razorpay_order_created': {
      const amount = paiseToInr(c.amount);
      return {
        id: baseId,
        timestamp,
        severity: 'LOW',
        decision: 'ALLOW',
        explanation: `Razorpay Test Mode order created${amount !== undefined ? ` for ₹${amount.toFixed(2)}` : ''}.`,
        transaction_id: transactionId,
        kind: 'razorpay',
        event_type: entry.event_type,
        razorpay: {
          order_id: asString(c.order_id),
          amount_inr: amount,
          currency: asString(c.currency),
          order_status: 'created',
          test_mode: asString(c.environment) === 'test',
        },
      };
    }

    case 'razorpay_payment_verified': {
      const amount = paiseToInr(c.amount);
      return {
        id: baseId,
        timestamp,
        severity: 'LOW',
        decision: 'ALLOW',
        explanation:
          `Razorpay payment verified server-side (signature valid)` +
          `${amount !== undefined ? ` — ₹${amount.toFixed(2)}` : ''}, ` +
          `payment status: ${asString(c.payment_status) ?? 'unknown'}, order status: ${asString(c.order_status) ?? 'unknown'}.`,
        transaction_id: transactionId,
        kind: 'razorpay',
        event_type: entry.event_type,
        razorpay: {
          order_id: asString(c.order_id),
          payment_id: asString(c.payment_id),
          amount_inr: amount,
          currency: asString(c.currency),
          payment_status: asString(c.payment_status),
          order_status: asString(c.order_status),
          test_mode: asString(c.environment) === 'test',
        },
      };
    }

    case 'razorpay_payment_rejected': {
      return {
        id: baseId,
        timestamp,
        severity: 'HIGH',
        decision: 'BLOCK',
        explanation: `Razorpay payment rejected — ${asString(c.reason) ?? 'signature verification failed'}.`,
        transaction_id: transactionId,
        kind: 'razorpay',
        event_type: entry.event_type,
        razorpay: {
          order_id: asString(c.order_id),
          payment_id: asString(c.payment_id),
          reason: asString(c.reason),
          test_mode: asString(c.environment) === 'test',
        },
      };
    }

    case 'predict': {
      const decision = (asString(c.decision) as Decision) ?? 'ALLOW';
      const riskProbability = typeof c.risk_probability === 'number' ? c.risk_probability : 0;
      const engine = asString(c.engine);
      return {
        id: baseId,
        timestamp,
        severity: SEVERITY_BY_DECISION[decision],
        decision,
        explanation:
          `Risk probability ${(riskProbability * 100).toFixed(1)}%` +
          `${c.is_anomaly ? ' — flagged as a novel pattern by the anomaly detector.' : '.'}` +
          `${engine && engine !== 'ml_fusion' ? ` (engine: ${engine})` : ''}`,
        transaction_id: transactionId,
        kind: 'risk',
        event_type: entry.event_type,
      };
    }

    case 'otp_issued':
      return {
        id: baseId,
        timestamp,
        severity: 'MEDIUM',
        decision: 'REVIEW',
        explanation: `Step-up OTP issued (${asString(c.reason) ?? 'review decision'}).`,
        transaction_id: transactionId,
        kind: 'system',
        event_type: entry.event_type,
      };

    case 'otp_verify_attempt': {
      const finalDecision = (asString(c.final_decision) as Decision | undefined) ?? 'REVIEW';
      return {
        id: baseId,
        timestamp,
        severity: SEVERITY_BY_DECISION[finalDecision],
        decision: finalDecision,
        explanation: `OTP verification ${c.verified ? 'succeeded' : `failed (${asString(c.reason) ?? 'incorrect code'})`}.`,
        transaction_id: transactionId,
        kind: 'system',
        event_type: entry.event_type,
      };
    }

    case 'rate_limit_triggered':
      return {
        id: baseId,
        timestamp,
        severity: 'MEDIUM',
        decision: 'BLOCK',
        explanation: `Rate limit triggered on ${asString(c.endpoint) ?? 'an endpoint'} — retry after ${
          typeof c.retry_after_seconds === 'number' ? c.retry_after_seconds.toFixed(1) : '?'
        }s.`,
        transaction_id: transactionId,
        kind: 'system',
        event_type: entry.event_type,
      };

    default:
      return {
        id: baseId,
        timestamp,
        severity: 'LOW',
        decision: 'ALLOW',
        explanation: `${entry.event_type} event.`,
        transaction_id: transactionId,
        kind: 'system',
        event_type: entry.event_type,
      };
  }
}
