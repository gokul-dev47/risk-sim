"""Load + engineer features from the real-world IEEE-CIS Fraud Detection
dataset (`train_transaction.csv` + `train_identity.csv`).

This module is additive: it does not touch the synthetic BIN-enumeration
pipeline (`feature_engineering.py`, `feature_schema.py`, `train_model.py`),
which remains the project's primary, in-active-use model per
DATASET_STRATEGY.md. This module implements the previously-unbuilt "if
IEEE-CIS is added later" step sketched in that document's §5, now that the
raw CSVs have actually been supplied.

No leak-safety concerns from row-level rolling aggregates arise here (unlike
the synthetic pipeline): every feature used is either a raw column already
present per-row in the source files, or a simple deterministic function of
that single row (log-amount, small-amount flag, email-domain match,
has-identity flag). Nothing here aggregates across other rows, so there is
no analogue to the synthetic project's "device split across partitions"
leak. The one place row order matters is TIME: the split in
`ieee_cis_train.py` is chronological (by TransactionDT), not random, so
"future" transactions are never used to help predict "past" ones.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from risk_engine.ieee_cis_schema import (  # noqa: E402
    CATEGORICAL_FEATURES,
    FEATURE_COLUMNS,
    ID_COLUMN,
    IDENTITY_CATEGORICAL,
    IDENTITY_NUMERIC,
    LABEL_COLUMN,
    NUMERIC_FEATURES,
    TIME_COLUMN,
    TRANSACTION_CATEGORICAL,
    TRANSACTION_EMAIL_COLUMNS,
    TRANSACTION_NUMERIC,
)

RAW_DIR = PROJECT_ROOT / "data" / "external" / "ieee-cis"
TRANSACTION_PATH = RAW_DIR / "train_transaction.csv"
IDENTITY_PATH = RAW_DIR / "train_identity.csv"

PROCESSED_DIR = PROJECT_ROOT / "data" / "processed" / "ieee_cis"
FEATURES_PATH = PROCESSED_DIR / "ieee_cis_features.csv"


def raw_data_available() -> bool:
    return TRANSACTION_PATH.exists() and IDENTITY_PATH.exists()


def _numeric_dtype_map(columns: list[str]) -> dict:
    return {c: "float32" for c in columns}


def load_raw() -> pd.DataFrame:
    """Read only the columns this schema uses (not all 434), with narrow
    dtypes, to keep this workable on a single-CPU / ~4GB-RAM environment.
    """
    if not raw_data_available():
        raise FileNotFoundError(
            f"Expected IEEE-CIS CSVs at {TRANSACTION_PATH} and {IDENTITY_PATH}. "
            "Place train_transaction.csv and train_identity.csv there."
        )

    tx_usecols = (
        [ID_COLUMN, LABEL_COLUMN, TIME_COLUMN]
        + TRANSACTION_NUMERIC
        + TRANSACTION_CATEGORICAL
        + TRANSACTION_EMAIL_COLUMNS
    )
    tx_dtype = {
        ID_COLUMN: "int32",
        LABEL_COLUMN: "int8",
        TIME_COLUMN: "int32",
        **_numeric_dtype_map(TRANSACTION_NUMERIC),
    }
    tx = pd.read_csv(TRANSACTION_PATH, usecols=tx_usecols, dtype=tx_dtype)

    id_usecols = [ID_COLUMN] + IDENTITY_NUMERIC + IDENTITY_CATEGORICAL
    id_dtype = {ID_COLUMN: "int32", **_numeric_dtype_map(IDENTITY_NUMERIC)}
    identity = pd.read_csv(IDENTITY_PATH, usecols=id_usecols, dtype=id_dtype)

    frame = tx.merge(identity, on=ID_COLUMN, how="left", indicator=True)
    frame["has_identity"] = (frame["_merge"] == "both").astype("int8")
    frame = frame.drop(columns=["_merge"])
    return frame


def build_features(frame: pd.DataFrame) -> pd.DataFrame:
    """Deterministic, row-local feature engineering. See module docstring
    for why this needs no leak-safety machinery beyond the time-based split
    handled by the caller.
    """
    out = frame.copy()

    out["amt_log"] = np.log1p(out["TransactionAmt"].clip(lower=0))
    out["is_small_amount"] = (out["TransactionAmt"] <= 10).astype("int8")

    p_dom = out["P_emaildomain"]
    r_dom = out["R_emaildomain"]
    both_present = p_dom.notna() & r_dom.notna()
    match = np.where(both_present, (p_dom == r_dom).astype(int), -1)
    out["email_match"] = pd.Series(match, index=out.index).astype("int8")
    out = out.drop(columns=TRANSACTION_EMAIL_COLUMNS)

    for col in CATEGORICAL_FEATURES:
        out[col] = out[col].astype("category")

    keep = [ID_COLUMN, LABEL_COLUMN, TIME_COLUMN] + FEATURE_COLUMNS
    return out[keep]


def load_and_engineer(save: bool = True) -> pd.DataFrame:
    raw = load_raw()
    features = build_features(raw)
    if save:
        PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
        features.to_csv(FEATURES_PATH, index=False)
    return features


if __name__ == "__main__":
    if not raw_data_available():
        print(
            f"[SKIP] IEEE-CIS raw CSVs not found under {RAW_DIR}. "
            "Nothing to do."
        )
        raise SystemExit(0)
    df = load_and_engineer(save=True)
    print(f"Built {len(df):,} rows x {len(FEATURE_COLUMNS)} features -> {FEATURES_PATH}")
    print(f"Fraud rate: {df[LABEL_COLUMN].mean():.4%}")
