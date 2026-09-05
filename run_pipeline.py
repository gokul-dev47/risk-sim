#!/usr/bin/env python3
"""One-command reproducibility pipeline.

Run this and nothing else to regenerate every artifact and every number
quoted in MODEL_CARD.md and README.md from scratch:

    python3 run_pipeline.py

Steps: synthetic data generation -> feature engineering -> model training
(RandomForest + IsolationForest) -> naive baseline comparison -> model
diagnostics (calibration, fairness proxy, latency). No live network calls,
no real payment data, nothing offense-capable.
"""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent

STEPS = [
    ("Generating synthetic transaction data", ["simulator/generate_threat_data.py"]),
    ("Engineering leak-safe features", ["risk_engine/feature_engineering.py"]),
    ("Training RandomForest + IsolationForest", ["risk_engine/train_model.py"]),
    ("Comparing against naive rule-based baseline", ["risk_engine/baseline_model.py"]),
    ("Running fixed stress-test battery", ["risk_engine/stress_test.py"]),
    ("Building graph-based identity clustering feature + ablation", ["risk_engine/graph_features.py"]),
    ("Running calibration / fairness-proxy / latency diagnostics", ["risk_engine/model_diagnostics.py"]),
    ("Building threshold business case (Phase A)", ["risk_engine/threshold_business_case.py"]),
    ("Running evasion/adversarial spacing analysis (Phase C)", ["risk_engine/evasion_analysis.py"]),
    (
        "Running adaptive-threshold effectiveness experiment (baseline vs drifted-static vs drifted-adaptive)",
        ["risk_engine/adaptive_effectiveness_experiment.py"],
    ),
    ("Generating dataset & final model comparison reports (Parts 20-21)", ["risk_engine/generate_reports.py"]),
]

# IEEE-CIS real-world benchmark (separate model, separate report — see
# DATASET_STRATEGY.md §4/§7) is OPTIONAL and only runs if the raw CSVs have
# been manually placed under data/external/ieee-cis/. It is intentionally
# excluded from STEPS below (rather than silently run every time) because:
#   (a) it requires ~700MB of externally-supplied data not present in a
#       fresh checkout of this repo, and
#   (b) its results must never be conflated with the synthetic model's
#       numbers above, so it is kept as an explicit, separate invocation:
#     python3 risk_engine/ieee_cis_features.py   # build features once
#     python3 risk_engine/ieee_cis_train.py       # train + evaluate

# Load testing (Phase B) is intentionally NOT part of the default pipeline:
# it takes noticeably longer (800 requests across 4 concurrency levels) and
# spins up the full FastAPI app in-process via ASGITransport, which is a
# meaningfully different kind of step than the fast, deterministic scripts
# above. Run it explicitly when needed:
#   python3 risk_engine/load_test.py


def run_step(title: str, args: list[str]) -> None:
    print("\n" + "=" * 70)
    print(f"STEP: {title}")
    print("=" * 70)
    start = time.time()
    result = subprocess.run([sys.executable, *args], cwd=PROJECT_ROOT)
    elapsed = time.time() - start
    if result.returncode != 0:
        print(f"\n[FAILED] '{title}' exited with code {result.returncode} after {elapsed:.1f}s")
        sys.exit(result.returncode)
    print(f"\n[OK] '{title}' completed in {elapsed:.1f}s")


def main() -> None:
    overall_start = time.time()
    print("Adaptive Payment Threat Intelligence — full pipeline reproduction")
    print("Synthetic data only. No live payment systems are contacted.")

    for title, args in STEPS:
        script_path = PROJECT_ROOT / args[0]
        if not script_path.exists():
            print(f"\n[SKIP] {title}: {script_path} not found yet.")
            continue
        run_step(title, args)

    total = time.time() - overall_start
    print("\n" + "=" * 70)
    print(f"Pipeline complete in {total:.1f}s. Artifacts written to data/processed/.")
    print("Start the API with: python3 -m uvicorn backend.main:app --reload")
    print("=" * 70)


if __name__ == "__main__":
    main()
