"""Feature contract for the IEEE-CIS real-world benchmark model.

This is intentionally a SEPARATE schema from `feature_schema.FEATURE_COLUMNS`
(the 6-feature BIN-enumeration/card-testing model). DATASET_STRATEGY.md §5-7
already explains why: IEEE-CIS's `isFraud` is a generic fraud label, not a
BIN-enumeration label, and most of the synthetic feature set's semantics
(true per-device rolling velocity, CVV failure, geo mismatch) are not
reconstructable from IEEE-CIS's pre-hashed/pre-aggregated identifiers.
Forcing IEEE-CIS into the synthetic 6-column vector would mean either
fabricating semantics or silently degrading most features to constants --
both rejected. Instead this schema is built directly from IEEE-CIS's own
columns, evaluated and reported on its own as a real-world generalization
benchmark, and never merged with the synthetic model's numbers.

Column groups below are a deliberately bounded subset of the full 434-column
IEEE-CIS schema (which also includes V1-V339, undocumented Vesta-engineered
features). V-columns are excluded from this pass: their block-wise
missingness pattern (tied to ProductCD) would need a dedicated selection
study to use responsibly within this environment's CPU/memory budget, and
DATASET_STRATEGY.md's original mapping sketch did not include them either.
That is a scope decision, not a claim that they wouldn't help.
"""

from __future__ import annotations

# Transaction-table columns, read directly off disk (see ieee_cis_features.py).
ID_COLUMN = "TransactionID"
LABEL_COLUMN = "isFraud"
TIME_COLUMN = "TransactionDT"  # seconds from an unspecified reference; used ONLY for the chronological split, never as a feature.

TRANSACTION_NUMERIC = [
    "TransactionAmt",
    "card1", "card2", "card3", "card5",
    "addr1", "addr2",
    "dist1", "dist2",
    "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13", "C14",
    "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13", "D14", "D15",
]

TRANSACTION_CATEGORICAL = [
    "ProductCD", "card4", "card6",
    "M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9",
]

# Read for engineered features, then dropped (see build_features): raw email
# strings are not fed to the model directly (unbounded cardinality); only the
# derived match flag is.
TRANSACTION_EMAIL_COLUMNS = ["P_emaildomain", "R_emaildomain"]

# Identity-table columns (only ~24% of transactions have a matching identity
# row -- absence itself is informative, captured via HAS_IDENTITY_COLUMN).
IDENTITY_NUMERIC = [
    "id_01", "id_02", "id_05", "id_06", "id_09", "id_11", "id_13", "id_17", "id_19", "id_20",
]
IDENTITY_CATEGORICAL = [
    "DeviceType", "id_12", "id_15", "id_16", "id_28", "id_29", "id_31", "id_34", "id_35", "id_36", "id_37", "id_38",
]

# Engineered on top of the raw columns above.
ENGINEERED_NUMERIC = ["amt_log", "is_small_amount", "has_identity"]
ENGINEERED_CATEGORICAL = ["email_match"]

NUMERIC_FEATURES = TRANSACTION_NUMERIC + IDENTITY_NUMERIC + ENGINEERED_NUMERIC
CATEGORICAL_FEATURES = TRANSACTION_CATEGORICAL + IDENTITY_CATEGORICAL + ENGINEERED_CATEGORICAL

# Order matters: this is the exact column order the trained IEEE-CIS model
# expects (mirrors the discipline in feature_schema.py, applied to this
# separate schema).
FEATURE_COLUMNS = NUMERIC_FEATURES + CATEGORICAL_FEATURES

FEATURE_DESCRIPTIONS = {
    "amt_log": "log1p(TransactionAmt)",
    "is_small_amount": "1 if TransactionAmt <= 10 (same micro-authorization heuristic as the synthetic model's is_small_amount, applied to IEEE-CIS's own currency/units -- not validated as equivalent)",
    "has_identity": "1 if this TransactionID has a matching row in train_identity.csv",
    "email_match": "1 if purchaser and recipient email domains match, 0 if both present and differ, -1 if either is missing",
    "ProductCD": "Vesta product category code (raw, categorical)",
    "card1": "Card identifier 1 (Vesta-anonymized, raw)",
    "card2": "Card identifier 2 (Vesta-anonymized, raw)",
    "card3": "Card identifier 3 (Vesta-anonymized, raw)",
    "card4": "Card network, e.g. visa/mastercard (raw, categorical)",
    "card5": "Card identifier 5 (Vesta-anonymized, raw)",
    "card6": "Card type, e.g. credit/debit (raw, categorical)",
    "addr1": "Billing region code (Vesta-anonymized, raw)",
    "addr2": "Billing country code (Vesta-anonymized, raw)",
    "dist1": "Distance 1 (Vesta-defined, undocumented exact semantics, raw)",
    "dist2": "Distance 2 (Vesta-defined, undocumented exact semantics, raw)",
}
for _c in [f"C{i}" for i in range(1, 15)]:
    FEATURE_DESCRIPTIONS[_c] = "Vesta pre-computed counting feature (undocumented exact semantics, e.g. count of addresses associated with the card); used raw, not re-derived"
for _c in [f"D{i}" for i in range(1, 16)]:
    FEATURE_DESCRIPTIONS[_c] = "Vesta pre-computed time-delta feature (undocumented exact semantics, e.g. days since previous transaction); used raw, not re-derived"
for _c in [f"M{i}" for i in range(1, 10)]:
    FEATURE_DESCRIPTIONS[_c] = "Vesta match flag (undocumented exact semantics, e.g. names/addresses match); used raw, not re-derived"
for _c in IDENTITY_NUMERIC + IDENTITY_CATEGORICAL:
    FEATURE_DESCRIPTIONS.setdefault(_c, "Raw IEEE-CIS identity-table field (device/network/behavioral fingerprint signal; exact semantics undocumented by Vesta)")
