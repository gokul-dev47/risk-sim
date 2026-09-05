"""Tests for the IEEE-CIS integration.

Two kinds of coverage:
1. Unit tests on `build_features`/`chronological_split` using a small
   hand-built frame -- these run in CI regardless of whether the (large,
   externally-supplied, not-committed) raw CSVs are present.
2. An integration check on the real artifacts, skipped when
   data/external/ieee-cis/*.csv is absent (fresh checkout / CI), mirroring
   how tests/test_data_split.py treats the synthetic dataset.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from risk_engine.ieee_cis_features import build_features, raw_data_available  # noqa: E402
from risk_engine.ieee_cis_schema import FEATURE_COLUMNS, ID_COLUMN, LABEL_COLUMN, TIME_COLUMN  # noqa: E402
from risk_engine.ieee_cis_train import chronological_split  # noqa: E402


def _toy_raw_frame(n: int = 40) -> pd.DataFrame:
    rng = np.random.RandomState(0)
    frame = pd.DataFrame({
        ID_COLUMN: np.arange(n),
        LABEL_COLUMN: rng.binomial(1, 0.1, n),
        TIME_COLUMN: np.arange(n) * 100,
        "TransactionAmt": rng.uniform(1, 500, n),
        "ProductCD": rng.choice(["W", "C", "H"], n),
        "card1": rng.randint(1000, 9999, n),
        "card2": rng.uniform(100, 600, n),
        "card3": rng.uniform(100, 200, n),
        "card4": rng.choice(["visa", "mastercard", None], n),
        "card5": rng.uniform(100, 250, n),
        "card6": rng.choice(["credit", "debit"], n),
        "addr1": rng.uniform(100, 500, n),
        "addr2": rng.uniform(10, 90, n),
        "dist1": rng.uniform(0, 100, n),
        "dist2": rng.uniform(0, 100, n),
        "P_emaildomain": rng.choice(["gmail.com", "yahoo.com", None], n),
        "R_emaildomain": rng.choice(["gmail.com", "yahoo.com", None], n),
        "has_identity": rng.binomial(1, 0.3, n),
    })
    for c in [f"C{i}" for i in range(1, 15)] + [f"D{i}" for i in range(1, 16)]:
        frame[c] = rng.uniform(0, 10, n)
    for c in [f"M{i}" for i in range(1, 10)]:
        frame[c] = rng.choice(["T", "F", None], n)
    for c in ["id_01", "id_02", "id_05", "id_06", "id_09", "id_11", "id_13", "id_17", "id_19", "id_20"]:
        frame[c] = rng.uniform(-10, 10, n)
    for c in ["DeviceType", "id_12", "id_15", "id_16", "id_28", "id_29", "id_31", "id_34", "id_35", "id_36", "id_37", "id_38"]:
        frame[c] = rng.choice(["a", "b", None], n)
    return frame


def test_build_features_produces_exact_schema_columns():
    raw = _toy_raw_frame()
    features = build_features(raw)
    expected = {ID_COLUMN, LABEL_COLUMN, TIME_COLUMN, *FEATURE_COLUMNS}
    assert set(features.columns) == expected
    assert list(features.columns[3:]) == FEATURE_COLUMNS  # exact order preserved


def test_amt_log_and_small_amount_flag():
    raw = _toy_raw_frame()
    raw.loc[0, "TransactionAmt"] = 5.0
    raw.loc[1, "TransactionAmt"] = 500.0
    features = build_features(raw)
    assert features.loc[0, "is_small_amount"] == 1
    assert features.loc[1, "is_small_amount"] == 0
    assert features.loc[0, "amt_log"] == pytest.approx(np.log1p(5.0))


def test_email_match_flag_semantics():
    raw = _toy_raw_frame()
    raw.loc[0, ["P_emaildomain", "R_emaildomain"]] = ["gmail.com", "gmail.com"]
    raw.loc[1, ["P_emaildomain", "R_emaildomain"]] = ["gmail.com", "yahoo.com"]
    raw.loc[2, "P_emaildomain"] = None
    raw.loc[2, "R_emaildomain"] = "gmail.com"
    features = build_features(raw)
    assert features.loc[0, "email_match"] == 1
    assert features.loc[1, "email_match"] == 0
    assert features.loc[2, "email_match"] == -1  # one side missing -> unknown, not a false match


def test_no_raw_email_columns_leak_into_the_feature_set():
    raw = _toy_raw_frame()
    features = build_features(raw)
    assert "P_emaildomain" not in features.columns
    assert "R_emaildomain" not in features.columns


def test_chronological_split_is_strictly_time_ordered_and_non_overlapping():
    raw = _toy_raw_frame(n=100)
    features = build_features(raw)
    train, val, test, info = chronological_split(features)

    assert len(train) + len(val) + len(test) == len(features)
    assert train[TIME_COLUMN].max() <= val[TIME_COLUMN].min()
    assert val[TIME_COLUMN].max() <= test[TIME_COLUMN].min()
    assert info["train_rows"] == len(train)
    assert info["test_rows"] == len(test)


@pytest.mark.skipif(not raw_data_available(), reason="IEEE-CIS raw CSVs not present in this environment")
def test_real_features_artifact_matches_schema():
    from risk_engine.ieee_cis_features import FEATURES_PATH
    assert FEATURES_PATH.exists(), "Run risk_engine/ieee_cis_features.py first"
    df = pd.read_csv(FEATURES_PATH, nrows=1000)
    assert set(FEATURE_COLUMNS).issubset(set(df.columns))
    assert LABEL_COLUMN in df.columns
