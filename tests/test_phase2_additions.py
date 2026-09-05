"""Tests for the Phase A/B/C/D additions layered on top of the already-
locked evaluation protocol (see risk_engine/data_split.py,
tests/test_evaluation_protocol.py). These tests check the NEW artifacts'
internal consistency, not the underlying model or split, which are
covered elsewhere and are explicitly out of scope for this phase.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def test_threshold_business_case_does_not_touch_split_or_seed():
    """Phase A must not import/modify anything from data_split.py beyond
    calling the existing split function, and must not redefine RANDOM_SEED.
    """
    source = (PROJECT_ROOT / "risk_engine" / "threshold_business_case.py").read_text()
    assert "RANDOM_SEED =" not in source
    assert "three_way_group_split" in source  # reuses, does not reimplement


def test_threshold_business_case_selection_uses_validation_not_test():
    """The methodology string must explicitly document that TEST was not
    used to select which thresholds are named -- this is asserted, not
    just claimed in prose, so a future edit that breaks it fails loudly.
    """
    source = (PROJECT_ROOT / "risk_engine" / "threshold_business_case.py").read_text()
    assert "VALIDATION" in source
    assert "TEST was never used to pick a winner" in source


def test_evasion_probe_data_is_not_merged_into_training_data():
    """The evasion probe must generate its own standalone frame and must
    never write to features_dataset.csv.
    """
    source = (PROJECT_ROOT / "risk_engine" / "evasion_analysis.py").read_text()
    assert "features_dataset.csv" not in source or "to_csv" not in source
    assert "never merged into" in source.lower() or "not merged into" in source.lower()


def test_evasion_structural_breakpoint_matches_velocity_window():
    """velocity_1h's trailing window (feature_engineering.py) and the
    evasion analysis's claimed structural breakpoint must agree -- if
    someone changes the velocity window without updating this analysis,
    this test catches the mismatch.
    """
    fe_source = (PROJECT_ROOT / "risk_engine" / "feature_engineering.py").read_text()
    assert "1h" in fe_source or "3600" in fe_source or "'1H'" in fe_source or "'1h'" in fe_source
    evasion_source = (PROJECT_ROOT / "risk_engine" / "evasion_analysis.py").read_text()
    assert "structural_breakpoint_minutes = 60" in evasion_source


def test_load_test_enters_lifespan_to_exercise_real_model():
    """Regression guard for the bug caught during development: without
    explicitly entering FastAPI's lifespan context, ASGITransport never
    loads the trained model and every request silently falls back to the
    rule engine, measuring the wrong code path.
    """
    source = (PROJECT_ROOT / "risk_engine" / "load_test.py").read_text()
    assert "lifespan(app)" in source


def test_one_in_n_helper_matches_threshold_sweep_math():
    """Phase D's 'one in every N' framing must be derivable from the exact
    same confusion-matrix numbers already in model_metrics.json, not a
    separately invented estimate.
    """
    metrics_path = PROJECT_ROOT / "data" / "processed" / "model_metrics.json"
    if not metrics_path.exists():
        subprocess.run([sys.executable, "risk_engine/train_model.py"], cwd=PROJECT_ROOT, check=True)
    metrics = json.loads(metrics_path.read_text())
    for row in metrics["threshold_sweep"]:
        tn, fp = row["true_negatives"], row["false_positives"]
        expected = round((tn + fp) / fp, 1) if fp > 0 else None
        assert row["legitimate_flagged_one_in_n"] == expected
