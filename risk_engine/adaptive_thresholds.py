"""Drift-triggered decision-threshold calibration.

This is the concrete, honest answer to "how is this adaptive?": the
system does NOT retrain the Random Forest online, and it does NOT
silently relabel data and re-fit anything while running. What it DOES do
is adjust its own operating posture — the ALLOW/REVIEW/BLOCK probability
cut points used by `decide()` in backend/main.py — in response to the
same PSI drift signal already computed by `risk_engine/drift_monitor.py`.

The rule is small, deterministic, bounded, and fully logged:

  drift overall_status == "stable"             -> base thresholds (no change)
  drift overall_status == "watch"               -> tightened thresholds
  drift overall_status == "retrain_recommended" -> more tightened thresholds

"Tightened" means: lower the probability required to escalate a
transaction out of ALLOW, and lower the probability required to escalate
REVIEW into BLOCK. In other words, when live traffic starts looking
statistically different from what the model was trained on, the system
becomes more conservative (more REVIEW/BLOCK, less unconditional ALLOW)
until the drift signal clears — a defensible, explainable response to
"the model's calibration is less trustworthy right now," without
pretending the model itself has learned anything new.

This does NOT replace the existing human-in-the-loop retrain workflow:
`retrain_recommended` is still surfaced as-is in `/drift/status` and a
human still decides whether/when to actually retrain and redeploy
`threat_rf_model.joblib`. This module only changes where the existing
model's own output probability gets cut into ALLOW/REVIEW/BLOCK bands.
"""

from __future__ import annotations

from dataclasses import dataclass

# Base (no-drift) operating thresholds — unchanged from the original,
# manually-chosen values in backend/main.py.
BASE_ALLOW_MAX_PROBABILITY = 0.40
BASE_BLOCK_MIN_PROBABILITY = 0.75

# Bounded adjustment steps. Deliberately small: this is a posture shift,
# not a re-derivation of the threshold from scratch (that's what
# risk_engine/threshold_business_case.py's cost sweep is for, offline).
_WATCH_ALLOW_DELTA = 0.05
_WATCH_BLOCK_DELTA = 0.05
_RETRAIN_ALLOW_DELTA = 0.10
_RETRAIN_BLOCK_DELTA = 0.10

# Floors/ceilings so an adjustment can never collapse the REVIEW band to
# zero width or invert ALLOW/BLOCK ordering.
_MIN_BAND_WIDTH = 0.10


@dataclass(frozen=True)
class ActiveThresholds:
    allow_max_probability: float
    block_min_probability: float
    drift_status: str
    adaptation_active: bool
    note: str


def thresholds_for_drift_status(drift_status: str) -> ActiveThresholds:
    """Given the current `overall_status` from compute_drift(), return the
    ALLOW/BLOCK cut points that should be used for scoring right now.
    """
    if drift_status == "watch":
        allow = BASE_ALLOW_MAX_PROBABILITY - _WATCH_ALLOW_DELTA
        block = BASE_BLOCK_MIN_PROBABILITY - _WATCH_BLOCK_DELTA
        note = (
            "Moderate drift detected (PSI watch band). Operating posture "
            "tightened: the ALLOW ceiling and BLOCK floor were each lowered "
            f"by {_WATCH_ALLOW_DELTA:.2f} so more borderline traffic routes "
            "to REVIEW/BLOCK while the drift signal is elevated."
        )
        adaptation_active = True
    elif drift_status == "retrain_recommended":
        allow = BASE_ALLOW_MAX_PROBABILITY - _RETRAIN_ALLOW_DELTA
        block = BASE_BLOCK_MIN_PROBABILITY - _RETRAIN_BLOCK_DELTA
        note = (
            "Significant drift detected (PSI retrain band). Operating "
            "posture tightened further: thresholds lowered by "
            f"{_RETRAIN_ALLOW_DELTA:.2f}. A human should also review the "
            "retrain recommendation in /drift/status — this threshold shift "
            "is a stop-gap, not a substitute for retraining."
        )
        adaptation_active = True
    else:
        allow = BASE_ALLOW_MAX_PROBABILITY
        block = BASE_BLOCK_MIN_PROBABILITY
        note = "No drift detected (or insufficient live-traffic sample). Base thresholds in effect."
        adaptation_active = False

    # Safety clamp: never let the band width drop below _MIN_BAND_WIDTH.
    if block - allow < _MIN_BAND_WIDTH:
        block = allow + _MIN_BAND_WIDTH

    return ActiveThresholds(
        allow_max_probability=round(allow, 4),
        block_min_probability=round(block, 4),
        drift_status=drift_status,
        adaptation_active=adaptation_active,
        note=note,
    )
