"""Build leak-safe ML features from synthetic payment threat data.

Uses only local CSV output from the simulator. No live payment systems
or real cardholder data are read.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
INPUT_PATH = PROJECT_ROOT / "data" / "raw" / "threat_dataset.csv"
OUTPUT_PATH = PROJECT_ROOT / "data" / "processed" / "features_dataset.csv"

OUTPUT_COLUMNS = [
    "transaction_id",
    "timestamp",
    "device_fingerprint",
    "velocity_1h",
    "geo_mismatch",
    "cvv_failure_rate",
    "amount_log",
    "is_small_amount",
    "distinct_cards_1h",
    "label",
    "attack_subtype",
]


def _previous_hour_velocity(timestamps: pd.Series) -> pd.Series:
    """Count same-device rows in the prior 1 hour, excluding the current row."""
    values = timestamps.to_numpy(dtype="datetime64[ns]")
    window_start = values - np.timedelta64(1, "h")
    left = np.searchsorted(values, window_start, side="left")
    counts = np.arange(len(values)) - left
    return pd.Series(counts, index=timestamps.index, dtype="int64")


def _previous_hour_distinct_cards(group: pd.DataFrame) -> pd.Series:
    """Count DISTINCT card_hash values seen from this device in the prior
    1 hour, from rows STRICTLY BEFORE the current one.

    This is the direct, causal signature of card-testing / BIN-enumeration:
    a legitimate cardholder's device overwhelmingly repeats the SAME
    card_hash across its history, so this feature PLATEAUS at 1 for that
    device no matter how many times it transacts. An enumeration device
    instead cycles through many distinct stolen/generated card numbers in
    a short window, so this feature keeps climbing unboundedly.
    velocity_1h (raw transaction count) cannot tell these two situations
    apart on its own -- a chatty legitimate device and an attack device can
    have identical velocity_1h while differing enormously in card
    diversity (bounded-at-1 vs. unbounded). This feature is intentionally
    scoped to be that disambiguator.

    Leak-safety: for each row, only cards from OTHER rows within the prior
    hour are counted (the row's own card_hash is excluded), computed via an
    expanding, timestamp-ordered scan -- no information from t+1 or later,
    and no information about the current row's own label, ever enters this
    feature. Implemented with a simple forward scan + deque per group
    rather than a vectorised trick, since "distinct values in a sliding
    window" has no direct pandas/numpy primitive; group sizes here are
    small enough (thousands of rows per device at most) for this to be
    fast in practice.
    """
    from collections import deque

    timestamps = group["timestamp"].to_numpy(dtype="datetime64[ns]")
    cards = group["card_hash"].to_numpy()
    window = np.timedelta64(1, "h")

    counts = np.empty(len(group), dtype="int64")
    window_cards: deque = deque()  # (timestamp, card_hash) pairs currently in window

    for i in range(len(group)):
        cutoff = timestamps[i] - window
        while window_cards and window_cards[0][0] < cutoff:
            window_cards.popleft()
        # Distinct cards from OTHER rows only -- exclude the current row's
        # own card before counting, then add it for future rows.
        counts[i] = len({c for _, c in window_cards})
        window_cards.append((timestamps[i], cards[i]))

    return pd.Series(counts, index=group.index, dtype="int64")


def engineer_features(raw: pd.DataFrame) -> pd.DataFrame:
    frame = raw.copy()
    frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=False)

    # Time-based features need chronological order within each device.
    frame = frame.sort_values(
        ["device_fingerprint", "timestamp", "transaction_id"]
    ).reset_index(drop=True)

    # velocity_1h: how many prior transactions the same device_fingerprint
    # produced in the rolling 1-hour window ending at (but not including)
    # this row. High values can indicate automated card-testing bursts.
    frame["velocity_1h"] = (
        frame.groupby("device_fingerprint", sort=False)["timestamp"]
        .transform(_previous_hour_velocity)
        .astype("int64")
    )

    # geo_mismatch: IP/country of the session disagrees with the billing
    # country. A mismatch is a simple, label-independent risk signal.
    frame["geo_mismatch"] = (
        frame["country"].astype(str).str.upper()
        != frame["billing_country"].astype(str).str.upper()
    ).astype("int64")

    # cvv_failure_rate: expanding mean of historical CVV failures for this
    # device. Any result other than "M" (match) counts as a failure.
    # shift(1) drops the current row so the feature cannot leak this
    # transaction's own CVV result (or, indirectly, its label).
    cvv_failure = (frame["cvv_result"].astype(str).str.upper() != "M").astype("int64")
    frame["cvv_failure_rate"] = (
        cvv_failure.groupby(frame["device_fingerprint"], sort=False)
        .transform(lambda series: series.shift(1).expanding().mean())
        .fillna(0.0)
    )

    # distinct_cards_1h: how many DIFFERENT card_hash values this device has
    # touched in the trailing hour (excluding its own). See docstring on
    # _previous_hour_distinct_cards for why this is a necessary companion
    # to velocity_1h specifically for card-testing/BIN-enumeration.
    # Computed with an explicit per-group loop (rather than
    # groupby.apply(...)) since "distinct values in a sliding window" has
    # no vectorised pandas primitive and groupby.apply's return-shape
    # inference is version-fragile for single/duplicate-row groups.
    distinct_cards_parts = [
        _previous_hour_distinct_cards(group)
        for _, group in frame.groupby("device_fingerprint", sort=False)
    ]
    frame["distinct_cards_1h"] = pd.concat(distinct_cards_parts).reindex(frame.index).astype("int64")

    # amount_log: log1p(amount) compresses a heavy-tailed amount range
    # without dropping zero-value synthetic rows.
    frame["amount_log"] = np.log1p(frame["amount"].astype(float))

    # is_small_amount: flags micro-authorizations (amount <= 10), a common
    # card-testing pattern used to check whether a card is live.
    frame["is_small_amount"] = (frame["amount"] <= 10).astype("int64")

    if "attack_subtype" not in frame.columns:
        frame["attack_subtype"] = frame["label"].map({0: "none", 1: "unknown"})

    frame = frame.sort_values(["timestamp", "transaction_id"]).reset_index(drop=True)
    return frame[OUTPUT_COLUMNS]


def main() -> None:
    raw = pd.read_csv(INPUT_PATH)
    features = engineer_features(raw)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    features.to_csv(OUTPUT_PATH, index=False)
    print(f"Dataset shape: {features.shape}")
    print(f"Output path: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
