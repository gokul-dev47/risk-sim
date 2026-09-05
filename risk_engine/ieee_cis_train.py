"""Train + evaluate a real-world generalization benchmark model on IEEE-CIS.

Deliberately separate from `risk_engine/train_model.py` (the synthetic
BIN-enumeration model). Per DATASET_STRATEGY.md §4/§7: results here are
never merged with, or described as evidence about, the synthetic model's
card-testing/BIN-enumeration numbers. This is a general "does the fusion
architecture's approach (supervised classifier + honest held-out reporting)
also work on a real, independently-labeled fraud dataset" benchmark, on
IEEE-CIS's own generic isFraud label.

Split: CHRONOLOGICAL 60/20/20 by TransactionDT (not random, not grouped by
device -- IEEE-CIS's card/device identifiers are already Vesta-anonymized
aggregates, so there is no reconstructable per-device group key to split by
the way the synthetic pipeline does). A time-based split is the right
leak-safety discipline for THIS dataset: it guarantees validation/test are
strictly later in time than train, so the model can never see the future to
predict the past.

Model: HistGradientBoostingClassifier, not RandomForest. Chosen for this
script specifically (not a change to the synthetic model) because:
  - it handles missing values natively via NaN-aware splits, which matters
    here since several IEEE-CIS columns are >70% missing (e.g. dist2, most
    identity fields) and this environment's single-CPU / ~4GB-RAM budget
    doesn't comfortably fit a RandomForest-style imputation-heavy pipeline
    at 590k rows,
  - it accepts pandas 'category' dtype columns directly (categorical_features
    ='from_dtype'), avoiding one-hot-encoding ProductCD/card4/card6/M1-M9/
    identity fields into a much wider, sparser matrix.

Produces, under data/processed/ieee_cis/:
  - ieee_cis_model.joblib   Trained HistGradientBoostingClassifier
  - ieee_cis_metrics.json   Honest held-out metrics + threshold sweep +
                             permutation feature importance (train/val
                             selection, test opened once)
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from risk_engine.ieee_cis_features import (  # noqa: E402
    FEATURES_PATH,
    PROCESSED_DIR,
    load_and_engineer,
    raw_data_available,
)
from risk_engine.ieee_cis_schema import FEATURE_COLUMNS, ID_COLUMN, LABEL_COLUMN, TIME_COLUMN  # noqa: E402

MODEL_PATH = PROCESSED_DIR / "ieee_cis_model.joblib"
METRICS_PATH = PROCESSED_DIR / "ieee_cis_metrics.json"

RANDOM_SEED = 42
VAL_FRACTION = 0.20
TEST_FRACTION = 0.20


def chronological_split(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict]:
    """Sort by TransactionDT, then cut 60/20/20 in time order. Returns
    (train, val, test, info) -- val is strictly later than train, test is
    strictly later than val.
    """
    ordered = frame.sort_values(TIME_COLUMN, kind="mergesort").reset_index(drop=True)
    n = len(ordered)
    n_train = int(round(n * (1 - VAL_FRACTION - TEST_FRACTION)))
    n_val = int(round(n * VAL_FRACTION))
    train = ordered.iloc[:n_train]
    val = ordered.iloc[n_train:n_train + n_val]
    test = ordered.iloc[n_train + n_val:]
    info = {
        "split_method": "chronological_by_TransactionDT",
        "train_rows": int(len(train)),
        "val_rows": int(len(val)),
        "test_rows": int(len(test)),
        "train_fraud_rate": round(float(train[LABEL_COLUMN].mean()), 4),
        "val_fraud_rate": round(float(val[LABEL_COLUMN].mean()), 4),
        "test_fraud_rate": round(float(test[LABEL_COLUMN].mean()), 4),
        "train_time_range": [int(train[TIME_COLUMN].min()), int(train[TIME_COLUMN].max())],
        "val_time_range": [int(val[TIME_COLUMN].min()), int(val[TIME_COLUMN].max())],
        "test_time_range": [int(test[TIME_COLUMN].min()), int(test[TIME_COLUMN].max())],
    }
    return train, val, test, info


def train_model(x_train: pd.DataFrame, y_train: pd.Series) -> HistGradientBoostingClassifier:
    model = HistGradientBoostingClassifier(
        max_iter=300,
        learning_rate=0.08,
        max_leaf_nodes=63,
        l2_regularization=0.1,
        class_weight="balanced",
        categorical_features="from_dtype",
        early_stopping=True,
        validation_fraction=0.1,
        random_state=RANDOM_SEED,
    )
    model.fit(x_train, y_train)
    return model


def _threshold_sweep(y_true: pd.Series, y_proba: np.ndarray) -> list[dict]:
    sweep = []
    for threshold in np.arange(0.05, 0.96, 0.05):
        y_pred = (y_proba >= threshold).astype(int)
        tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
        sweep.append({
            "threshold": round(float(threshold), 2),
            "precision": float(precision_score(y_true, y_pred, zero_division=0)),
            "recall": float(recall_score(y_true, y_pred, zero_division=0)),
            "f1": float(f1_score(y_true, y_pred, zero_division=0)),
            "true_positives": int(tp), "false_positives": int(fp),
            "true_negatives": int(tn), "false_negatives": int(fn),
        })
    return sweep


def select_threshold_on_validation(model, x_val: pd.DataFrame, y_val: pd.Series) -> dict:
    """Mirrors the synthetic pipeline's discipline (risk_engine/train_model.py):
    the only place a selection decision is made from held-out data is
    VALIDATION, using F1 here (no INR cost-per-review/loss-avoided figures
    are assumed for this real-world, foreign dataset -- inventing business
    costs for it would misrepresent Razorpay-specific assumptions as if they
    applied to Vesta's e-commerce traffic). TEST is opened once, below.
    """
    y_proba_val = model.predict_proba(x_val)[:, 1]
    sweep = _threshold_sweep(y_val, y_proba_val)
    best = max(sweep, key=lambda row: row["f1"])
    return {
        "selected_on": "validation_split_only",
        "selection_rule": "argmax(f1) over threshold grid 0.05-0.95",
        "recommended_threshold": best["threshold"],
        "recommended_threshold_validation_metrics": best,
        "validation_threshold_sweep": sweep,
        "n_validation": int(len(y_val)),
    }


def evaluate_on_test(model, x_test: pd.DataFrame, y_test: pd.Series, threshold: float) -> dict:
    y_proba = model.predict_proba(x_test)[:, 1]
    y_pred = (y_proba >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_test, y_pred, labels=[0, 1]).ravel()
    return {
        "threshold_used": threshold,
        "n_test": int(len(y_test)),
        "test_fraud_rate": round(float(y_test.mean()), 4),
        "precision": float(precision_score(y_test, y_pred, zero_division=0)),
        "recall": float(recall_score(y_test, y_pred, zero_division=0)),
        "f1": float(f1_score(y_test, y_pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test, y_proba)),
        "average_precision_auc_pr": float(average_precision_score(y_test, y_proba)),
        "confusion_matrix": {
            "true_negative": int(tn), "false_positive": int(fp),
            "false_negative": int(fn), "true_positive": int(tp),
        },
    }


def permutation_feature_importance(model, x_val: pd.DataFrame, y_val: pd.Series, sample_size: int = 20_000) -> list[dict]:
    """Computed on a bounded VALIDATION sample (never test), via
    average-precision drop-on-shuffle. Full-validation permutation
    importance at 590k rows x ~76 columns is not workable in this
    environment's CPU budget; a fixed, seeded subsample keeps the ranking
    stable and reproducible without that cost.
    """
    rng = np.random.RandomState(RANDOM_SEED)
    if len(x_val) > sample_size:
        idx = rng.choice(x_val.index, size=sample_size, replace=False)
        x_sample, y_sample = x_val.loc[idx], y_val.loc[idx]
    else:
        x_sample, y_sample = x_val, y_val
    result = permutation_importance(
        model, x_sample, y_sample,
        scoring="average_precision", n_repeats=3, random_state=RANDOM_SEED, n_jobs=1,
    )
    order = np.argsort(result.importances_mean)[::-1]
    return [
        {
            "feature": FEATURE_COLUMNS[i],
            "importance_mean": float(result.importances_mean[i]),
            "importance_std": float(result.importances_std[i]),
        }
        for i in order
    ]


def main() -> None:
    if not raw_data_available():
        print(
            "[SKIP] IEEE-CIS raw CSVs not found under data/external/ieee-cis/. "
            "Place train_transaction.csv and train_identity.csv there to run this step."
        )
        return

    t0 = time.time()
    print("Loading + engineering IEEE-CIS features...")
    features = load_and_engineer(save=True)
    print(f"  {len(features):,} rows x {len(FEATURE_COLUMNS)} features "
          f"({features[LABEL_COLUMN].mean():.4%} fraud) in {time.time() - t0:.1f}s")

    train, val, test, split_info = chronological_split(features)
    print(f"Chronological split -> train {len(train):,} / val {len(val):,} / test {len(test):,}")

    x_train, y_train = train[FEATURE_COLUMNS], train[LABEL_COLUMN]
    x_val, y_val = val[FEATURE_COLUMNS], val[LABEL_COLUMN]
    x_test, y_test = test[FEATURE_COLUMNS], test[LABEL_COLUMN]

    t1 = time.time()
    print("Training HistGradientBoostingClassifier...")
    model = train_model(x_train, y_train)
    print(f"  trained in {time.time() - t1:.1f}s ({model.n_iter_} boosting iterations)")

    threshold_info = select_threshold_on_validation(model, x_val, y_val)
    print(f"Recommended threshold (validation, argmax F1): {threshold_info['recommended_threshold']}")

    test_metrics = evaluate_on_test(model, x_test, y_test, threshold_info["recommended_threshold"])
    print(f"TEST -> precision={test_metrics['precision']:.4f} recall={test_metrics['recall']:.4f} "
          f"f1={test_metrics['f1']:.4f} roc_auc={test_metrics['roc_auc']:.4f} "
          f"auc_pr={test_metrics['average_precision_auc_pr']:.4f}")

    also_at_50 = evaluate_on_test(model, x_test, y_test, 0.5)

    print("Computing permutation feature importance on a validation sample...")
    importances = permutation_feature_importance(model, x_val, y_val)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_PATH)

    metrics = {
        "dataset": "IEEE-CIS Fraud Detection (train_transaction.csv + train_identity.csv)",
        "label_column": LABEL_COLUMN,
        "scope_note": (
            "This is a SEPARATE real-world generalization benchmark using IEEE-CIS's "
            "own generic isFraud label. It is NOT evidence about, and is never merged "
            "with, the synthetic BIN-enumeration/card-testing model's numbers -- see "
            "DATASET_STRATEGY.md sections 3-4 and 7 for why those two problems are not "
            "interchangeable."
        ),
        "n_rows": int(len(features)),
        "n_features": len(FEATURE_COLUMNS),
        "feature_columns": FEATURE_COLUMNS,
        "overall_fraud_rate": round(float(features[LABEL_COLUMN].mean()), 4),
        "split": split_info,
        "model": "HistGradientBoostingClassifier(class_weight='balanced', categorical_features='from_dtype')",
        "threshold_selection": threshold_info,
        "test_metrics_at_recommended_threshold": test_metrics,
        "test_metrics_at_threshold_0_5": also_at_50,
        "permutation_importance_validation_sample": importances,
        "trained_at_unix": time.time(),
    }
    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)

    print(f"\nSaved model -> {MODEL_PATH}")
    print(f"Saved metrics -> {METRICS_PATH}")
    print(f"Total time: {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
