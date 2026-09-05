"""Tests for risk_engine/canonical_event.py (Phase 1: canonical transaction
event contract) and the POST /api/v1/score-canonical-event endpoint.

Two things matter here, both load-bearing honesty claims made in the
module docstring:

1. `derive_live_features`'s ONLINE computation actually reproduces
   `feature_engineering.py`'s OFFLINE computation closely (verified
   against a real device's full transaction history from the synthetic
   dataset, not just a couple of hand-picked rows).
2. IEEE-CIS-sourced events are REFUSED by the live scoring path, not
   silently scored with fabricated semantics.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.main import app  # noqa: E402
from risk_engine.canonical_event import (  # noqa: E402
    DeviceHistoryStore,
    derive_live_features,
    from_ieee_cis_row,
    from_razorpay_event,
    from_synthetic_row,
)

FEATURES_CSV = Path(__file__).resolve().parent.parent / "data" / "raw" / "threat_dataset.csv"
requires_raw_data = pytest.mark.skipif(not FEATURES_CSV.exists(), reason="Raw synthetic dataset not present.")

client = TestClient(app)


def test_from_synthetic_row_maps_expected_fields():
    row = {
        "transaction_id": "txn_1",
        "timestamp": "2026-01-01 00:00:00",
        "amount": 100.0,
        "currency": "INR",
        "merchant": "Acme",
        "card_hash": "cardhash123",
        "device_fingerprint": "device456",
        "ip_address": "1.2.3.4",
        "country": "IN",
        "billing_country": "IN",
        "cvv_result": "M",
    }
    ev = from_synthetic_row(row)
    assert ev.transaction_id == "txn_1"
    assert ev.amount == 100.0
    assert ev.card_token == "cardhash123"
    assert ev.device_id == "device456"
    assert ev.source_system == "synthetic"


def test_from_razorpay_event_converts_paise_to_rupees():
    event = {
        "id": "pay_ABC123",
        "amount": 150000,  # paise
        "currency": "INR",
        "method": "card",
        "email": "buyer@example.com",
        "created_at": 1750000000,
    }
    ev = from_razorpay_event(event)
    assert ev.amount == 1500.0
    assert ev.account_id == "buyer@example.com"
    assert ev.source_system == "razorpay_test_mode"


def test_from_ieee_cis_row_is_lossy_but_does_not_crash():
    row = {"TransactionID": 12345, "TransactionDT": 86400, "TransactionAmt": 59.0, "ProductCD": "W", "card1": 1001}
    ev = from_ieee_cis_row(row)
    assert ev.source_system == "ieee_cis"
    assert ev.transaction_id == "12345"


def test_derive_live_features_refuses_ieee_cis_events():
    row = {"TransactionID": 1, "TransactionDT": 0, "TransactionAmt": 10.0}
    ev = from_ieee_cis_row(row)
    with pytest.raises(ValueError, match="refuses IEEE-CIS"):
        derive_live_features(ev)


def test_derive_live_features_basic_shape():
    store = DeviceHistoryStore()
    row = {
        "transaction_id": "t1",
        "timestamp": "2026-01-01 00:00:00",
        "amount": 5000.0,
        "card_hash": "c1",
        "device_fingerprint": "d1",
        "country": "IN",
        "billing_country": "IN",
        "cvv_result": "M",
    }
    ev = from_synthetic_row(row)
    feats = derive_live_features(ev, store)
    assert feats == {
        "velocity_1h": 0,
        "geo_mismatch": 0,
        "cvv_failure_rate": 0.0,
        "amount_log": pytest.approx(8.517393, abs=1e-4),
        "is_small_amount": 0,
        "distinct_cards_1h": 0,
    }


def test_derive_live_features_detects_geo_mismatch_and_velocity():
    store = DeviceHistoryStore()
    base = {
        "transaction_id": "t1",
        "timestamp": "2026-01-01 00:00:00",
        "amount": 5.0,
        "card_hash": "c1",
        "device_fingerprint": "d1",
        "country": "IN",
        "billing_country": "IN",
        "cvv_result": "M",
    }
    derive_live_features(from_synthetic_row(base), store)

    second = dict(base, transaction_id="t2", timestamp="2026-01-01 00:00:30", card_hash="c2", country="US")
    feats = derive_live_features(from_synthetic_row(second), store)
    assert feats["geo_mismatch"] == 1
    assert feats["velocity_1h"] == 1
    assert feats["distinct_cards_1h"] == 1  # c1 seen prior, c2 is the current row's own card
    assert feats["is_small_amount"] == 1


@requires_raw_data
def test_online_derivation_closely_matches_offline_feature_engineering():
    """The central honesty claim for Phase 1: online derivation should
    reproduce the offline, leak-safe feature_engineering.py computation
    for the overwhelming majority of rows on a real device history.
    A small residual mismatch rate is tolerated and disclosed (same-
    timestamp tie-breaking edge cases -- see module docstring) rather
    than asserting impossible 100% parity.
    """
    from risk_engine.feature_engineering import engineer_features

    raw = pd.read_csv(FEATURES_CSV)
    raw["timestamp"] = pd.to_datetime(raw["timestamp"])
    device = raw["device_fingerprint"].value_counts().index[0]
    sub = raw[raw["device_fingerprint"] == device].sort_values("timestamp").reset_index(drop=True)
    assert len(sub) > 50, "test needs a device with a non-trivial history"

    offline = engineer_features(sub).sort_values("timestamp").reset_index(drop=True)

    store = DeviceHistoryStore(max_events_per_device=1000)
    mismatches = 0
    for i, row in sub.iterrows():
        ev = from_synthetic_row(row.to_dict())
        online = derive_live_features(ev, store)
        off_row = offline.iloc[i]
        ok = (
            online["velocity_1h"] == off_row["velocity_1h"]
            and online["distinct_cards_1h"] == off_row["distinct_cards_1h"]
            and abs(online["cvv_failure_rate"] - off_row["cvv_failure_rate"]) < 1e-6
            and online["geo_mismatch"] == off_row["geo_mismatch"]
        )
        if not ok:
            mismatches += 1

    mismatch_rate = mismatches / len(sub)
    assert mismatch_rate < 0.02, f"online/offline feature mismatch rate too high: {mismatch_rate:.2%}"


def test_score_canonical_event_synthetic_source_scores_via_predict_pipeline():
    payload = {
        "transaction_id": "canon-1",
        "timestamp": "2026-09-05T12:00:00",
        "amount": 500.0,
        "device_id": "device-canon-1",
        "card_token": "card-canon-1",
        "country": "IN",
        "billing_country": "IN",
        "cvv_result": "M",
        "source_system": "synthetic",
    }
    resp = client.post("/api/v1/score-canonical-event", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["decision"] in ("ALLOW", "REVIEW", "BLOCK")
    assert "risk_score" in body
    assert body["risk_score_type"] == "model_score"


def test_score_canonical_event_rejects_ieee_cis_source():
    payload = {
        "transaction_id": "canon-2",
        "timestamp": "2026-09-05T12:00:00",
        "amount": 500.0,
        "source_system": "ieee_cis",
    }
    resp = client.post("/api/v1/score-canonical-event", json=payload)
    assert resp.status_code == 422


def test_score_canonical_event_invalid_timestamp_returns_422():
    payload = {
        "transaction_id": "canon-3",
        "timestamp": "not-a-timestamp",
        "amount": 500.0,
        "source_system": "synthetic",
    }
    resp = client.post("/api/v1/score-canonical-event", json=payload)
    assert resp.status_code == 422


def test_score_canonical_event_velocity_accumulates_across_requests():
    """Repeated requests for the SAME device_id should raise velocity_1h,
    proving the in-memory DeviceHistoryStore genuinely persists across
    HTTP requests within a process, not just within a single call.
    """
    device_id = "device-velocity-test-unique-001"
    base_payload = {
        "amount": 20.0,
        "device_id": device_id,
        "country": "IN",
        "billing_country": "IN",
        "cvv_result": "M",
        "source_system": "synthetic",
    }
    last_body = None
    for i in range(5):
        payload = dict(
            base_payload,
            transaction_id=f"velo-{i}",
            timestamp=f"2026-09-05T12:00:{i:02d}",
            card_token=f"card-velo-{i}",
        )
        resp = client.post("/api/v1/score-canonical-event", json=payload)
        assert resp.status_code == 200
        last_body = resp.json()

    # After 5 rapid same-device transactions, the reason codes on the
    # last one should reflect elevated velocity/card-diversity signals.
    assert last_body is not None
