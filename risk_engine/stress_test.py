"""Fixed, hand-crafted stress-test battery.

IMPORTANT — this is NOT an adversarial agent. Every case below is a fixed,
manually authored feature vector, not something that learns, mutates, or
optimizes against the model. It exists to answer a question a naive
train/test split cannot: does the model generalize to plausible edge cases
it was never trained on, in both directions —

  (a) disguised attacks: attack-like transactions engineered to look closer
      to normal traffic than the training attack subtypes did (probing for
      false negatives), and
  (b) legitimate edge cases: unusual-but-real customer behavior that could
      trigger a false positive (travelers, shared devices, genuine micro-
      transactions) — because a system that blocks real customers is also
      a real cost, not just a "safe" failure mode.

This is the defense-only, held-out evaluation the Track 02 rubric asks
for: "a held-out test set" that is qualitatively different from a random
split of the same generative distribution.

Expectations are stated in terms of the ACTUAL three-way production
decision (ALLOW/REVIEW/BLOCK from backend/main.py), not a collapsed
binary proxy. This matters: the IsolationForest is unsupervised and does
over-flag some rare-but-legitimate patterns (shared devices, travelers,
micro-charges) as anomalies. The honest question is not "did anything
flag it at all" but "did the SYSTEM's actual decision policy do something
reasonable" — and the policy is deliberately conservative: an anomaly-only
signal on an otherwise low-risk transaction escalates to REVIEW, never a
hard BLOCK. A human reviewing a rare pattern is a reasonable cost; wrongly
hard-blocking a legitimate traveler is not, and this battery checks that
the distinction actually holds.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
MODEL_PATH = PROJECT_ROOT / "data" / "processed" / "threat_rf_model.joblib"
IFOREST_PATH = PROJECT_ROOT / "data" / "processed" / "anomaly_iforest.joblib"
OUTPUT_PATH = PROJECT_ROOT / "data" / "processed" / "stress_test_results.json"

from risk_engine.feature_schema import FEATURE_COLUMNS  # noqa: E402

# Must mirror backend/main.py's decide() thresholds exactly, so this
# battery evaluates the real production policy, not an approximation of it.
ALLOW_MAX_PROBABILITY = 0.40
BLOCK_MIN_PROBABILITY = 0.75


def decide(risk_probability: float, is_anomaly: bool) -> str:
    if risk_probability < ALLOW_MAX_PROBABILITY:
        decision = "ALLOW"
    elif risk_probability < BLOCK_MIN_PROBABILITY:
        decision = "REVIEW"
    else:
        decision = "BLOCK"
    if is_anomaly and decision == "ALLOW":
        decision = "REVIEW"
    return decision


# Each case: fixed features + the expected decision(s) an experienced fraud
# analyst would accept, with reasoning stated up front (so this can't be
# quietly re-labeled after seeing model output). Some cases accept more
# than one decision when either is a defensible outcome (e.g. REVIEW is an
# acceptable, non-failing outcome for a rare-but-legitimate pattern; a hard
# BLOCK is not).
STRESS_CASES = [
    {
        "name": "disguised_moderate_amount_attack",
        "accept": {"REVIEW", "BLOCK"},
        "reason": "Velocity + CVV failures + geo mismatch all present, but amount "
        "is moderate rather than tiny — probes whether the model over-relies on "
        "is_small_amount/amount_log rather than the full feature combination. "
        "Any escalation beyond ALLOW is a pass.",
        "features": {
            "velocity_1h": 6,
            "geo_mismatch": 1,
            "cvv_failure_rate": 0.6,
            "amount_log": 6.0,
            "is_small_amount": 0,
            "distinct_cards_1h": 4,
        },
    },
    {
        "name": "domestic_bin_attack_no_geo_signal",
        "accept": {"REVIEW", "BLOCK"},
        "reason": "All attack signals present except geo_mismatch=0 (attacker and "
        "victim happen to share a country) — probes whether the model over-relies "
        "on geo_mismatch as a crutch feature.",
        "features": {
            "velocity_1h": 4,
            "geo_mismatch": 0,
            "cvv_failure_rate": 0.55,
            "amount_log": 3.0,
            "is_small_amount": 1,
            "distinct_cards_1h": 5,
        },
    },
    {
        "name": "legit_traveler_large_purchase",
        "accept": {"ALLOW", "REVIEW"},
        "reason": "Genuine traveler: billing country differs from session country "
        "(geo_mismatch=1) but a single large, clean purchase with no CVV issues. "
        "A REVIEW is an acceptable conservative outcome; a hard BLOCK of a clean "
        "high-value legitimate purchase is not.",
        "features": {
            "velocity_1h": 1,
            "geo_mismatch": 1,
            "cvv_failure_rate": 0.02,
            "amount_log": 8.5,
            "is_small_amount": 0,
            "distinct_cards_1h": 0,
        },
    },
    {
        "name": "legit_shared_retail_terminal_burst",
        "accept": {"ALLOW", "REVIEW"},
        "reason": "A busy retail terminal / shared family device produces higher "
        "velocity than a typical single shopper, but with clean CVV, no geo "
        "mismatch, and normal amounts. REVIEW is acceptable; BLOCK is not.",
        "features": {
            "velocity_1h": 7,
            "geo_mismatch": 0,
            "cvv_failure_rate": 0.03,
            "amount_log": 7.2,
            "is_small_amount": 0,
            "distinct_cards_1h": 5,
        },
    },
    {
        "name": "legit_recurring_micro_charge",
        "accept": {"ALLOW", "REVIEW"},
        "reason": "A genuine small recurring charge (subscription/top-up): "
        "is_small_amount=1 but everything else is completely clean. REVIEW is "
        "acceptable; a hard BLOCK of a routine micro-charge is not.",
        "features": {
            "velocity_1h": 0,
            "geo_mismatch": 0,
            "cvv_failure_rate": 0.01,
            "amount_log": 1.5,
            "is_small_amount": 1,
            "distinct_cards_1h": 0,
        },
    },
    {
        "name": "slow_bin_attack_moderate_amount_variant",
        "accept": {"REVIEW", "BLOCK"},
        "reason": "A low-and-slow-style attack variant using slightly larger "
        "amounts than the training low_and_slow subtype, to probe whether the "
        "boundary generalizes past the exact training range.",
        "features": {
            "velocity_1h": 1,
            "geo_mismatch": 1,
            "cvv_failure_rate": 0.45,
            "amount_log": 5.5,
            "is_small_amount": 0,
            "distinct_cards_1h": 3,
        },
    },
    {
        "name": "extreme_velocity_full_attack_signature",
        "accept": {"BLOCK"},
        "reason": "Velocity well beyond anything in the training distribution "
        "(extreme burst), combined with every other attack signal — sanity check "
        "that the model doesn't become unstable outside its training range. This "
        "unambiguous case should hard BLOCK, not just REVIEW.",
        "features": {
            "velocity_1h": 60,
            "geo_mismatch": 1,
            "cvv_failure_rate": 0.9,
            "amount_log": 1.0,
            "is_small_amount": 1,
            "distinct_cards_1h": 20,
        },
    },
    {
        "name": "clean_baseline_transaction",
        "accept": {"ALLOW"},
        "reason": "Textbook clean transaction, included as a sanity-check control "
        "case — if this triggers anything but ALLOW, something is structurally "
        "broken.",
        "features": {
            "velocity_1h": 0,
            "geo_mismatch": 0,
            "cvv_failure_rate": 0.0,
            "amount_log": 8.0,
            "is_small_amount": 0,
            "distinct_cards_1h": 0,
        },
    },
]


def run_stress_tests() -> dict:
    model = joblib.load(MODEL_PATH)
    iforest = joblib.load(IFOREST_PATH) if IFOREST_PATH.exists() else None

    results = []
    passed = 0
    for case in STRESS_CASES:
        x = pd.DataFrame([case["features"]], columns=FEATURE_COLUMNS)
        proba = float(model.predict_proba(x)[0, 1])

        is_anomaly = False
        if iforest is not None:
            is_anomaly = bool(iforest.predict(x)[0] == -1)

        decision = decide(proba, is_anomaly)
        is_pass = decision in case["accept"]
        passed += int(is_pass)

        results.append(
            {
                "name": case["name"],
                "accepted_decisions": sorted(case["accept"]),
                "reason": case["reason"],
                "features": case["features"],
                "risk_probability": round(proba, 4),
                "isolation_forest_flagged_anomaly": is_anomaly,
                "actual_decision": decision,
                "passed": is_pass,
            }
        )

    summary = {
        "total_cases": len(STRESS_CASES),
        "passed": passed,
        "accuracy": round(passed / len(STRESS_CASES), 4),
        "cases": results,
    }
    return summary


def main() -> None:
    summary = run_stress_tests()
    OUTPUT_PATH.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print("=" * 70)
    print("FIXED STRESS-TEST BATTERY (hand-authored edge cases, non-learning)")
    print("evaluated against the real ALLOW/REVIEW/BLOCK production policy")
    print("=" * 70)
    for case in summary["cases"]:
        mark = "PASS" if case["passed"] else "FAIL"
        accepted = "/".join(case["accepted_decisions"])
        print(
            f"[{mark}] {case['name']:40s} accept={accepted:16s} "
            f"actual={case['actual_decision']:8s} (p={case['risk_probability']:.3f}, "
            f"anomaly={case['isolation_forest_flagged_anomaly']})"
        )
    print(f"\nOverall: {summary['passed']}/{summary['total_cases']} passed "
          f"({summary['accuracy']*100:.1f}%)")
    print(f"Saved: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

