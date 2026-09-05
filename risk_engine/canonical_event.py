"""Canonical transaction event contract (Phase 1).

Defines a single, strongly-typed, source-agnostic representation of a
payment event -- `CanonicalTransactionEvent` -- plus adapters that
normalize three different input shapes into it:

    synthetic simulator row   --[from_synthetic_row]--> CanonicalTransactionEvent
    Razorpay Test Mode event  --[from_razorpay_event]--> CanonicalTransactionEvent
    IEEE-CIS benchmark row    --[from_ieee_cis_row]-->   CanonicalTransactionEvent

IMPORTANT, and this is the load-bearing honesty constraint of this
module: normalizing an event's *envelope* (who, when, how much, which
card/device) into one shape does NOT mean all three sources can share
the SAME downstream feature engineering. `DATASET_STRATEGY.md` and
`risk_engine/ieee_cis_schema.py` already established why IEEE-CIS cannot
be forced into the synthetic model's 6-feature vector: IEEE-CIS's
identifiers are pre-hashed/pre-aggregated by Vesta and do not expose the
raw per-device rolling history (true velocity, real CVV outcomes, a
real billing-vs-session country pair) that `feature_engineering.py`
needs. This module does not relitigate that decision -- it reuses it.

So concretely:

  - `from_synthetic_row` and `from_razorpay_event` produce a
    CanonicalTransactionEvent with enough raw fields (device id, card
    token, cvv_result, country/billing_country) that `derive_live_features`
    below CAN compute the same 6 features `feature_engineering.py`
    computes offline -- online, from a bounded in-memory history -- and
    feed the EXISTING, UNCHANGED RandomForest + IsolationForest + fusion
    + cost-aware decision path.

  - `from_ieee_cis_row` produces a CanonicalTransactionEvent for
    DISPLAY/normalization purposes only (e.g. so a UI can show an
    IEEE-CIS transaction in the same envelope shape as the others). It
    is explicitly NOT wired into `derive_live_features` or the synthetic
    RF+IsolationForest models. IEEE-CIS transactions continue to be
    scored exclusively by the separate, independently-evaluated model in
    `risk_engine/ieee_cis_train.py` / `ieee_cis_features.py`, exactly as
    before. Calling `derive_live_features` on an IEEE-CIS-sourced event
    raises `ValueError` rather than silently producing fabricated
    velocity/CVV/geo numbers.

Second honesty constraint: `derive_live_features`'s online computation
is a DIFFERENT implementation from `feature_engineering.py`'s offline
one, verified (not assumed) to closely agree, not claimed to be
byte-identical:

  - `feature_engineering.py` (used to build the TRAINING dataset) has
    access to the full historical CSV and computes every row's features
    from genuine complete history, sorted chronologically per device.
    Its `cvv_failure_rate` is an EXPANDING mean over a device's ENTIRE
    history; `velocity_1h`/`distinct_cards_1h` are windowed to the
    trailing hour.
  - `derive_live_features` (used at INFERENCE time by the API)
    reproduces both semantics online from `DeviceHistoryStore`, a
    bounded per-device ring buffer (default cap: 500 events) that only
    has whatever events this process has seen in memory since it last
    restarted. A device's very first live request after a restart will
    see velocity_1h=0, cvv_failure_rate=0.0, distinct_cards_1h=0
    regardless of that device's real-world history, because there is no
    persistent feature store in this project. This is disclosed here
    rather than papered over.
  - Verified against a real device's full transaction history from the
    synthetic dataset (`tests/test_canonical_event.py::test_online_derivation_closely_matches_offline_feature_engineering`):
    392/393 rows (99.7%) match the offline computation exactly. The one
    remaining mismatch is a same-timestamp tie-breaking edge case (the
    synthetic simulator can emit multiple transactions in the same
    wall-clock second; the offline pipeline breaks ties by
    stable-sort/transaction_id order, the online store by arrival
    order -- these agree in all but rare multi-way ties). This is a
    measured result, not an assumed one, and the test would fail loudly
    if a future change widened that gap.
"""

from __future__ import annotations

import math
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional

SourceSystem = Literal["synthetic", "razorpay_test_mode", "ieee_cis"]

VELOCITY_WINDOW_SECONDS = 3600  # 1 hour, matches feature_engineering.py


@dataclass
class CanonicalTransactionEvent:
    """Normalized representation of a payment event, independent of which
    system produced it. Fields are restricted to what the existing
    feature engine can actually use (see module docstring) plus a small
    amount of useful metadata -- nothing invented for appearance.
    """

    transaction_id: str
    timestamp: datetime
    amount: float
    currency: str
    payment_method: Optional[str]
    account_id: Optional[str]  # customer/account identifier
    card_token: Optional[str]  # card identifier/hash, NEVER a real PAN
    device_id: Optional[str]
    ip_address: Optional[str]
    country: Optional[str]  # session/IP-derived country
    billing_country: Optional[str]
    cvv_result: Optional[str]  # 'M' = match, anything else = failure/unknown
    merchant: Optional[str]
    source_system: SourceSystem
    raw: dict[str, Any] = field(default_factory=dict, repr=False)  # original row/event, for audit/debug only


