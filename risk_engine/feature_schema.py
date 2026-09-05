"""Single source of truth for the live model's feature contract.

Previously the 5 (now 6) feature names were hardcoded independently in
9 different files (train_model.py, backend/main.py, drift_monitor.py,
explainability.py, evasion_analysis.py, model_diagnostics.py,
stress_test.py, baseline_model.py, graph_features.py). Adding or
reordering a feature meant editing all 9 by hand with no guardrail
against missing one -- a real reproducibility risk under Part 22/27
discipline. Every one of those modules now imports FEATURE_COLUMNS from
here instead of redefining it.
"""

from __future__ import annotations

# Order matters: this is the exact column order the trained model expects.
FEATURE_COLUMNS = [
    "velocity_1h",
    "geo_mismatch",
    "cvv_failure_rate",
    "amount_log",
    "is_small_amount",
    "distinct_cards_1h",
]

# Human-readable descriptions, used by explainability/UI layers so the
# "why did we take this action" story stays in sync with the schema.
FEATURE_DESCRIPTIONS = {
    "velocity_1h": "Same-device transactions in the prior hour",
    "geo_mismatch": "1 if session country differs from card billing country",
    "cvv_failure_rate": "Historical CVV failure rate for this device",
    "amount_log": "log1p(amount) of the transaction",
    "is_small_amount": "1 if amount <= 10 (micro-authorization / card-testing probe)",
    "distinct_cards_1h": (
        "Distinct card_hash values attempted by this device in the prior "
        "hour (excluding the current transaction). A genuine cardholder's "
        "device plateaus at 1 no matter how many times it transacts; "
        "BIN-enumeration/card-testing rings are defined by a small pool of "
        "devices cycling through many distinct card numbers in quick "
        "succession, so this climbs unboundedly for them. velocity_1h "
        "alone cannot distinguish 'one customer retried their own card 8 "
        "times' (velocity_1h=8, distinct_cards_1h=1) from 'one device "
        "tried 8 different stolen cards' (velocity_1h=8, "
        "distinct_cards_1h=8) -- distinct_cards_1h can."
    ),
}
