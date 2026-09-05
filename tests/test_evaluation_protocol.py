"""Tests for the TRAIN -> VALIDATION (select) -> LOCK -> TEST (report once)
discipline in risk_engine/train_model.py, as required by Track 02's
"the test set must never be used for ... threshold selection" rule.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pandas as pd
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from risk_engine.data_split import three_way_group_split  # noqa: E402
from risk_engine.train_model import (  # noqa: E402
    FEATURE_COLUMNS,
    TARGET_COLUMN,
    select_threshold_on_validation,
    train_random_forest,
)

METRICS_PATH = PROJECT_ROOT / "data" / "processed" / "model_metrics.json"
FEATURES_PATH = PROJECT_ROOT / "data" / "processed" / "features_dataset.csv"


@pytest.fixture(scope="module", autouse=True)
def ensure_pipeline_has_run():
    if not METRICS_PATH.exists():
        for script in [
            "simulator/generate_threat_data.py",
            "risk_engine/feature_engineering.py",
            "risk_engine/train_model.py",
        ]:
            result = subprocess.run([sys.executable, script], cwd=PROJECT_ROOT, capture_output=True, text=True)
            assert result.returncode == 0, f"{script} failed:\n{result.stdout}\n{result.stderr}"
    yield


def test_threshold_selection_function_never_receives_test_data():
    """select_threshold_on_validation() only accepts a model + one (x, y)
    pair. There is no parameter through which a test set could be passed
    in, even by mistake -- this is enforced by the function signature
    itself, not just by convention at the call site."""
    import inspect

    sig = inspect.signature(select_threshold_on_validation)
    params = list(sig.parameters)
    assert params == ["model", "x_val", "y_val"], (
        "select_threshold_on_validation's signature changed in a way that "
        "could allow a test set to be passed where validation is expected."
    )


def test_recommended_threshold_is_reproducible_from_validation_alone():
    """Recomputing the validation-selected threshold independently (outside
    of train_model.main()) using only TRAIN+VALIDATION must reproduce the
    exact value stored in model_metrics.json -- proving the stored
    recommendation really was derived from validation only, not touched up
    using test-set knowledge afterwards."""
    frame = pd.read_csv(FEATURES_PATH)
    train_df, val_df, _test_df, _ = three_way_group_split(frame)
    x_train, y_train = train_df[FEATURE_COLUMNS], train_df[TARGET_COLUMN].astype(int)
    x_val, y_val = val_df[FEATURE_COLUMNS], val_df[TARGET_COLUMN].astype(int)

    model = train_random_forest(x_train, y_train)
    selection = select_threshold_on_validation(model, x_val, y_val)

    metrics = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    stored_threshold = metrics["validation_threshold_selection"]["recommended_threshold"]
    assert selection["recommended_threshold"] == stored_threshold


def test_metrics_artifact_documents_the_split_and_selection():
    metrics = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    assert "split_info" in metrics
    assert "validation_threshold_selection" in metrics
    assert metrics["validation_threshold_selection"]["selected_on"] == "validation_split_only"
    # The split_info block should make it possible to verify group-based,
    # non-overlapping partitioning without re-running training.
    for key in ("seed", "group_column", "train_rows", "val_rows", "test_rows", "stratum_test_group_counts"):
        assert key in metrics["split_info"], f"split_info missing '{key}'"


def test_repeated_full_evaluation_is_deterministic():
    """Running the full generate -> features -> train chain twice with the
    same seeds must produce identical final test metrics -- required for
    'repeated evaluation produces deterministic results' and for a judge
    to be able to reproduce the exact numbers in the report."""
    def run_and_load():
        for script in [
            "simulator/generate_threat_data.py",
            "risk_engine/feature_engineering.py",
            "risk_engine/train_model.py",
        ]:
            result = subprocess.run([sys.executable, script], cwd=PROJECT_ROOT, capture_output=True, text=True)
            assert result.returncode == 0, f"{script} failed:\n{result.stdout}\n{result.stderr}"
        return json.loads(METRICS_PATH.read_text(encoding="utf-8"))

    first = run_and_load()
    second = run_and_load()

    for key in ("precision", "recall", "f1_score", "roc_auc", "average_precision"):
        assert first[key] == second[key], f"'{key}' differed between two runs with identical seeds"
    assert first["confusion_matrix"] == second["confusion_matrix"]
    assert (
        first["validation_threshold_selection"]["recommended_threshold"]
        == second["validation_threshold_selection"]["recommended_threshold"]
    )
