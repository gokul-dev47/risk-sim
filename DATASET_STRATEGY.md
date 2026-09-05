# Dataset & Evaluation Strategy

> **In short:** Every feature the FastAPI `/predict` endpoint scores at
> inference time — velocity counters, graph-based device/card-sharing
> signals, IEEE-CIS-derived aggregates — is produced by the exact same
> functions in `risk_engine/feature_engineering.py`,
> `graph_features.py`, and `ieee_cis_features.py` that built the
> training set, so there is no train/serve skew to hide leakage behind.
> This document explains how that dataset was constructed and validated
> so the resulting model, and the pipeline that feeds it, can be trusted
> to generalize rather than just memorize.

Selected Track 02 loss class: **card-testing / BIN-enumeration payment
fraud**. This document explains why the project's dataset architecture
looks the way it does, what was investigated and rejected, and — most
importantly — what is honestly *not yet done* and why.

## 1. Environment constraint (read this first)

This section was produced with network access limited to
`pypi.org`, `npmjs.org`, and `github.com`/`codeload.github.com` (plus a
few OS package mirrors). **`kaggle.com` and `federalreserve.gov` were not
reachable.** Concretely, this means:

- IEEE-CIS, the ULB `creditcard.csv`, and PaySim are all Kaggle-hosted and
  **could not be downloaded** in the environment that did this audit.
- The Federal Reserve's CardSim simulator is hosted on
  `federalreserve.gov` and was likewise unreachable.
- The Sparkov *generator* (source code, not a pre-generated CSV) is on
  GitHub and is technically reachable, but was not integrated in this
  pass — see §6.

**No results below are fabricated for datasets that could not be
accessed.** Where a dataset is discussed, it is discussed based on public
documentation (verified via web search), not by having actually run it
through this pipeline. If you obtain the IEEE-CIS CSVs yourself, drop
`train_transaction.csv` (and optionally `train_identity.csv`) into
`data/external/ieee-cis/` and see §5 for what would need to be built to
consume them — that ingestion code does not exist yet in this repo.

## 2. Datasets investigated

| Dataset | Type | Access from this environment | Fit for card-testing/BIN-enumeration |
|---|---|---|---|
| **Project's own synthetic generator** (`simulator/generate_threat_data.py`) | Controlled, purpose-built | Already in repo | **Direct** — the only dataset here that actually encodes the loss class (see §3) |
| **IEEE-CIS Fraud Detection** | Real-world (Vesta e-commerce), 590,540 txns, 3.5% fraud, 431 mostly-anonymized features | Kaggle — blocked | Indirect only — `isFraud` is a generic fraud label, not BIN-enumeration; card/device identity fields are pre-hashed/pre-aggregated by Vesta, so raw per-device attempt sequences can't be reconstructed |
| **Sparkov (generator)** | Simulated, GitHub-hosted generator; the common pre-generated Kaggle CSV run is ~1.3M rows / 5.7% fraud | Generator: reachable via GitHub. Pre-generated CSV: Kaggle, blocked | Partial — models general per-customer-profile spend fraud, not automated card-testing bursts, without custom profile configuration |
| **Federal Reserve CardSim** | Simulated, Bayesian, calibrated to Fed consumer-payment survey data | federalreserve.gov — blocked | Unclear/unlikely — calibrated to payment *choice* behavior, not attack automation |
| **ULB `creditcard.csv`** | Real-world (European cardholders, 2013), ~284,807 txns, ~0.17% fraud, PCA-anonymized `V1-V28` only | Kaggle — blocked | No — no device/card identifiers at all; can't build velocity or repeated-attempt features |
| **PaySim** | Simulated mobile-money transfers (not card payments), ~6.3M rows | Kaggle — blocked | No — wrong domain entirely (mobile money cash-out/transfer, not card-not-present testing) |

## 3. Why the synthetic generator remains primary

`simulator/generate_threat_data.py` is the only dataset in this table
that was purpose-built to encode BIN-enumeration: `bin_enumeration` rows
literally use `pan_token = f"411111{i:010d}"` — a fixed BIN prefix with a
sequential distinct card number per attempt, drawn from a small pool of
device fingerprints/IPs. That's the textbook attack shape. No amount of
real-world *general* fraud data (IEEE-CIS, ULB) can substitute for this,
because none of them label transactions by attack mechanism — they label
by fraud/not-fraud outcome. Relabeling a generic `isFraud=1` row as
"BIN-enumeration" would be exactly the kind of fabrication Part 28 of the
brief prohibits, so it is not done here.

This does **not** mean the synthetic dataset is claimed to represent
real-world fraud prevalence, volume, or noise characteristics — it
explicitly does not (see MODEL_CARD.md §3, §6). Its role is **controlled,
attack-specific evaluation**, not a real-world benchmark.

## 4. What was rejected, and why

- **ULB and PaySim are dropped from further consideration.** ULB has no
  identifiers to build velocity/repeated-attempt features on; PaySim
  models an entirely different transaction domain (mobile money transfer,
  not card payments). Neither can represent this loss class even loosely,
  independent of the Kaggle-access problem.
