import { useState } from 'react';
import { PlayCircle, RotateCcw, ChevronRight, AlertTriangle } from 'lucide-react';

import { demoScenario, ATTACK_STEP_INDEX, REPEAT_COUNT_FOR_ATTACK_STEP } from '@/data/demoScenario';
import { predict, getDriftStatus, resetDrift } from '@/services/api';
import type { PredictResponse, DriftStatusResponse } from '@/types';
import DecisionGauge from '@/components/DecisionGauge';
import TopFactorsList from '@/components/TopFactorsList';
import LiveBadge from '@/components/LiveBadge';

const STAGES = ['DETECTED', 'ANALYZED', 'ESCALATED', 'DRIFT IDENTIFIED', 'POLICY REVIEW RECOMMENDED'] as const;

const DECISION_STYLES: Record<string, string> = {
  ALLOW: 'bg-soc-success/15 text-soc-success border-soc-success/30',
  REVIEW: 'bg-soc-warning/15 text-soc-warning border-soc-warning/30',
  BLOCK: 'bg-soc-danger/15 text-soc-danger border-soc-danger/30',
};

const DRIFT_STYLES: Record<string, string> = {
  stable: 'bg-soc-success/15 text-soc-success border-soc-success/30',
  watch: 'bg-soc-warning/15 text-soc-warning border-soc-warning/30',
  retrain_recommended: 'bg-soc-danger/15 text-soc-danger border-soc-danger/30',
};