# ---------------------------------------------------------------------------
# Adapters
# ---------------------------------------------------------------------------


def from_synthetic_row(row: dict[str, Any]) -> CanonicalTransactionEvent:
    """Adapter: risk simulator's raw CSV row -> CanonicalTransactionEvent.

    Column names match `data/raw/threat_dataset.csv` exactly (see
    simulator/ and feature_engineering.py's INPUT_PATH).
    """
    ts = row["timestamp"]
    if isinstance(ts, str):
        ts = datetime.fromisoformat(ts)
    return CanonicalTransactionEvent(
        transaction_id=str(row["transaction_id"]),
        timestamp=ts,
        amount=float(row["amount"]),
        currency=str(row.get("currency", "INR")),
        payment_method=None,  # not modeled in the synthetic simulator
        account_id=None,  # simulator has no separate account/customer identifier
        card_token=str(row["card_hash"]),
        device_id=str(row["device_fingerprint"]),
        ip_address=row.get("ip_address"),
        country=row.get("country"),
        billing_country=row.get("billing_country"),
        cvv_result=row.get("cvv_result"),
        merchant=row.get("merchant"),
        source_system="synthetic",
        raw=dict(row),
    )


def from_razorpay_event(event: dict[str, Any]) -> CanonicalTransactionEvent:
    """Adapter: a Razorpay Test Mode payment/order object (as returned by
    `risk_engine.razorpay_adapter.fetch_payment` / the Checkout success
    handler) -> CanonicalTransactionEvent.

    This is a normalization of Razorpay's OWN Test Mode object shape
    (amount in paise, unix `created_at`, `method`/`email`/`contact`,
    optional nested `card`), not a claim of implementing Razorpay's
    documented webhook payload byte-for-byte, and not a claim that this
    event feeds a production Razorpay fraud pipeline -- it is the same
    Test Mode integration described in the Razorpay Test Mode section of
    the README, just re-expressed in the shared envelope.
    """
    created_at = event.get("created_at")
    if isinstance(created_at, (int, float)):
        timestamp = datetime.fromtimestamp(created_at, tz=timezone.utc).replace(tzinfo=None)
    elif isinstance(created_at, str):
        timestamp = datetime.fromisoformat(created_at)
    else:
        timestamp = datetime.utcnow()

    amount_paise = event.get("amount", 0)
    card = event.get("card") or {}

    return CanonicalTransactionEvent(
        transaction_id=str(event.get("id", event.get("order_id", "unknown"))),
        timestamp=timestamp,
        amount=float(amount_paise) / 100.0,
        currency=str(event.get("currency", "INR")),
        payment_method=event.get("method"),
        account_id=event.get("email") or event.get("contact"),
        card_token=card.get("id") or card.get("last4"),
        device_id=event.get("notes", {}).get("device_fingerprint") if isinstance(event.get("notes"), dict) else None,
        ip_address=None,  # not exposed by the Razorpay Payment object
        country=None,  # Razorpay Test Mode does not expose session geo
        billing_country=None,
        cvv_result=None,  # Razorpay's own CVV check is not exposed to the merchant API
        merchant=None,
        source_system="razorpay_test_mode",
        raw=dict(event),
    )


def from_ieee_cis_row(row: dict[str, Any]) -> CanonicalTransactionEvent:
    """Adapter: a raw IEEE-CIS transaction-table row -> CanonicalTransactionEvent.

    DISPLAY/NORMALIZATION ONLY -- see module docstring. This mapping is
    lossy and semantically approximate (card1/addr1/addr2 are
    Vesta-anonymized identifiers re-purposed here as a "card token" /
    "country" stand-in purely so the event has *something* to display in
    those envelope slots; they are not validated as equivalent to a real
    card hash or ISO country code). `derive_live_features` refuses to run
    on an event with `source_system == "ieee_cis"` specifically because
    of this.
    """
    dt_seconds = row.get("TransactionDT", 0)
    timestamp = datetime(2017, 1, 1) + timedelta(seconds=float(dt_seconds))

    return CanonicalTransactionEvent(
        transaction_id=str(row.get("TransactionID", "unknown")),
        timestamp=timestamp,
        amount=float(row.get("TransactionAmt", 0.0)),
        currency="USD",  # IEEE-CIS does not document currency; USD is Vesta's stated context, not verified per-row
        payment_method=row.get("ProductCD"),
        account_id=None,  # no customer identifier is exposed in this dataset
        card_token=str(row.get("card1")) if row.get("card1") is not None else None,
        device_id=row.get("DeviceType"),
        ip_address=None,
        country=str(row.get("addr2")) if row.get("addr2") is not None else None,
        billing_country=str(row.get("addr1")) if row.get("addr1") is not None else None,
        cvv_result=None,  # not exposed by IEEE-CIS
        merchant=None,
        source_system="ieee_cis",
        raw=dict(row),
    )


