"""Shared pytest fixtures.

`/model/load-test` (backend/main.py) only returns data once
`risk_engine/load_test.py` has run and written
`data/processed/load_test_results.json`. Previously this repo relied on
CI step ordering (run_pipeline.py -> load_test.py -> pytest) to guarantee
that file exists before tests run. That made `pytest tests/` on its own
-- the single most natural thing a reviewer or new contributor runs --
fail with a 503 on `test_load_test_results_endpoint`, even though nothing
was actually broken.

This fixture makes the test suite self-sufficient: if the artifact is
missing when tests start, it is generated once, here, rather than being
assumed to already exist.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOAD_TEST_RESULTS_PATH = PROJECT_ROOT / "data" / "processed" / "load_test_results.json"


@pytest.fixture(scope="session", autouse=True)
def ensure_load_test_artifact_exists() -> None:
    """Generate load_test_results.json once per test session if absent.

    Run in a SEPARATE subprocess, not imported in-process. `load_test.py`
    fires real `/predict` calls against the same FastAPI app object that
    other tests exercise via `TestClient`; running it in-process would
    mutate the shared in-memory audit chain and rate limiter that other
    tests assert exact values against (audit_chain.py is explicitly
    in-memory only -- see its module docstring). A subprocess gets its
    own fresh interpreter and module state, so the rest of the suite is
    unaffected, exactly matching how CI already isolates this step.
    """
    if LOAD_TEST_RESULTS_PATH.exists():
        return
    subprocess.run(
        [sys.executable, str(PROJECT_ROOT / "risk_engine" / "load_test.py")],
        cwd=PROJECT_ROOT,
        check=True,
    )
