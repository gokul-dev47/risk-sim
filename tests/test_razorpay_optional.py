"""Tests for risk_engine/razorpay_adapter.py's optional-import behavior and
GET /razorpay/status.

The core regression this guards against: before this fix, `import
risk_engine.razorpay_adapter` (transitively via backend/main.py) imported
the `razorpay` package at module load time with no try/except, so if the
SDK wasn't installed, EVERY test in the suite failed to collect
(ModuleNotFoundError), not just Razorpay-specific ones.
"""

from __future__ import annotations

import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.main import app  # noqa: E402
from risk_engine import razorpay_adapter  # noqa: E402

client = TestClient(app)


def test_razorpay_adapter_module_imports_regardless_of_sdk_presence():
    """This test existing and passing at all is itself the regression
    check: if razorpay_adapter.py still imported `razorpay` unguarded,
    and the SDK were absent in a given environment, this import would
    have already failed at collection time for the WHOLE test file.
    """
    assert hasattr(razorpay_adapter, "RAZORPAY_SDK_AVAILABLE")
    assert isinstance(razorpay_adapter.RAZORPAY_SDK_AVAILABLE, bool)


def test_razorpay_status_endpoint_returns_clean_shape():
    resp = client.get("/razorpay/status")
    assert resp.status_code == 200
    body = resp.json()
    assert "available" in body
    assert "reason" in body
    assert "detail" in body
    assert isinstance(body["available"], bool)
    if not body["available"]:
        assert body["reason"] in ("sdk_not_installed", "credentials_not_configured")


def test_razorpay_status_reflects_sdk_availability_flag():
    resp = client.get("/razorpay/status")
    body = resp.json()
    if not razorpay_adapter.RAZORPAY_SDK_AVAILABLE:
        assert body["available"] is False
        assert body["reason"] == "sdk_not_installed"


def test_get_client_raises_sdk_unavailable_error_when_sdk_absent(monkeypatch):
    monkeypatch.setattr(razorpay_adapter, "RAZORPAY_SDK_AVAILABLE", False)
    try:
        razorpay_adapter.get_client()
        assert False, "expected RazorpaySDKUnavailableError"
    except razorpay_adapter.RazorpaySDKUnavailableError as exc:
        assert "razorpay" in str(exc).lower()


def test_get_client_raises_config_error_when_credentials_missing(monkeypatch):
    monkeypatch.setattr(razorpay_adapter, "RAZORPAY_SDK_AVAILABLE", True)
    monkeypatch.delenv("RAZORPAY_KEY_ID", raising=False)
    monkeypatch.delenv("RAZORPAY_KEY_SECRET", raising=False)
    try:
        razorpay_adapter.get_client()
        assert False, "expected RazorpayConfigError"
    except razorpay_adapter.RazorpayConfigError:
        pass


def test_razorpay_order_endpoint_returns_503_not_500_when_unavailable(monkeypatch):
    """Whether the SDK is missing or credentials are missing, hitting
    /razorpay/order should be a clean 503 with a useful message, never an
    unhandled 500 / stack trace leaked to the client.
    """
    monkeypatch.delenv("RAZORPAY_KEY_ID", raising=False)
    monkeypatch.delenv("RAZORPAY_KEY_SECRET", raising=False)
    resp = client.post("/razorpay/order", json={"amount_inr": 100.0, "receipt": "test_receipt"})
    assert resp.status_code == 503
    body = resp.json()
    assert "detail" in body
    assert "traceback" not in str(body).lower()
