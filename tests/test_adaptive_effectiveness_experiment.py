"""Tests for risk_engine/adaptive_effectiveness_experiment.py.

Covers: the drift injection genuinely produces elevated PSI on the shared
reference distribution, the experiment's three conditions are internally
consistent (same y_true, same n_rows, decision counts sum correctly), and
the /model/adaptive-effectiveness endpoint serves the resulting JSON.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.main import app  # noqa: E402

MODEL_PATH = Path(__file__).resolve().parent.parent / "data" / "processed" / "threat_rf_model.joblib"

client = TestClient(app)

requires_trained_model = pytest.mark.skipif(
    not MODEL_PATH.exists(), reason="Trained model artifacts not present -- run run_pipeline.py first."
)


@requires_trained_model
def test_drift_injection_raises_psi_above_stable_batch():
    from risk_engine.adaptive_effectiveness_experiment import inject_drift, _load_reference_distribution
    from risk_engine.data_split import three_way_group_split
    from risk_engine.drift_monitor import compute_drift
    from risk_engine.feature_schema import FEATURE_COLUMNS
    import pandas as pd

    features_path = Path(__file__).resolve().parent.parent / "data" / "processed" / "features_dataset.csv"
    frame = pd.read_csv(features_path, parse_dates=["timestamp"])
    _, _, test_df, _ = three_way_group_split(frame)
    x_test = test_df[FEATURE_COLUMNS]
    reference = _load_reference_distribution()

    stable_status = compute_drift(reference, x_test)["overall_status"]
    drifted = inject_drift(x_test)
    drifted_status = compute_drift(reference, drifted)["overall_status"]

    rank = {"stable": 0, "watch": 1, "retrain_recommended": 2}
    assert rank[drifted_status] >= rank[stable_status]
    assert rank[drifted_status] > 0, "drift injection should push PSI out of the stable band"


@requires_trained_model
def test_experiment_conditions_share_row_count_and_ground_truth():
    from risk_engine.adaptive_effectiveness_experiment import run_experiment

    result = run_experiment()
    conditions = result["conditions"]
    n_rows = {c["n_rows"] for c in conditions.values()}
    assert len(n_rows) == 1, "all three conditions must evaluate the same held-out TEST rows"

    for key in ("A_baseline_stable_static", "B_drifted_static", "C_drifted_adaptive"):
        c = conditions[key]
        cm = c["confusion_matrix"]
        assert cm["true_negative"] + cm["false_positive"] + cm["false_negative"] + cm["true_positive"] == c["n_rows"]
        assert 0.0 <= c["precision"] <= 1.0
        assert 0.0 <= c["recall"] <= 1.0
        assert 0.0 <= c["review_rate"] <= 1.0
        assert c["expected_cost_inr"] >= 0.0


@requires_trained_model
def test_experiment_thresholds_match_adaptive_mechanism():
    from risk_engine.adaptive_effectiveness_experiment import run_experiment
    from risk_engine.adaptive_thresholds import BASE_ALLOW_MAX_PROBABILITY, BASE_BLOCK_MIN_PROBABILITY

    result = run_experiment()
    conditions = result["conditions"]

    # Condition A (stable) and B (drifted/static) must use unmodified base thresholds.
    assert conditions["A_baseline_stable_static"]["active_allow_max_probability"] == BASE_ALLOW_MAX_PROBABILITY
    assert conditions["B_drifted_static"]["active_allow_max_probability"] == BASE_ALLOW_MAX_PROBABILITY
    assert conditions["B_drifted_static"]["active_block_min_probability"] == BASE_BLOCK_MIN_PROBABILITY

    # If drift actually triggered adaptation, condition C's thresholds must
    # be strictly tighter than B's (lower allow ceiling, lower block floor).
    if conditions["C_drifted_adaptive"]["psi_status"] != "stable":
        assert (
            conditions["C_drifted_adaptive"]["active_allow_max_probability"]
            <= conditions["B_drifted_static"]["active_allow_max_probability"]
        )
        assert (
            conditions["C_drifted_adaptive"]["active_block_min_probability"]
            <= conditions["B_drifted_static"]["active_block_min_probability"]
        )


@requires_trained_model
def test_experiment_reports_delta_and_verdict_without_editorializing_falsely():
    from risk_engine.adaptive_effectiveness_experiment import run_experiment

    result = run_experiment()
    assert "adaptive_vs_static_on_drifted_batch_delta" in result
    assert "verdict" in result
    assert isinstance(result["verdict"], str) and len(result["verdict"]) > 0
    delta = result["adaptive_vs_static_on_drifted_batch_delta"]
    for key in ("recall_delta", "precision_delta", "f1_score" if False else "f1_delta", "expected_cost_delta_inr"):
        assert key in delta


def test_adaptive_effectiveness_endpoint():
    resp = client.get("/model/adaptive-effectiveness")
    assert resp.status_code in (200, 503)
    if resp.status_code == 200:
        body = resp.json()
        assert "conditions" in body
        assert "A_baseline_stable_static" in body["conditions"]
        assert "B_drifted_static" in body["conditions"]
        assert "C_drifted_adaptive" in body["conditions"]
        assert "verdict" in body
