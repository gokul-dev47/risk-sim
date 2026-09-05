import { useEffect, useRef, useState, useCallback } from 'react';
import { Radar, Zap, RotateCcw, Loader2 } from 'lucide-react';
import { getDriftStatus, resetDrift, predict } from '@/services/api';
import { generateAttackWave } from '@/utils/generateAttackWave';
import type { DriftStatusResponse } from '@/types';
import {
  GLASS_CARD_CLASSES,
  GLASS_CARD_HEADER_CLASSES,
  GLASS_CARD_BODY_CLASSES,
  STATUS_COLOR_CLASSES,
  STATUS_LABELS,
  type SocStatusLevel,
} from './socStyles';

const POLL_MS = 3000;
const ATTACK_WAVE_SIZE = 40;
const ATTACK_WAVE_STAGGER_MS = 40;
const PSI_BAR_MAX = 0.5;

type WaveState = 'idle' | 'sending' | 'refetching';

function formatPsi(psi: number): string {
  return psi.toFixed(3);
}

export default function DriftMonitorPanel() {
  const [status, setStatus] = useState<DriftStatusResponse | null>(null);
  const [unavailableError, setUnavailableError] = useState<string | null>(null);
  const [waveState, setWaveState] = useState<WaveState>('idle');
  const [waveProgress, setWaveProgress] = useState<{ sent: number; total: number } | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const isMountedRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    const result = await getDriftStatus();
    if (!isMountedRef.current) return;
    setStatus(result.data);
    setUnavailableError(result.source === 'unavailable' ? result.error : null);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchStatus();
    const intervalId = setInterval(fetchStatus, POLL_MS);
    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [fetchStatus]);

  const handleSimulateAttackWave = useCallback(async () => {
    if (waveState !== 'idle') return;
    setWaveState('sending');
    const wave = generateAttackWave(ATTACK_WAVE_SIZE);
    setWaveProgress({ sent: 0, total: wave.length });

    for (let i = 0; i < wave.length; i += 1) {
      await predict(wave[i]);
      if (isMountedRef.current) setWaveProgress({ sent: i + 1, total: wave.length });
      if (ATTACK_WAVE_STAGGER_MS > 0 && i < wave.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, ATTACK_WAVE_STAGGER_MS));
      }
    }

    if (!isMountedRef.current) return;
    setWaveState('refetching');
    await fetchStatus();
    if (isMountedRef.current) {
      setWaveState('idle');
      setWaveProgress(null);
    }
  }, [waveState, fetchStatus]);

  const handleReset = useCallback(async () => {
    if (isResetting) return;
    setIsResetting(true);
    await resetDrift();
    await fetchStatus();
    if (isMountedRef.current) setIsResetting(false);
  }, [isResetting, fetchStatus]);

  const overall: SocStatusLevel = (status?.overall_status as SocStatusLevel) ?? 'insufficient_data';
  const overallColors = STATUS_COLOR_CLASSES[overall];
  const isWaveBusy = waveState !== 'idle';
  const features = status ? Object.entries(status.per_feature) : [];

  return (
    <div className={GLASS_CARD_CLASSES}>
      <div className={GLASS_CARD_HEADER_CLASSES}>
        <div className="flex items-center gap-2.5">
          <Radar className="h-4 w-4 text-soc-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-soc-text">Drift Monitor</h3>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${overallColors.badge}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${overallColors.dot}`} />
          {STATUS_LABELS[overall]}
        </span>
      </div>

      <div className={GLASS_CARD_BODY_CLASSES}>
        <ul className="space-y-3">
          {features.map(([feature, stats]) => {
            const colors = STATUS_COLOR_CLASSES[stats.status as SocStatusLevel];
            const widthPct = Math.min(100, (stats.psi / PSI_BAR_MAX) * 100);
            return (
              <li key={feature}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-soc-text">{feature.replace(/_/g, ' ')}</span>
                  <span className={`tabular-nums font-mono ${colors.text}`}>{formatPsi(stats.psi)}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-soc-card">
                  <div
                    className={`h-full rounded-full ${colors.bar} transition-all duration-500`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </li>
            );
          })}
          {status === null && !unavailableError && <li className="text-xs text-soc-muted">Loading drift signal…</li>}
          {status === null && unavailableError && (
            <li className="text-xs text-soc-danger">Drift monitor unavailable: {unavailableError}</li>
          )}
          {status?.overall_status === 'insufficient_data' && (
            <li className="text-xs text-soc-muted">
              Waiting for at least 50 scored transactions this session ({status.batch_size}/50) — visit
              Live Transactions or What-If Simulator to generate traffic.
            </li>
          )}
        </ul>

        {status?.adaptation && (
          <div
            className={`mt-4 rounded-lg border px-3 py-2 text-xs ${
              status.adaptation.adaptation_active
                ? 'border-soc-warning/30 bg-soc-warning/10 text-soc-warning'
                : 'border-soc-border bg-white/5 text-soc-muted'
            }`}
          >
            <span className="font-semibold">
              {status.adaptation.adaptation_active ? 'Adaptive posture: tightened' : 'Adaptive posture: base'}
            </span>{' '}
            — ALLOW ≤ {status.adaptation.allow_max_probability.toFixed(2)}, BLOCK ≥{' '}
            {status.adaptation.block_min_probability.toFixed(2)}. {status.adaptation.note} This adjusts the live
            decision thresholds only — it never retrains the model itself.
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSimulateAttackWave}
            disabled={isWaveBusy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-soc-danger/15 px-3 py-1.5 text-xs font-medium text-soc-danger border border-soc-danger/30 hover:bg-soc-danger/25 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {isWaveBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {waveState === 'sending' && waveProgress
              ? `Sending ${waveProgress.sent}/${waveProgress.total}…`
              : waveState === 'refetching'
                ? 'Refreshing drift…'
                : 'Simulate Attack Wave'}
          </button>

          <button
            type="button"
            onClick={handleReset}
            disabled={isResetting || isWaveBusy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-soc-text border border-soc-border hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {isResetting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Reset
          </button>

          {status && (
            <span className="ml-auto text-[11px] text-soc-muted">Window: {status.batch_size} txns</span>
          )}
        </div>
      </div>
    </div>
  );
}
