import { useState } from 'react';
import { ShieldQuestion, CheckCircle2, XCircle, Info } from 'lucide-react';
import { confirmOtp } from '@/services/api';
import type { StepUpInfo, Decision } from '@/types';

interface StepUpVerificationProps {
  stepUp: StepUpInfo;
  onResolved: (finalDecision: Decision) => void;
}

export default function StepUpVerification({ stepUp, onResolved }: StepUpVerificationProps) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<'pending' | 'success' | 'failed'>('pending');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (isSubmitting || status !== 'pending') return;
    setIsSubmitting(true);
    const result = await confirmOtp(stepUp.verification_id, code);

    if (result.source === 'unavailable') {
      setMessage(`Risk engine unavailable — could not verify: ${result.error}`);
      setIsSubmitting(false);
      return;
    }

    const { data } = result;
    setMessage(data.message);

    if (data.verified) {
      setStatus('success');
      onResolved('ALLOW');
    } else if (data.final_decision === 'BLOCK') {
      setStatus('failed');
      onResolved('BLOCK');
    }
    setIsSubmitting(false);
  }

  return (
    <div className="rounded-lg border border-soc-warning/30 bg-soc-warning/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <ShieldQuestion className="h-4 w-4 mt-0.5 text-soc-warning flex-shrink-0" aria-hidden="true" />
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-soc-warning">Step-Up Verification Required</h4>
          <p className="mt-1 text-xs text-soc-muted flex items-start gap-1.5">
            <Info className="h-3 w-3 mt-0.5 flex-shrink-0" aria-hidden="true" />
            {stepUp.notice}
          </p>
        </div>
      </div>

      {status === 'pending' && (
        <>
          <div className="rounded border border-soc-border bg-soc-card px-3 py-2 text-xs text-soc-muted">
            Demo code (would be sent via SMS in production):{' '}
            <span className="font-mono font-semibold text-soc-text tracking-widest">{stepUp.demo_otp}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter 6-digit code"
              className="w-40 rounded-lg border border-soc-border bg-soc-card px-3 py-1.5 text-sm text-soc-text font-mono tracking-widest focus:border-soc-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || code.length !== 6}
              className="rounded-lg bg-soc-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-soc-primary/90 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              {isSubmitting ? 'Verifying…' : 'Verify'}
            </button>
          </div>
          {message && <p className="text-xs text-soc-danger">{message}</p>}
        </>
      )}

      {status === 'success' && (
        <div className="flex items-center gap-2 text-sm text-soc-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Verified — decision resolved to ALLOW.
        </div>
      )}

      {status === 'failed' && (
        <div className="flex items-center gap-2 text-sm text-soc-danger">
          <XCircle className="h-4 w-4" aria-hidden="true" />
          {message ?? 'Verification failed — decision escalated to BLOCK.'}
        </div>
      )}
    </div>
  );
}