export default function DemoScenarioView() {
  const [stepIndex, setStepIndex] = useState(-1); // -1 = not started
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [resultSource, setResultSource] = useState<'backend' | 'unavailable' | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [attackProgress, setAttackProgress] = useState<{ sent: number; total: number } | null>(null);
  const [driftStatus, setDriftStatus] = useState<DriftStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const started = stepIndex >= 0;
  const finished = stepIndex === demoScenario.length - 1 && driftStatus !== null;
  const currentStep = started ? demoScenario[stepIndex] : null;

  const currentStageIndex = !started ? -1 : driftStatus !== null ? 4 : Math.min(stepIndex, 3);

  async function runStep(index: number) {
    setLoading(true);
    setError(null);
    setDriftStatus(null);
    setAttackProgress(null);

    try {
      const step = demoScenario[index];

      if (index === ATTACK_STEP_INDEX) {
        // Fire the same attack fingerprint REPEAT_COUNT_FOR_ATTACK_STEP
        // times so the drift monitor has enough repeated-pattern volume
        // to visibly react. We keep the *last* response to display, since
        // all 40 calls share the same features/decision.
        let last: { data: PredictResponse; source: 'backend' } | { data: null; source: 'unavailable'; error: string } | null = null;
        for (let i = 0; i < REPEAT_COUNT_FOR_ATTACK_STEP; i += 1) {
          last = await predict(step.features);
          setAttackProgress({ sent: i + 1, total: REPEAT_COUNT_FOR_ATTACK_STEP });
        }
        if (last) {
          setResult(last.data);
          setResultSource(last.source);
          setResultError(last.source === 'unavailable' ? last.error : null);
        }

        // Payoff moment: fetch the real, live drift status right after
        // flooding the model with the repeated attack pattern.
        const drift = await getDriftStatus();
        setDriftStatus(drift.data);
      } else {
        const res = await predict(step.features);
        setResult(res.data);
        setResultSource(res.source);
        setResultError(res.source === 'unavailable' ? res.error : null);
      }

      setStepIndex(index);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong running this step.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePrimaryAction() {
    if (!started) {
      await runStep(0);
      return;
    }
    if (stepIndex < demoScenario.length - 1) {
      await runStep(stepIndex + 1);
    }
  }

  async function handleReset() {
    setLoading(true);
    setError(null);
    try {
      await resetDrift();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset drift state.');
    } finally {
      setStepIndex(-1);
      setResult(null);
      setResultSource(null);
      setAttackProgress(null);
      setDriftStatus(null);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2">
        <PlayCircle className="w-4 h-4 text-soc-primary" />
        <h3 className="text-base font-semibold text-soc-text font-sans">Demo Scenario</h3>
        <span className="text-xs text-soc-muted">
          — a fixed, four-step walkthrough, same inputs every time, verified against the real model
        </span>
      </div>

      {/* Step tracker */}
      <ol className="flex flex-wrap items-center gap-2">
        {STAGES.map((stage, i) => {
          const isActive = i === currentStageIndex;
          const isPast = i < currentStageIndex;
          return (
            <li key={stage} className="flex items-center gap-2">
              <span
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'border-soc-primary bg-soc-primary text-white'
                    : isPast
                      ? 'border-soc-border bg-soc-card text-soc-muted'
                      : 'border-soc-border/50 text-soc-muted/60'
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                    isActive ? 'bg-white text-soc-primary' : 'bg-soc-card text-soc-muted'
                  }`}
                >
                  {i + 1}
                </span>
                {stage}
              </span>
              {i < STAGES.length - 1 && <ChevronRight className="h-4 w-4 text-soc-muted/40" />}
            </li>
          );
        })}
      </ol>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handlePrimaryAction}
          disabled={loading || finished}
          className="inline-flex items-center gap-2 rounded-lg bg-soc-primary px-4 py-2 text-sm font-medium text-white hover:bg-soc-primary/90 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          <PlayCircle className="h-4 w-4" aria-hidden="true" />
          {!started ? 'Run Demo Scenario' : finished ? 'Scenario Complete' : 'Next Step'}
        </button>

        <button
          type="button"
          onClick={handleReset}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-soc-border px-4 py-2 text-sm font-medium text-soc-text hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Reset Demo
        </button>

        {started && !finished && (
          <span className="text-sm text-soc-muted">
            Step {stepIndex + 1} of {demoScenario.length}
          </span>
        )}

        {resultSource && <LiveBadge source={resultSource} className="ml-auto" />}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-soc-danger/30 bg-soc-danger/10 px-4 py-3 text-sm text-soc-danger">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Attack-volume progress (step 4 only) */}
      {attackProgress && attackProgress.sent < attackProgress.total && (
        <div className="text-sm text-soc-muted">
          Sending attack pattern {attackProgress.sent}/{attackProgress.total}…
        </div>
      )}

      {/* Current step detail */}
      {currentStep && (
        <div className="glass rounded-2xl p-5 space-y-4">
          <div>
            <h4 className="font-semibold text-soc-text">{currentStep.label}</h4>
            <p className="text-sm text-soc-muted mt-1">{currentStep.description}</p>
          </div>

          {!result && resultSource === 'unavailable' && (
            <div className="flex items-center gap-2 rounded-lg border border-soc-danger/30 bg-soc-danger/10 px-3 py-2.5 text-sm text-soc-danger">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>
                Risk engine unavailable{resultError ? `: ${resultError}` : ''} — no fabricated score is shown.
              </span>
            </div>
          )}

          {result && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${
                    DECISION_STYLES[result.decision] ?? 'bg-soc-card text-soc-text border-soc-border'
                  }`}
                >
                  {result.decision}
                </span>

                <DecisionGauge decision={result.decision} value={result.risk_probability} />

                {result.is_anomaly && (
                  <div className="flex items-center gap-2 text-sm text-soc-warning">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    Anomaly detector fired on this transaction
                  </div>
                )}

                {result.explanation?.summary && (
                  <p className="text-sm text-soc-muted">{result.explanation.summary}</p>
                )}
              </div>

              <div>
                <TopFactorsList factors={result.explanation?.top_factors ?? []} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Drift payoff */}
      {driftStatus && (
        <div className="glass rounded-2xl p-5 space-y-3">
          <h4 className="font-semibold text-soc-text">Drift Monitor — Live Result</h4>
          <p className="text-sm text-soc-muted">
            After flooding the model with {REPEAT_COUNT_FOR_ATTACK_STEP} copies of the coordinated-attack
            fingerprint, here's what the drift monitor now reports:
          </p>
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${
              DRIFT_STYLES[driftStatus.overall_status] ?? 'bg-soc-card text-soc-text border-soc-border'
            }`}
          >
            {driftStatus.overall_status.replace(/_/g, ' ')}
          </span>
          <p className="text-xs text-soc-muted">
            The system recommends action here — it does not retrain automatically.
          </p>
        </div>
      )}
    </div>
  );
}
