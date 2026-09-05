"""Naive rule-based baseline, evaluated on the exact same held-out split as
the ML models.

Why this exists: any classifier can look good in isolation. The only honest
way to show the ML is earning its complexity is to compare it against the
simplest thing a payments team could ship in an afternoon with no ML at all
— a hand-tuned threshold rule — on the identical test set.

Rule (hand-tuned by inspecting the training data's normal-vs-suspicious
ranges, exactly how a non-ML analyst would do it):
    BLOCK  if is_small_amount == 1 AND velocity_1h >= 5
    REVIEW if geo_mismatch == 1 AND cvv_failure_rate >= 0.3
    ALLOW  otherwise
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
from risk_engine.data_split import three_way_group_split  # noqa: E402

INPUT_PATH = PROJECT_ROOT / "data" / "processed" / "features_dataset.csv"
OUTPUT_PATH = PROJECT_ROOT / "data" / "processed" / "baseline_comparison.json"

from risk_engine.feature_schema import FEATURE_COLUMNS  # noqa: E402

TARGET_COLUMN = "label"
RANDOM_SEED = 42


def naive_rule_predict(frame: pd.DataFrame) -> pd.Series:
    is_block = (frame["is_small_amount"] == 1) & (frame["velocity_1h"] >= 5)
    is_review = (frame["geo_mismatch"] == 1) & (frame["cvv_failure_rate"] >= 0.3)
    flagged = (is_block | is_review).astype(int)
    return flagged


def evaluate(y_true: pd.Series, y_pred: pd.Series) -> dict:
    matrix = confusion_matrix(y_true, y_pred, labels=[0, 1])
    tn, fp, fn, tp = matrix.ravel()
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1_score": float(f1_score(y_true, y_pred, zero_division=0)),
        "confusion_matrix": {
            "true_negative": int(tn),
            "false_positive": int(fp),
            "false_negative": int(fn),
            "true_positive": int(tp),
        },
    }


def _subtype_recall(frame: pd.DataFrame, test_index: pd.Index, y_pred: pd.Series) -> dict:
    test_frame = frame.loc[test_index].copy()
    test_frame["_pred"] = y_pred.values
    result = {}
    for subtype, group in test_frame[test_frame[TARGET_COLUMN] == 1].groupby("attack_subtype"):
        result[subtype] = {
            "n_test": int(len(group)),
            "recall": float((group["_pred"] == 1).mean()),
        }
    return result


def main() -> None:
    frame = pd.read_csv(INPUT_PATH)

    # Same canonical, group-aware split used for the ML models (see
    # risk_engine/data_split.py), so this comparison is apples-to-apples
    # on the identical held-out TEST rows -- not a second, independent
    # random split that happens to be a different set of transactions.
    _, _, test_df, _ = three_way_group_split(frame)
    y_test = test_df[TARGET_COLUMN].astype(int)

    baseline_pred = naive_rule_predict(test_df)
    baseline_metrics = evaluate(y_test, baseline_pred)
    baseline_metrics["subtype_recall"] = _subtype_recall(frame, test_df.index, baseline_pred)
    baseline_metrics["rule"] = (
        "BLOCK if is_small_amount==1 AND velocity_1h>=5; "
        "REVIEW if geo_mismatch==1 AND cvv_failure_rate>=0.3; ALLOW otherwise."
    )

    # Load the already-trained ML metrics to put side by side.
    ml_metrics_path = PROJECT_ROOT / "data" / "processed" / "model_metrics.json"
    ml_metrics = json.loads(ml_metrics_path.read_text(encoding="utf-8")) if ml_metrics_path.exists() else None

    comparison = {
        "naive_baseline": baseline_metrics,
        "ml_fusion_summary": (
            {
                "accuracy": ml_metrics["accuracy"],
                "precision": ml_metrics["precision"],
                "recall": ml_metrics["recall"],
                "f1_score": ml_metrics["f1_score"],
                "subtype_recall": ml_metrics["subtype_recall"],
                "fusion_recall": ml_metrics["fusion"]["recall"],
            }
            if ml_metrics
            else None
        ),
    }

    OUTPUT_PATH.write_text(json.dumps(comparison, indent=2), encoding="utf-8")

    print("=" * 60)
    print("NAIVE RULE-BASED BASELINE vs ML FUSION (same held-out set)")
    print("=" * 60)
    print(f"Naive rule:  precision={baseline_metrics['precision']:.3f}  recall={baseline_metrics['recall']:.3f}  f1={baseline_metrics['f1_score']:.3f}")
    if ml_metrics:
        print(f"ML fusion:   precision={ml_metrics['precision']:.3f}  recall={ml_metrics['fusion']['recall']:.3f}  f1={ml_metrics['f1_score']:.3f}")
    print("\nNaive rule recall by attack subtype:")
    for subtype, stats in baseline_metrics["subtype_recall"].items():
        print(f"  {subtype:20s} recall={stats['recall']:.3f}  n={stats['n_test']}")
    print(f"\nSaved comparison: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