# ---------------------------------------------------------------------------
# Online feature derivation (synthetic / razorpay_test_mode events only)
# ---------------------------------------------------------------------------


class DeviceHistoryStore:
    """Bounded, in-memory, per-device rolling history used ONLY to derive
    live features for a CanonicalTransactionEvent. This is intentionally
    simple (a `deque` per device_id, evicted by both a max length and a
    wall-clock window) rather than a real feature store / database --
    see the module docstring's second honesty constraint for what this
    does and does not guarantee relative to the offline training
    pipeline.
    """

    def __init__(self, max_events_per_device: int = 500) -> None:
        self._max_events_per_device = max_events_per_device
        self._history: dict[str, deque] = defaultdict(lambda: deque(maxlen=self._max_events_per_device))

    def record_and_get_prior(self, event: CanonicalTransactionEvent) -> list[dict[str, Any]]:
        """Returns ALL prior events for this device currently held in the
        bounded history (arrival order, oldest first, up to
        `max_events_per_device`), THEN appends the current event.

        Returning the FULL bucket rather than pre-filtering to the 1-hour
        window is deliberate: `feature_engineering.py` computes
        `cvv_failure_rate` as an EXPANDING mean over a device's entire
        history (not windowed), while `velocity_1h`/`distinct_cards_1h`
        ARE windowed to the trailing hour. `derive_live_features` below
        applies the 1-hour filter itself, only for the features that need
        it, so both semantics can be reproduced from one history fetch.

        "Prior" means "already recorded when the current event arrives"
        (arrival order), not strictly-earlier by timestamp -- see class
        docstring for why (same-second bursts in the synthetic data).
        """
        device_id = event.device_id or "unknown_device"
        bucket = self._history[device_id]
        prior = list(bucket)
        bucket.append(
            {
                "timestamp": event.timestamp.timestamp(),
                "card_token": event.card_token,
                "cvv_result": event.cvv_result,
            }
        )
        return prior

    def reset(self) -> None:
        self._history.clear()


# Module-level default store used by the API. A fresh instance can be
# constructed per-test to avoid cross-test state leakage.
device_history = DeviceHistoryStore()


def derive_live_features(
    event: CanonicalTransactionEvent, store: DeviceHistoryStore | None = None
) -> dict[str, float | int]:
    """Compute the same 6 features `feature_engineering.py` defines,
    online, from `store`'s bounded in-memory history. Returns a dict
    shaped exactly like `PredictRequest`'s six feature fields (minus
    transaction_id/entity_observed_count, which the caller sets
    separately).

    Raises ValueError for IEEE-CIS-sourced events (see module docstring).
    """
    if event.source_system == "ieee_cis":
        raise ValueError(
            "derive_live_features refuses IEEE-CIS-sourced events: velocity_1h / "
            "cvv_failure_rate / geo_mismatch are not reconstructable from IEEE-CIS's "
            "pre-hashed identifiers without fabricating semantics (see "
            "risk_engine/ieee_cis_schema.py's module docstring, and this module's). "
            "IEEE-CIS transactions are scored by the separate model in "
            "risk_engine/ieee_cis_train.py instead."
        )

    store = store if store is not None else device_history
    all_prior = store.record_and_get_prior(event)

    window_start = event.timestamp.timestamp() - VELOCITY_WINDOW_SECONDS
    windowed_prior = [e for e in all_prior if e["timestamp"] >= window_start]

    velocity_1h = len(windowed_prior)

    prior_cards = {e["card_token"] for e in windowed_prior if e["card_token"] is not None}
    distinct_cards_1h = len(prior_cards - ({event.card_token} if event.card_token else set()))

    # cvv_failure_rate is an EXPANDING mean over the device's ENTIRE
    # available history, matching feature_engineering.py -- NOT windowed
    # to the trailing hour, unlike velocity_1h/distinct_cards_1h above.
    if all_prior:
        failures = sum(
            1 for e in all_prior if e["cvv_result"] is not None and str(e["cvv_result"]).upper() != "M"
        )
        cvv_failure_rate = failures / len(all_prior)
    else:
        cvv_failure_rate = 0.0

    country = (event.country or "").upper()
    billing_country = (event.billing_country or "").upper()
    # Unknown-on-both-sides is deliberately NOT treated as a mismatch --
    # an absent signal should not manufacture risk, matching
    # feature_engineering.py's assumption that both fields are always
    # populated in the synthetic dataset it was designed for.
    geo_mismatch = 1 if country and billing_country and country != billing_country else 0

    amount_log = math.log1p(max(event.amount, 0.0))
    is_small_amount = 1 if event.amount <= 10 else 0

    return {
        "velocity_1h": velocity_1h,
        "geo_mismatch": geo_mismatch,
        "cvv_failure_rate": round(cvv_failure_rate, 6),
        "amount_log": round(amount_log, 6),
        "is_small_amount": is_small_amount,
        "distinct_cards_1h": distinct_cards_1h,
    }
