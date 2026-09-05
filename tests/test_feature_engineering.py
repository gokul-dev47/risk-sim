"""Verify feature engineering does not leak label-correlated information
from a transaction into its own feature row.

The key claim under test: cvv_failure_rate for row N must only reflect
CVV outcomes from rows *before* N for the same device (shift(1) +
expanding mean) — never row N's own CVV result. If this ever regressed to
use the current row's CVV result, a model trained on it would silently
learn to cheat, and held-out metrics would be meaningless.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from risk_engine.feature_engineering import engineer_features  # noqa: E402


def _make_raw_row(**overrides) -> dict:
    base = {
        "transaction_id": "txn_0",
        "timestamp": "2026-01-01 00:00:00",
        "amount": 100.0,
        "currency": "INR",
        "merchant": "TestMerchant",
        "card_hash": "card_a",
        "device_fingerprint": "device_x",
        "ip_address": "1.2.3.4",
        "country": "IN",
        "billing_country": "IN",
        "payment_status": "captured",
        "cvv_result": "M",
        "label": 0,
        "attack_subtype": "none",
    }
    base.update(overrides)
    return base


def test_first_transaction_for_a_device_has_zero_cvv_failure_rate():
    """A device's very first transaction has no history to draw on, even
    if its own CVV result failed — the feature must default to 0.0, not
    leak the current row's own outcome.
    """
    raw = pd.DataFrame([_make_raw_row(transaction_id="txn_0", cvv_result="N")])
    features = engineer_features(raw)
    assert features.loc[0, "cvv_failure_rate"] == 0.0


def test_cvv_failure_rate_reflects_only_prior_history_not_current_row():
    """Three transactions from the same device: first fails CVV, second
    passes, third fails. The third row's cvv_failure_rate must be based
    only on rows 1-2 (mean of [1, 0] = 0.5), regardless of row 3's own
    (failing) CVV result — proving row 3 cannot see its own outcome.
    """
    raw = pd.DataFrame(
        [
            _make_raw_row(transaction_id="txn_0", timestamp="2026-01-01 00:00:00", cvv_result="N"),
            _make_raw_row(transaction_id="txn_1", timestamp="2026-01-01 00:05:00", cvv_result="M"),
            _make_raw_row(transaction_id="txn_2", timestamp="2026-01-01 00:10:00", cvv_result="N"),
        ]
    )
    features = engineer_features(raw).sort_values("timestamp").reset_index(drop=True)

    assert features.loc[0, "cvv_failure_rate"] == 0.0  # no history yet
    assert features.loc[1, "cvv_failure_rate"] == 1.0  # only row 0 (failed) precedes it
    assert features.loc[2, "cvv_failure_rate"] == 0.5  # mean of [1, 0], NOT influenced by row 2's own "N"


def test_velocity_1h_excludes_current_row():
    """velocity_1h for a device's first transaction in a burst must be 0
    (nothing preceded it), even though later rows in the same hour will
    count it.
    """
    raw = pd.DataFrame(
        [
            _make_raw_row(transaction_id="txn_0", timestamp="2026-01-01 00:00:00"),
            _make_raw_row(transaction_id="txn_1", timestamp="2026-01-01 00:10:00"),
            _make_raw_row(transaction_id="txn_2", timestamp="2026-01-01 00:20:00"),
        ]
    )
    features = engineer_features(raw).sort_values("timestamp").reset_index(drop=True)

    assert features.loc[0, "velocity_1h"] == 0
    assert features.loc[1, "velocity_1h"] == 1
    assert features.loc[2, "velocity_1h"] == 2


def test_geo_mismatch_is_correctly_flagged():
    raw = pd.DataFrame(
        [
            _make_raw_row(transaction_id="txn_0", country="IN", billing_country="IN"),
            _make_raw_row(transaction_id="txn_1", country="IN", billing_country="US", device_fingerprint="device_y"),
        ]
    )
    features = engineer_features(raw)
    row0 = features[features["transaction_id"] == "txn_0"].iloc[0]
    row1 = features[features["transaction_id"] == "txn_1"].iloc[0]
    assert row0["geo_mismatch"] == 0
    assert row1["geo_mismatch"] == 1


def test_is_small_amount_threshold():
    raw = pd.DataFrame(
        [
            _make_raw_row(transaction_id="txn_0", amount=10.0),
            _make_raw_row(transaction_id="txn_1", amount=10.01, device_fingerprint="device_y"),
        ]
    )
    features = engineer_features(raw)
    row0 = features[features["transaction_id"] == "txn_0"].iloc[0]
    row1 = features[features["transaction_id"] == "txn_1"].iloc[0]
    assert row0["is_small_amount"] == 1
    assert row1["is_small_amount"] == 0


def test_output_columns_present():
    raw = pd.DataFrame([_make_raw_row()])
    features = engineer_features(raw)
    expected = {
        "transaction_id", "timestamp", "velocity_1h", "geo_mismatch",
        "cvv_failure_rate", "amount_log", "is_small_amount", "distinct_cards_1h",
        "label", "attack_subtype",
    }
    assert expected.issubset(set(features.columns))


def test_distinct_cards_1h_excludes_current_row_and_counts_only_prior_hour():
    """Direct card-testing/BIN-enumeration signature: a device using 3
    DIFFERENT cards within an hour should show distinct_cards_1h = 0, 1, 2
    for rows 1/2/3 respectively (never counting the row's own card, and
    never counting a card outside the trailing 1-hour window).
    """
    raw = pd.DataFrame(
        [
            _make_raw_row(transaction_id="txn_0", timestamp="2026-01-01 00:00:00", card_hash="card_a"),
            _make_raw_row(transaction_id="txn_1", timestamp="2026-01-01 00:10:00", card_hash="card_b"),
            _make_raw_row(transaction_id="txn_2", timestamp="2026-01-01 00:20:00", card_hash="card_c"),
            # Outside the 1h window from txn_0-2 (started fresh at 02:00) and
            # reuses card_a: distinct-card history should NOT carry across
            # this hour boundary.
            _make_raw_row(transaction_id="txn_3", timestamp="2026-01-01 02:00:00", card_hash="card_a"),
        ]
    )
    features = engineer_features(raw).sort_values("timestamp").reset_index(drop=True)

    assert features.loc[0, "distinct_cards_1h"] == 0  # no history yet
    assert features.loc[1, "distinct_cards_1h"] == 1  # only card_a precedes it
    assert features.loc[2, "distinct_cards_1h"] == 2  # card_a, card_b precede it (not card_c itself)
    assert features.loc[3, "distinct_cards_1h"] == 0  # >1h gap: prior cards have fallen out of window


def test_distinct_cards_1h_plateaus_at_one_for_repeat_use_of_same_card():
    """A legitimate cardholder retrying/reusing their OWN single card
    several times must have distinct_cards_1h PLATEAU at 1 (just that one
    card) rather than keep climbing — unlike velocity_1h, which climbs
    with every repeat regardless of whether it's the same card or not.
    This bounded-vs-unbounded distinction is exactly what separates a
    chatty legitimate device from a card-testing device (see
    risk_engine/feature_schema.py).
    """
    raw = pd.DataFrame(
        [
            _make_raw_row(transaction_id=f"txn_{i}", timestamp=f"2026-01-01 00:0{i}:00", card_hash="card_a")
            for i in range(5)
        ]
    )
    features = engineer_features(raw).sort_values("timestamp").reset_index(drop=True)
    assert features.loc[0, "distinct_cards_1h"] == 0  # no history yet
    assert (features.loc[1:, "distinct_cards_1h"] == 1).all()  # capped at the one card seen so far
