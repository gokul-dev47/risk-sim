"""FastAPI integration tests using TestClient against the real app.

Assumes trained artifacts already exist under data/processed/ (either
from a prior local `python3 run_pipeline.py` run, or produced by
test_train_model.py running earlier in the same pytest session — pytest
collects test files in a stable order, and test_train_model.py sorts
before this file alphabetically, so this is safe in practice; CI also
runs run_pipeline.py explicitly before pytest as a belt-and-suspenders
measure).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.main import app  # noqa: E402

VALID_PAYLOAD = {
    "velocity_1h": 1,
    "geo_mismatch": 0,
    "cvv_failure_rate": 0.0,
    "amount_log": 7.0,
    "is_small_amount": 0,
    "distinct_cards_1h": 0,
}

REVIEW_PAYLOAD = {
    "velocity_1h": 4,
    "geo_mismatch": 0,
    "cvv_failure_rate": 0.35,
    "amount_log": 5.5,
    "is_small_amount": 0,
    "distinct_cards_1h": 0,
}


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["synthetic_data_only"] is True
    assert body["live_payments"] is False


def test_predict_valid_payload(client):
    r = client.post("/predict", json=VALID_PAYLOAD)
    assert r.status_code == 200
    body = r.json()
    assert body["decision"] in ("ALLOW", "REVIEW", "BLOCK")
    assert 0.0 <= body["risk_probability"] <= 1.0
    assert body["engine"] in ("ml_fusion", "rule_fallback")
    assert "explanation" in body


def test_predict_invalid_payload_returns_422(client):
    # Missing required fields entirely.
    r = client.post("/predict", json={"velocity_1h": 1})
    assert r.status_code == 422

    # Out-of-range values (geo_mismatch must be 0 or 1).
    bad = dict(VALID_PAYLOAD)
    bad["geo_mismatch"] = 5
    r = client.post("/predict", json=bad)
    assert r.status_code == 422

    # cvv_failure_rate must be within [0, 1].
    bad = dict(VALID_PAYLOAD)
    bad["cvv_failure_rate"] = 1.5
    r = client.post("/predict", json=bad)
    assert r.status_code == 422


def test_model_metrics_endpoint(client):
    r = client.get("/model/metrics")
    assert r.status_code == 200
    body = r.json()
    assert "accuracy" in body
    assert "average_precision" in body
    assert "dataset_totals" in body


def test_ieee_cis_benchmark_endpoint_is_separate_from_synthetic_model(client):
    """The IEEE-CIS benchmark (risk_engine/ieee_cis_train.py) is optional --
    it requires manually-supplied raw CSVs -- so this asserts EITHER a
    well-formed 200 (artifacts present) or an honest 503 (not yet run), and
    either way that /predict/`/model/metrics` (the deployed synthetic model)
    are completely unaffected by whether it has been run.
    """
    r_before = client.get("/model/metrics")
    assert r_before.status_code == 200

    r = client.get("/model/ieee-cis-benchmark")
    assert r.status_code in (200, 503)
    if r.status_code == 200:
        body = r.json()
        assert body["dataset"].startswith("IEEE-CIS")
        assert "scope_note" in body
        assert "test_metrics_at_recommended_threshold" in body

    r_after = client.get("/model/metrics")
    assert r_after.json() == r_before.json()

    p = client.post("/predict", json=VALID_PAYLOAD)
    assert p.status_code == 200
    assert p.json()["engine"] in ("ml_fusion", "rule_fallback")


def test_review_decision_issues_step_up(client):
    r = client.post("/predict", json=REVIEW_PAYLOAD)
    assert r.status_code == 200
    body = r.json()
    if body["decision"] == "REVIEW":
        assert body["step_up"] is not None
        assert "verification_id" in body["step_up"]
        assert "demo_otp" in body["step_up"]


def test_otp_full_lifecycle(client):
    r = client.post("/predict", json=REVIEW_PAYLOAD)
    body = r.json()
    if body["decision"] != "REVIEW" or body["step_up"] is None:
        pytest.skip("This model instance did not classify REVIEW_PAYLOAD as REVIEW; nothing to verify.")

    step_up = body["step_up"]

    # Wrong code first.
    r = client.post(
        "/verify/otp/confirm",
        json={"verification_id": step_up["verification_id"], "code": "000000"},
    )
    assert r.status_code == 200
    result = r.json()
    assert result["verified"] is False

    # Correct code.
    r = client.post(
        "/verify/otp/confirm",
        json={"verification_id": step_up["verification_id"], "code": step_up["demo_otp"]},
    )
    assert r.status_code == 200
    result = r.json()
    assert result["verified"] is True
    assert result["final_decision"] == "ALLOW"


def test_circuit_breaker_forces_fallback(client):
    r = client.post("/system/simulate-failure")
    assert r.status_code == 200
    assert r.json()["breaker_open"] is True

    try:
        r = client.post("/predict", json=VALID_PAYLOAD)
        assert r.status_code == 200
        body = r.json()
        assert body["engine"] == "rule_fallback"
        assert body["degraded_mode"] is True
    finally:
        # Always restore, so this test doesn't leave the breaker open for
        # subsequent tests in the same session.
        r = client.post("/system/restore")
        assert r.json()["breaker_open"] is False


def test_audit_chain_integrity_endpoint(client):
    # Generate at least one audit event first.
    client.post("/predict", json=VALID_PAYLOAD)
    r = client.get("/audit/verify-integrity")
    assert r.status_code == 200
    body = r.json()
    assert body["intact"] is True


def test_drift_status_endpoint_shape(client):
    r = client.get("/drift/status")
    assert r.status_code == 200
    body = r.json()
    assert "overall_status" in body
    assert body["overall_status"] in ("stable", "watch", "retrain_recommended", "insufficient_data")


def test_baseline_comparison_endpoint(client):
    r = client.get("/model/baseline-comparison")
    assert r.status_code == 200
    body = r.json()
    assert "naive_baseline" in body
    assert "ml_fusion_summary" in body


def test_cold_start_bypasses_ml_for_thin_history_entity(client):
    # Clean, small, first-ever transaction -> conservative ALLOW, no ML consulted.
    payload = dict(VALID_PAYLOAD)
    payload["entity_observed_count"] = 0
    r = client.post("/predict", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["engine"] == "cold_start_rule"
    assert body["decision"] == "ALLOW"

    # Same thin history, but with a CVV failure signal -> escalate to REVIEW.
    risky_payload = dict(VALID_PAYLOAD)
    risky_payload["cvv_failure_rate"] = 0.5
    risky_payload["entity_observed_count"] = 1
    r = client.post("/predict", json=risky_payload)
    assert r.status_code == 200
    body = r.json()
    assert body["engine"] == "cold_start_rule"
    assert body["decision"] == "REVIEW"


def test_established_entity_uses_normal_ml_not_cold_start(client):
    payload = dict(VALID_PAYLOAD)
    payload["entity_observed_count"] = 50
    r = client.post("/predict", json=payload)
    assert r.status_code == 200
    assert r.json()["engine"] != "cold_start_rule"


def test_missing_entity_observed_count_defaults_to_normal_ml(client):
    # No entity_observed_count field at all -> backward compatible, normal ML.
    r = client.post("/predict", json=VALID_PAYLOAD)
    assert r.status_code == 200
    assert r.json()["engine"] != "cold_start_rule"


def test_evidence_pack_for_known_transaction(client):
    txn_id = "evidence-pack-test-txn"
    payload = dict(VALID_PAYLOAD)
    payload["transaction_id"] = txn_id
    client.post("/predict", json=payload)

    r = client.get(f"/audit/evidence-pack/{txn_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["found"] is True
    assert body["chain_intact"] is True
    assert txn_id in body["report_markdown"]
    assert "Scope disclosure" in body["report_markdown"]


def test_evidence_pack_for_unknown_transaction(client):
    r = client.get("/audit/evidence-pack/this-transaction-does-not-exist")
    assert r.status_code == 200
    assert r.json()["found"] is False


def test_threshold_business_case_endpoint(client):
    r = client.get("/model/threshold-business-case")
    assert r.status_code == 200
    body = r.json()
    names = {p["name"] for p in body["operating_points"]}
    assert names == {"aggressive", "balanced", "conservative"}
    for point in body["operating_points"]:
        assert "monthly_equivalent" in point
        assert "merchant_recommendation" in point
    assert body["deployed_default"]["name"] == "balanced"


def test_load_test_results_endpoint(client):
    r = client.get("/model/load-test")
    assert r.status_code == 200
    body = r.json()
    assert body["endpoint"] == "/predict"
    concurrencies = [row["concurrency"] for row in body["results_by_concurrency"]]
    assert concurrencies == sorted(concurrencies)
    for row in body["results_by_concurrency"]:
        assert row["p50_ms"] >= 0
        assert row["p99_ms"] >= row["p50_ms"]
        assert "engines_observed" in row


def test_evasion_analysis_endpoint(client):
    r = client.get("/model/evasion-analysis")
    assert r.status_code == 200
    body = r.json()
    assert body["structural_velocity_breakpoint_minutes"] == 60
    spacings = [row["spacing_minutes"] for row in body["results_by_spacing"]]
    assert spacings == sorted(spacings)
    wide_spacing_rows = [row for row in body["results_by_spacing"] if row["spacing_minutes"] > 60]
    assert all(row["pct_rows_with_zero_velocity_1h"] >= 90.0 for row in wide_spacing_rows)


def test_model_metrics_includes_one_in_n_framing(client):
    r = client.get("/model/metrics")
    assert r.status_code == 200
    body = r.json()
    deployed = body["protection_summary"]["at_deployed_policy"]
    assert "legitimate_flagged_one_in_n" in deployed
    assert "legitimate_flagged_one_in_n_description" in deployed
    sweep_row = body["threshold_sweep"][0]
    assert "legitimate_flagged_one_in_n" in sweep_row


def test_cost_curve_sweep_includes_one_in_n_framing(client):
    r = client.get("/model/cost-curve")
    assert r.status_code == 200
    body = r.json()
    assert "legitimate_flagged_one_in_n" in body["sweep"][0]
