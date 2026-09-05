"""Tests for the drift-triggered adaptive threshold mechanism.

Covers risk_engine/adaptive_thresholds.py in isolation (pure function,
deterministic) and a light integration check that /drift/status exposes
the active posture and /drift/reset returns it to base.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from risk_engine.adaptive_thresholds import (  # noqa: E402
    thresholds_for_drift_status,
    BASE_ALLOW_MAX_PROBABILITY,
    BASE_BLOCK_MIN_PROBABILITY,
)
from backend.main import app  # noqa: E402

client = TestClient(app)


def test_stable_drift_uses_base_thresholds():
    result = thresholds_for_drift_status("stable")
    assert result.allow_max_probability == BASE_ALLOW_MAX_PROBABILITY
    assert result.block_min_probability == BASE_BLOCK_MIN_PROBABILITY
    assert result.adaptation_active is False


def test_watch_drift_tightens_thresholds():
    result = thresholds_for_drift_status("watch")
    assert result.allow_max_probability < BASE_ALLOW_MAX_PROBABILITY
    assert result.block_min_probability < BASE_BLOCK_MIN_PROBABILITY
    assert result.adaptation_active is True


def test_retrain_recommended_tightens_further_than_watch():
    watch = thresholds_for_drift_status("watch")
    retrain = thresholds_for_drift_status("retrain_recommended")
    assert retrain.allow_max_probability < watch.allow_max_probability
    assert retrain.block_min_probability < watch.block_min_probability


def test_band_never_collapses_or_inverts():
    for status in ("stable", "watch", "retrain_recommended"):
        result = thresholds_for_drift_status(status)
        assert result.block_min_probability - result.allow_max_probability >= 0.10
        assert 0.0 <= result.allow_max_probability < result.block_min_probability <= 1.0


def test_drift_status_endpoint_exposes_adaptation_block():
    resp = client.get("/drift/status")
    assert resp.status_code in (200, 503)
    if resp.status_code == 200:
        body = resp.json()
        assert "adaptation" in body
        assert "allow_max_probability" in body["adaptation"]
        assert "adaptation_active" in body["adaptation"]


def test_drift_reset_returns_thresholds_to_base():
    reset_resp = client.post("/drift/reset")
    assert reset_resp.status_code == 200
    status_resp = client.get("/drift/status")
    if status_resp.status_code == 200:
        adaptation = status_resp.json()["adaptation"]
        assert adaptation["adaptation_active"] is False
        assert adaptation["allow_max_probability"] == BASE_ALLOW_MAX_PROBABILITY
