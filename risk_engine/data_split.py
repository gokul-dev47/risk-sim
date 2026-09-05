"""Canonical, leak-safe TRAIN / VALIDATION / TEST split for this project.

Every script that touches model training, calibration, threshold selection,
baselines, or diagnostics must import `three_way_group_split` from here
instead of calling `sklearn.model_selection.train_test_split` directly.
Centralizing the split fixes two problems that existed in the previous
version of this project:

1. NO VALIDATION SET EXISTED.
   Every script did a single random 80/20 TRAIN/TEST split and then used
   the TEST portion for everything: computing the threshold sweep shown in
   the UI, fitting/scoring calibration (CalibratedClassifierCV), and
   reporting final metrics. Nothing in the code *forced* test-set numbers
   to influence a decision, but the test set was the only held-out data
   available, so there was no way to select a threshold, compare
   candidate models, or check calibration without touching it. That is
   indistinguishable, from a judge's point of view, from "tuned on the
   test set" -- the methodology could not prove otherwise.

   Fix: a real three-way split (60/20/20). VALIDATION is used for every
   selection decision (threshold, calibration check). TEST is opened
   exactly once, after everything is locked, purely to report final
   numbers.

2. SYNTHETIC-DATA LEAKAGE VIA DEVICE IDENTITY.
   The generator (simulator/generate_threat_data.py) draws each attack
   subtype from a small, FIXED pool of device fingerprints reused across
   every row in that attack (4 tester devices for classic_burst, 3 ring
   devices for low_and_slow, 40 devices for bin_enumeration). A row-level
   random split puts rows from the same physical attack burst into both
   TRAIN and TEST/VALIDATION. Because velocity_1h and cvv_failure_rate
   (risk_engine/feature_engineering.py) are per-device rolling
   aggregates, a row's feature values are computed partly from *other
   rows of the same device* -- so if that device's rows are split across
   partitions, the model can partially learn "this specific device
   cluster" rather than the general shape of an attack. Precision/recall
   measured that way overstates how the model would generalize to a
   device it has genuinely never seen.

   Fix: split by GROUP (device_fingerprint), not by row. Every row for a
   given device lands in exactly one of TRAIN/VALIDATION/TEST. Test
   metrics then measure generalization to unseen devices, which is closer
   to the real question ("will this catch the next BIN-enumeration ring
   that shows up"), not memorization of training-set device identities.

Stratification: because grouping alone would risk assigning a
disproportionate share of the (relatively few) attack device-groups to
one partition by chance, groups are split into two pools first --
"groups that ever contain an attack row" and "groups that never do" --
and each pool is independently divided into the same 60/20/20 shares
before being recombined. This keeps the attack rate roughly stable across
TRAIN/VALIDATION/TEST without ever looking at row-level features to do it.
"""

from __future__ import annotations

from typing import NamedTuple

import numpy as np
import pandas as pd

RANDOM_SEED = 42
VAL_FRACTION = 0.20
TEST_FRACTION = 0.20
GROUP_COLUMN = "device_fingerprint"
LABEL_COLUMN = "label"


class SplitInfo(NamedTuple):
    seed: int
    group_column: str
    val_fraction: float
    test_fraction: float
    n_attack_groups: int
    n_normal_groups: int
    train_groups: int
    val_groups: int
    test_groups: int
    train_rows: int
    val_rows: int
    test_rows: int
    train_attack_rate: float
    val_attack_rate: float
    test_attack_rate: float


def _split_group_ids(groups: np.ndarray, seed: int, val_fraction: float, test_fraction: float):
    groups = np.array(sorted(groups))
    rng = np.random.RandomState(seed)
    rng.shuffle(groups)
    n = len(groups)
    n_test = max(1, int(round(n * test_fraction))) if n > 0 else 0
    n_val = max(1, int(round(n * val_fraction))) if n > 0 else 0
    test_ids = set(groups[:n_test])
    val_ids = set(groups[n_test:n_test + n_val])
    train_ids = set(groups[n_test + n_val:])
    return train_ids, val_ids, test_ids