- **Merging any dataset into one dataframe for a "combined accuracy"
  number was rejected outright**, per the brief's own instruction and
  general good practice — label definitions, feature availability, and
  base rates are incompatible across these sources, so a merged number
  would be meaningless. Every dataset, if added, would be evaluated and
  reported **separately**.

## 5. IEEE-CIS integration (now implemented — update, supersedes the sketch below)

The raw CSVs (`train_transaction.csv`, `train_identity.csv`) were manually
supplied and placed under `data/external/ieee-cis/`. Per the conclusion at
the end of this section (unchanged from the original sketch): IEEE-CIS is
**not** forced into the synthetic model's 6-column BIN-enumeration feature
vector. Instead it has its own schema, its own feature engineering, its own
model, and its own metrics report — all in a separate module set:

- `risk_engine/ieee_cis_schema.py` — the IEEE-CIS-specific feature contract
  (analogous to `feature_schema.py`, but a different set of columns).
- `risk_engine/ieee_cis_features.py` — loads the two raw CSVs, merges on
  `TransactionID`, engineers `amt_log`/`is_small_amount`/`email_match`/
  `has_identity`, and writes `data/processed/ieee_cis/ieee_cis_features.csv`.
- `risk_engine/ieee_cis_train.py` — trains a `HistGradientBoostingClassifier`
  on a **chronological** 60/20/20 split (by `TransactionDT`, not random and
  not device-grouped — see that file's docstring for why), selects a
  threshold on VALIDATION only (argmax F1; no INR cost assumptions are
  invented for this dataset), and reports TEST metrics exactly once.

Run with `python3 risk_engine/ieee_cis_features.py && python3
risk_engine/ieee_cis_train.py`. Results land in
`data/processed/ieee_cis/ieee_cis_metrics.json` and are **not** merged into
`model_metrics.json` (the synthetic model's file) or read by
`backend/main.py`'s `/predict` endpoint — this benchmark is offline/report-
only, not wired into the live decision path, exactly per the "never forced
into the same feature vector" conclusion below.

Below is the original design sketch, kept for the methodology reasoning:

| Current feature | IEEE-CIS availability |
|---|---|
| `amount_log` | Directly available (`TransactionAmt`) |
| `velocity_1h` | **Not directly derivable** — no true per-device rolling-window primitive is exposed; the `C1-C14` columns are Vesta's own pre-computed counting features (semantics undocumented), not raw event streams |
| `distinct_cards_1h` | **Not derivable** — `card1-6` are anonymized/hashed by Vesta already; building a causal, leak-safe sliding-window distinct-card count on top of an already-aggregated, undocumented anonymization scheme would not be defensible |
| `cvv_failure_rate` | **Not available** — no CVV-result field is present in the public schema |
| `geo_mismatch` | Approximatable via `addr1`/`addr2` vs. card-issuing-region proxies, but Vesta does not document these precisely enough to reconstruct the same semantics as the synthetic feature |
| `is_small_amount` | Directly derivable (threshold on `TransactionAmt`) |

**Conclusion if this is ever built out:** IEEE-CIS would only ever
support 2 of the 6 current features directly. The scientifically honest
path (per Part 6 of the brief) is a **separate, IEEE-CIS-specific
feature schema** for a general fraud-robustness benchmark, evaluated and
reported on its own — never forced into the same feature vector as the
attack-specific synthetic model, and never described as evidence about
BIN-enumeration detection specifically.

## 6. Sparkov generator (not yet run)

`namebrandon/Sparkov_Data_Generation` is GitHub-hosted and reachable, so
this is the one external option that could actually be exercised inside
this environment without waiting on a manual file upload. It has not
been run in this pass. If pursued, its value would be narrow and
specific: an **independently-coded simulator's opinion on whether
amount/timing-based generalization holds**, not a BIN-enumeration
benchmark — Sparkov's generator models per-customer-profile spending
fraud, not automated card-testing bursts, so it would need non-trivial
profile-config changes to represent this loss class at all.

## 7. Summary

| Dataset | Status |
|---|---|
| Synthetic attack generator | **Primary, in active use** — the only one that represents the selected loss class |
| IEEE-CIS | **Integrated as a separate real-world benchmark** (§5) — own schema, own model (`HistGradientBoostingClassifier`), own chronologically-split metrics report. Test-set result: precision 0.467 / recall 0.433 / ROC-AUC 0.870 / AUC-PR 0.451 at the validation-selected threshold (see `data/processed/ieee_cis/ieee_cis_metrics.json` for exact, reproducible numbers — treat that file as the source of truth over any figure quoted here). Not wired into `/predict`; offline report only |
| Sparkov | Not integrated. Technically reachable but not attempted this pass |
| CardSim, ULB, PaySim | Not pursued — wrong domain, no usable identifiers, or unreachable, independent of relevance |

The honest current state is: **one rigorously-built, clearly-scoped
synthetic benchmark for the selected loss class (card-testing/BIN-
enumeration)**, now paired with **one separate, real-world general-fraud
benchmark on IEEE-CIS**, reported on its own terms and never blended with
the first. The IEEE-CIS numbers say something about how well a supervised
gradient-boosted model generalizes to real e-commerce fraud on a
chronological split with a bounded, resource-conscious feature set — they
say nothing about, and should not be cited as evidence about, this
project's actual target loss class.
