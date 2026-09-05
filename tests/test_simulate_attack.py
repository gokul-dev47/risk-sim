"""Tests for POST /api/v1/simulate-attack (jury/live transaction injection).

The core claim under test: this endpoint is NOT a separate scoring path.
It must produce IDENTICAL risk_score/decision to POST /predict for the
same input, and the three canonical demo payloads (normal/attack/
borderline) must naturally produce ALLOW/BLOCK/REVIEW without any
threshold manipulation.
"""

from __future__ import annotations

import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.main import app  # noqa: E402

client = TestClient(app)

NORMAL_PAYLOAD = {
    "velocity_1h": 1,
    "geo_mismatch": 0,
    "cvv_failure_rate": 0.01,
    "amount_log": 8.2,
    "is_small_amount": 0,
    "distinct_cards_1h": 0,
}

OBVIOUS_ATTACK_PAYLOAD = {
    "velocity_1h": 28,
    "geo_mismatch": 1,
    "cvv_failure_rate": 0.5,
    "amount_log": 1.5,
    "is_small_amount": 1,
    "distinct_cards_1h": 22,
}

BORDERLINE_PAYLOAD = {
    "velocity_1h": 1,
    "geo_mismatch": 1,
    "cvv_failure_rate": 0.4,
    "amount_log": 5.2,
    "is_small_amount": 0,
    "distinct_cards_1h": 1,
}


def test_normal_transaction_allows():
    resp = client.post("/api/v1/simulate-attack", json=NORMAL_PAYLOAD)
    assert resp.status_code == 200
    body = resp.json()
    assert body["decision"] == "ALLOW"
    assert body["directive"]["action"] == "ALLOW_PAYMENT"
    assert body["risk_score_type"] == "model_score"


def test_obvious_attack_blocks():
    resp = client.post("/api/v1/simulate-attack", json=OBVIOUS_ATTACK_PAYLOAD)
    assert resp.status_code == 200
    body = resp.json()
    assert body["decision"] == "BLOCK"
    assert body["directive"]["action"] == "BLOCK_PAYMENT"
    assert "HIGH_CVV_FAILURE_RATE" in body["reason_codes"] or "CARD_TESTING_PATTERN" in body["reason_codes"]


def test_borderline_transaction_reviews():
    resp = client.post("/api/v1/simulate-attack", json=BORDERLINE_PAYLOAD)
    assert resp.status_code == 200
    body = resp.json()
    assert body["decision"] == "REVIEW"
    assert body["directive"]["action"] == "STEP_UP"


def test_malformed_json_returns_422_not_500():
    resp = client.post("/api/v1/simulate-attack", json={"velocity_1h": "not-a-number"})
    assert resp.status_code == 422


def test_missing_required_fields_returns_422():
    resp = client.post("/api/v1/simulate-attack", json={})
    assert resp.status_code == 422


def test_response_includes_audit_reference():
    resp = client.post("/api/v1/simulate-attack", json=NORMAL_PAYLOAD)
    body = resp.json()
    assert body["audit_reference"] is not None
    assert "sequence" in body["audit_reference"]
    assert "entry_hash" in body["audit_reference"]


def test_response_includes_adaptive_posture_and_thresholds():
    resp = client.post("/api/v1/simulate-attack", json=NORMAL_PAYLOAD)
    body = resp.json()
    assert "active_thresholds" in body
    assert "allow_max_probability" in body["active_thresholds"]
    assert "adaptive_posture" in body
    assert "drift_status" in body["adaptive_posture"]


def test_simulate_attack_matches_predict_exactly_for_same_input():
    """The central honesty claim: same input -> same risk_score/decision
    on BOTH endpoints, because simulate-attack literally calls predict().
    """
    predict_resp = client.post("/predict", json=NORMAL_PAYLOAD).json()
    sim_resp = client.post("/api/v1/simulate-attack", json=NORMAL_PAYLOAD).json()
    assert sim_resp["risk_score"] == predict_resp["risk_probability"]
    assert sim_resp["decision"] == predict_resp["decision"]
    assert sim_resp["engine"] == predict_resp["engine"]


def test_never_labels_risk_score_as_probability_without_calibration_support():
    resp = client.post("/api/v1/simulate-attack", json=NORMAL_PAYLOAD)
    body = resp.json()
    assert body["risk_score_type"] == "model_score"
