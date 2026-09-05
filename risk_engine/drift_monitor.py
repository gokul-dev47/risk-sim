"""Concept-drift detection via Population Stability Index (PSI).

Compares a recent batch of live/incoming feature values against the
training-time reference distribution (saved by train_model.py) on a
per-feature basis. This is what makes the system "adaptive" in a way that
is honest and defense-only: it does not simulate an evolving attacker, it
detects when REAL incoming traffic starts to look statistically different
from what the model was trained on, and flags that a retrain is due.

PSI thresholds follow common industry convention:
  < 0.1  -> no significant shift
  0.1-0.25 -> moderate shift, worth watching
  > 0.25 -> significant shift, retrain recommended
"""

from __future__ import annotations

import numpy as np

from risk_engine.feature_schema import FEATURE_COLUMNS

PSI_WATCH_THRESHOLD = 0.10
PSI_RETRAIN_THRESHOLD = 0.25
MIN_BATCH_SIZE = 50


def _psi_for_feature(bin_edges: list[float], reference_proportions: list[float], live_values: np.ndarray) -> float:
    """PSI with additive (Laplace) smoothing on the live-batch proportions.

    A raw zero-count bin against a small live batch produces a
    disproportionately huge PSI once clamped to a tiny epsilon (e.g. a
    binary feature with a true 13% rate can show 0/40 by chance and blow
    up PSI even though nothing has actually drifted). Additive smoothing
    keeps PSI meaningful at realistic live-traffic batch sizes instead of
    only being reliable on very large batches.
    """
    edges = np.array(bin_edges)
    counts, _ = np.histogram(live_values, bins=edges)
    n_bins = len(counts)
    total = counts.sum()
    if total == 0:
        return 0.0

    smoothing = 1.0
    live_proportions = (counts + smoothing) / (total + smoothing * n_bins)

    ref_proportions = np.array(reference_proportions, dtype=float)
    ref_proportions = (ref_proportions * total + smoothing) / (total + smoothing * n_bins)

    psi = 0.0
    for ref_p, live_p in zip(ref_proportions, live_proportions):
        psi += (live_p - ref_p) * np.log(live_p / ref_p)
    return float(psi)


def _status_for_psi(psi: float) -> str:
    if psi >= PSI_RETRAIN_THRESHOLD:
        return "retrain_recommended"
    if psi >= PSI_WATCH_THRESHOLD:
        return "watch"
    return "stable"


def compute_drift(reference_distribution: dict, live_batch: "pd.DataFrame") -> dict:
    """live_batch must contain the FEATURE_COLUMNS as numeric columns."""
    per_feature = {}
    worst_status = "stable"
    status_rank = {"stable": 0, "watch": 1, "retrain_recommended": 2}

    for col in FEATURE_COLUMNS:
        if col not in reference_distribution:
            continue
        ref = reference_distribution[col]
        live_values = live_batch[col].to_numpy(dtype=float)
        psi = _psi_for_feature(ref["bin_edges"], ref["proportions"], live_values)
        status = _status_for_psi(psi)
        if status_rank[status] > status_rank[worst_status]:
            worst_status = status
        per_feature[col] = {"psi": round(psi, 4), "status": status}

    return {
        "overall_status": worst_status,
        "retrain_recommended": worst_status == "retrain_recommended",
        "per_feature": per_feature,
        "batch_size": int(len(live_batch)),
        "thresholds": {"watch": PSI_WATCH_THRESHOLD, "retrain": PSI_RETRAIN_THRESHOLD},
    }
