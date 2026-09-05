"""Verify the training pipeline produces a metrics artifact with every key
the API and frontend depend on. This is a regression guard: several past
bugs in this project were exactly this shape (a field the frontend needs
silently missing from model_metrics.json after a refactor).
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
METRICS_PATH = PROJECT_ROOT / "data" / "processed" / "model_metrics.json"

REQUIRED_TOP_LEVEL_KEYS = {
    "accuracy",
    "precision",
    "recall",
    "f1_score",
    "roc_auc",
    "average_precision",
    "confusion_matrix",
    "false_positives",
    "cost_per_false_positive_inr",
    "avg_fraud_loss_prevented_inr",
    "estimated_false_positive_cost_inr",
    "feature_importances",
    "subtype_recall",
    "isolation_forest",
    "fusion",
    "threshold_sweep",
    "n_test",
    "n_train",
    "dataset_totals",
    "reference_distribution",
}

REQUIRED_CONFUSION_MATRIX_KEYS = {"true_negative", "false_positive", "false_negative", "true_positive"}
REQUIRED_DATASET_TOTALS_KEYS = {"total_transactions", "total_attacks", "attack_rate"}
REQUIRED_FUSION_KEYS = {"recall", "precision", "additional_true_positives_from_iforest"}


@pytest.fixture(scope="module", autouse=True)
def ensure_pipeline_has_run():
    """Runs the generator -> feature engineering -> training chain once
    for this test module if artifacts aren't already present (e.g. in a
    fresh CI checkout). Skips re-running if model_metrics.json already
    exists, since the full chain takes ~20s and other test modules may
    have already produced it.
    """
    if not METRICS_PATH.exists():
        for script in [
            "simulator/generate_threat_data.py",
            "risk_engine/feature_engineering.py",
            "risk_engine/train_model.py",
        ]:
            result = subprocess.run([sys.executable, script], cwd=PROJECT_ROOT, capture_output=True, text=True)
            assert result.returncode == 0, f"{script} failed:\n{result.stdout}\n{result.stderr}"
    yield


def test_metrics_file_exists():
    assert METRICS_PATH.exists(), "model_metrics.json was not produced by the training pipeline"


def test_metrics_has_all_required_top_level_keys():
    metrics = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    missing = REQUIRED_TOP_LEVEL_KEYS - set(metrics.keys())
    assert not missing, f"model_metrics.json is missing required keys: {missing}"


def test_confusion_matrix_shape():
    metrics = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    missing = REQUIRED_CONFUSION_MATRIX_KEYS - set(metrics["confusion_matrix"].keys())
    assert not missing, f"confusion_matrix is missing keys: {missing}"


def test_dataset_totals_shape():
    metrics = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    missing = REQUIRED_DATASET_TOTALS_KEYS - set(metrics["dataset_totals"].keys())
    assert not missing, f"dataset_totals is missing keys: {missing}"
    assert metrics["dataset_totals"]["total_transactions"] > 0
    assert metrics["dataset_totals"]["total_attacks"] > 0


def test_fusion_shape():
    metrics = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    missing = REQUIRED_FUSION_KEYS - set(metrics["fusion"].keys())
    assert not missing, f"fusion is missing keys: {missing}"


def test_metrics_values_are_plausible_probabilities():
    """Sanity check, not a tight accuracy assertion (that would make this
    test brittle to legitimate retraining variance) — just confirms
    nothing produced NaN, negative, or >1.0 nonsense.
    """
    metrics = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    for key in ("accuracy", "precision", "recall", "f1_score", "roc_auc", "average_precision"):
        value = metrics[key]
        assert 0.0 <= value <= 1.0, f"{key}={value} is not a valid probability"


def test_subtype_recall_covers_all_three_attack_subtypes():
    metrics = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    expected_subtypes = {"classic_burst", "low_and_slow", "bin_enumeration"}
    assert expected_subtypes.issubset(set(metrics["subtype_recall"].keys()))
    for subtype, stats in metrics["subtype_recall"].items():
        assert "recall" in stats and "n_test" in stats
        assert 0.0 <= stats["recall"] <= 1.0