def three_way_group_split(
    frame: pd.DataFrame,
    seed: int = RANDOM_SEED,
    val_fraction: float = VAL_FRACTION,
    test_fraction: float = TEST_FRACTION,
    group_column: str = GROUP_COLUMN,
    label_column: str = LABEL_COLUMN,
    stratum_column: str | None = "attack_subtype",
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict]:
    """Deterministically split `frame` into TRAIN/VALIDATION/TEST by
    `group_column`, so no group's rows ever appear in more than one
    partition. Returns (train_df, val_df, test_df, split_info_dict).

    If `stratum_column` is present in `frame` (defaults to
    "attack_subtype"), groups are pooled and split PER STRATUM value
    (e.g. separately for "classic_burst", "low_and_slow",
    "bin_enumeration", and "none"/normal) rather than as one combined
    attack/normal pool. Attack subtypes here are drawn from a small,
    fixed device pool (as few as 3-4 devices for some subtypes) -- pooling
    all attack groups together before splitting risks, by pure chance,
    assigning every device for a given subtype to the same partition,
    silently dropping that subtype out of TEST entirely. Stratifying by
    subtype guarantees every subtype that has at least 3 groups is
    represented in TRAIN, VALIDATION, and TEST.
    """
    if group_column not in frame.columns:
        raise KeyError(
            f"three_way_group_split requires a '{group_column}' column to "
            "group by, to avoid splitting a device's transactions across "
            "partitions. If this dataset genuinely has no group key, pass "
            "a synthetic one explicitly -- do not silently fall back to a "
            "row-level split."
        )

    if stratum_column is not None and stratum_column in frame.columns:
        group_stratum = frame.groupby(group_column)[stratum_column].first()
        strata = sorted(group_stratum.unique())
    else:
        # Fall back to a coarse attack-vs-normal stratum.
        group_stratum = frame.groupby(group_column)[label_column].max().map({0: "normal", 1: "attack"})
        strata = sorted(group_stratum.unique())

    train_ids: set = set()
    val_ids: set = set()
    test_ids: set = set()
    for offset, stratum in enumerate(strata):
        stratum_groups = group_stratum[group_stratum == stratum].index.to_numpy()
        # Offset the seed per stratum so each pool gets an independent,
        # but still fully deterministic, shuffle.
        t, v, te = _split_group_ids(stratum_groups, seed + offset, val_fraction, test_fraction)
        train_ids |= t
        val_ids |= v
        test_ids |= te

    train_df = frame[frame[group_column].isin(train_ids)].copy()
    val_df = frame[frame[group_column].isin(val_ids)].copy()
    test_df = frame[frame[group_column].isin(test_ids)].copy()

    n_attack_groups = int((group_stratum != "normal").sum()) if "normal" in strata else int(
        (group_stratum != "none").sum()
    )
    n_normal_groups = len(group_stratum) - n_attack_groups

    info = SplitInfo(
        seed=seed,
        group_column=group_column,
        val_fraction=val_fraction,
        test_fraction=test_fraction,
        n_attack_groups=n_attack_groups,
        n_normal_groups=n_normal_groups,
        train_groups=len(train_ids),
        val_groups=len(val_ids),
        test_groups=len(test_ids),
        train_rows=len(train_df),
        val_rows=len(val_df),
        test_rows=len(test_df),
        train_attack_rate=round(float((train_df[label_column] == 1).mean()), 4) if len(train_df) else 0.0,
        val_attack_rate=round(float((val_df[label_column] == 1).mean()), 4) if len(val_df) else 0.0,
        test_attack_rate=round(float((test_df[label_column] == 1).mean()), 4) if len(test_df) else 0.0,
    )
    info_dict = info._asdict()
    info_dict["strata"] = strata
    info_dict["stratum_group_counts"] = {
        str(s): int((group_stratum == s).sum()) for s in strata
    }
    info_dict["stratum_test_group_counts"] = {
        str(s): int(group_stratum.loc[list(test_ids)].eq(s).sum()) if test_ids else 0 for s in strata
    }
    return train_df, val_df, test_df, info_dict


def assert_no_group_leakage(*frames: pd.DataFrame, group_column: str = GROUP_COLUMN) -> None:
    """Raise if any group_column value appears in more than one of the
    given frames. Used by tests and by scripts themselves as a runtime
    guard right before training.
    """
    seen: dict[str, int] = {}
    for i, frame in enumerate(frames):
        for value in frame[group_column].unique():
            if value in seen and seen[value] != i:
                raise AssertionError(
                    f"Group leakage: {group_column}={value!r} appears in "
                    f"more than one split partition (index {seen[value]} "
                    f"and {i}). The split is not leak-safe."
                )
            seen[value] = i
