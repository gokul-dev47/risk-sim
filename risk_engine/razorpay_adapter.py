"""Razorpay Test Mode adapter.

This module handles Razorpay-specific concerns separately from the
fraud-risk model.

Important:
- Razorpay credentials are read only from environment variables.
- Payment signatures are verified server-side.
- Razorpay data is NOT treated as synthetic fraud features unless the
  application can legitimately derive that signal.
"""

from __future__ import annotations

import os
from typing import Any

try:
    import razorpay  # type: ignore[import-untyped]

    RAZORPAY_SDK_AVAILABLE = True
except ImportError:  # pragma: no cover — exercised in environments without the SDK installed
    razorpay = None  # type: ignore[assignment]
    RAZORPAY_SDK_AVAILABLE = False


class RazorpayConfigError(RuntimeError):
    """Raised when Razorpay configuration is missing."""


class RazorpaySDKUnavailableError(RuntimeError):
    """Raised when the `razorpay` package itself is not installed.

    This is DELIBERATELY a separate exception from RazorpayConfigError:
    a missing SDK is an environment/packaging concern (e.g. a minimal
    dev container, or `pip install -r requirements.txt` skipped for a
    quick backend-only test run), whereas missing credentials is a
    configuration concern (secrets not provided). Both must leave the
    REST of the application fully usable -- see backend/main.py's
    /razorpay/* handlers, which catch both and return a clean 503
    rather than letting import fail the whole process.
    """


def _credentials() -> tuple[str, str]:
    key_id = os.getenv("RAZORPAY_KEY_ID")
    key_secret = os.getenv("RAZORPAY_KEY_SECRET")

    if not key_id or not key_secret:
        raise RazorpayConfigError(
            "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be configured."
        )

    return key_id, key_secret


def get_client() -> "razorpay.Client":
    """Create a Razorpay API client from server-side credentials.

    Raises RazorpaySDKUnavailableError if the `razorpay` package itself
    isn't installed, or RazorpayConfigError if it's installed but
    credentials are missing -- both are caught at the API layer and
    turned into a clean, non-fatal 503, never a startup crash or an
    unhandled 500.
    """
    if not RAZORPAY_SDK_AVAILABLE:
        raise RazorpaySDKUnavailableError(
            "The 'razorpay' package is not installed. Razorpay Test Mode "
            "endpoints are unavailable, but the rest of the application "
            "(risk model, adaptive thresholds, audit chain, etc.) is "
            "fully functional without it. Install with: pip install razorpay"
        )
    key_id, key_secret = _credentials()
    return razorpay.Client(auth=(key_id, key_secret))


def create_order(
    *,
    amount_inr: float,
    receipt: str,
    notes: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Create a Razorpay Test Mode order."""
    if amount_inr <= 0:
        raise ValueError("Amount must be greater than zero.")

    amount_paise = int(round(amount_inr * 100))

    payload: dict[str, Any] = {
        "amount": amount_paise,
        "currency": "INR",
        "receipt": receipt,
    }

    if notes:
        payload["notes"] = notes

    return get_client().order.create(data=payload)


def fetch_order(order_id: str) -> dict[str, Any]:
    """Fetch an order directly from Razorpay."""
    if not order_id:
        raise ValueError("order_id is required.")

    return get_client().order.fetch(order_id)


def fetch_payment(payment_id: str) -> dict[str, Any]:
    """Fetch payment details directly from Razorpay."""
    if not payment_id:
        raise ValueError("payment_id is required.")

    return get_client().payment.fetch(payment_id)


def verify_payment_signature(
    *,
    order_id: str,
    payment_id: str,
    signature: str,
) -> bool:
    """Verify the Razorpay Checkout payment signature."""
    if not order_id or not payment_id or not signature:
        return False

    try:
        get_client().utility.verify_payment_signature(
            {
                "razorpay_order_id": order_id,
                "razorpay_payment_id": payment_id,
                "razorpay_signature": signature,
            }
        )
        return True
    except Exception:
        return False
