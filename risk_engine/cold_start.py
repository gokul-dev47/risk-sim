"""Cold-start risk handling.

velocity_1h and cvv_failure_rate (see risk_engine/feature_engineering.py)
are expanding-window aggregates computed from an entity's transaction
history. For a genuinely new card/device, these aggregates aren't "low
risk" — they're statistically undefined, computed from near-zero history
and defaulting to 0. Trusting the RandomForest's probability on that
input is not actually honest: the model was trained on aggregates with
real statistical weight behind them, not on entities it has essentially
no information about.

This module provides a deliberately separate, transparent, conservative
decision path for exactly that situation, so a thin-history transaction
is never silently scored as if its (meaningless) aggregate features were
trustworthy. It is used only when the caller explicitly discloses how
many prior transactions this entity has (entity_observed_count) — when
that information isn't provided, /predict falls back to normal ML
scoring rather than guessing.
"""

from __future__ import annotations

from typing import Literal

Decision = Literal["ALLOW", "REVIEW", "BLOCK"]

# An entity needs at least this many prior observed transactions before
# its velocity/cvv_failure_rate aggregates carry enough statistical
# weight to hand off to the ML model.
COLD_START_MIN_HISTORY = 3

# A first-time purchase above this amount is a well-known real-world
# fraud pattern ("bust-out": build trust with small purchases, or skip
# straight to a large one on a stolen/synthetic identity) — conservative
# enough to escalate even with otherwise clean signals.
COLD_START_LARGE_FIRST_PURCHASE_LOG = 8.5  # roughly ₹4,900+


def is_cold_start(entity_observed_count: int | None) -> bool:
    return entity_observed_count is not None and entity_observed_count < COLD_START_MIN_HISTORY


def cold_start_decision(feature_row: dict, entity_observed_count: int) -> tuple[Decision, str]:
    """Conservative-but-fair rule path for thin-history entities.

    Deliberately does NOT default to REVIEW for every cold-start
    transaction — "maximum security against bad actors with minimum
    unnecessary friction for legitimate users" means a clean, small,
    no-mismatch first transaction should still get a smooth ALLOW; only
    genuine risk signals or a suspiciously large first purchase escalate.
    """
    cvv_failure_rate = feature_row.get("cvv_failure_rate", 0.0)
    geo_mismatch = feature_row.get("geo_mismatch", 0)
    amount_log = feature_row.get("amount_log", 0.0)
    is_small_amount = feature_row.get("is_small_amount", 0)
    distinct_cards_1h = feature_row.get("distinct_cards_1h", 0)

    # distinct_cards_1h is a DEVICE-level aggregate, not a card/entity-level
    # one -- it stays statistically meaningful even for a brand-new card,
    # because it's counting how many OTHER cards this device has touched,
    # not this card's own thin history. A new card transacting from a
    # device that has already cycled through several other cards in the
    # last hour is close to the textbook definition of card-testing, and
    # cold-start's normal leniency toward first-time customers should not
    # apply here.
    if distinct_cards_1h >= 3:
        return "REVIEW", (
            f"New entity ({entity_observed_count} prior transaction(s)) but its "
            f"device has attempted {distinct_cards_1h} other distinct cards in the "
            "past hour — a device-level signal, independent of this card's own "
            "(thin) history, consistent with card-testing behavior."
        )

    if cvv_failure_rate >= 0.3:
        return "REVIEW", (
            f"New entity ({entity_observed_count} prior transaction(s)) with a "
            f"{cvv_failure_rate:.0%} CVV failure rate — escalated because the "
            "model's own aggregates aren't trustworthy yet, and this signal alone "
            "already warrants a closer look."
        )

    if geo_mismatch == 1 and not is_small_amount:
        return "REVIEW", (
            f"New entity ({entity_observed_count} prior transaction(s)) with a "
            "billing/session country mismatch on a non-trivial amount — escalated "
            "as a precaution given there's no history to weigh it against."
        )

    if amount_log >= COLD_START_LARGE_FIRST_PURCHASE_LOG:
        return "REVIEW", (
            f"New entity ({entity_observed_count} prior transaction(s)) attempting "
            "an unusually large first purchase — a known pattern worth a closer "
            "look before trusting it, independent of any other signal."
        )

    return "ALLOW", (
        f"New entity ({entity_observed_count} prior transaction(s)), but the "
        "transaction itself is small and carries no other risk signal — allowed "
        "with minimal friction rather than penalizing every first-time customer."
    )
