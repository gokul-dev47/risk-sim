"""FastAPI service for synthetic payment threat scoring.

Loads locally trained artifacts for the fraud-risk engine. Razorpay Test Mode
order creation and server-side payment verification are integrated separately;
no live payments are processed. The service contains no offense-capable logic —
it is strictly a defensive detector, explainer, and drift monitor.
"""

from __future__ import annotations

import json
import os
import sys
import time
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Literal, Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from risk_engine.drift_monitor import compute_drift  # noqa: E402
from risk_engine.explainability import Explainer  # noqa: E402
from risk_engine.rate_limiter import predict_limiter, otp_request_limiter, otp_verify_limiter  # noqa: E402
from risk_engine.otp_engine import otp_engine, MAX_VERIFY_ATTEMPTS, OTP_TTL_SECONDS  # noqa: E402
from risk_engine.audit_chain import audit_chain  # noqa: E402
from risk_engine.cold_start import is_cold_start, cold_start_decision, COLD_START_MIN_HISTORY  # noqa: E402
from risk_engine.evidence_pack import build_evidence_pack  # noqa: E402
from risk_engine.adaptive_thresholds import (
    thresholds_for_drift_status,
    BASE_ALLOW_MAX_PROBABILITY,
    BASE_BLOCK_MIN_PROBABILITY,
)  # noqa: E402
from risk_engine.razorpay_adapter import (
    create_order,
    fetch_order,
    fetch_payment,
    verify_payment_signature,
    RazorpayConfigError,
    RazorpaySDKUnavailableError,
    RAZORPAY_SDK_AVAILABLE,
)  # noqa: E402

MODEL_PATH = PROJECT_ROOT / "data" / "processed" / "threat_rf_model.joblib"
IFOREST_PATH = PROJECT_ROOT / "data" / "processed" / "anomaly_iforest.joblib"
METRICS_PATH = PROJECT_ROOT / "data" / "processed" / "model_metrics.json"

from risk_engine.feature_schema import FEATURE_COLUMNS  # noqa: E402
from risk_engine.canonical_event import (  # noqa: E402
    CanonicalTransactionEvent,
    DeviceHistoryStore,
    derive_live_features,
    from_razorpay_event,
    from_synthetic_row,
)

# Risk probability is P(label=1). Below ALLOW: auto-clear. At or above BLOCK:
# hard decline in this demo. The band in between is a human review queue.
# These are the BASE thresholds used when no drift is detected. See
# risk_engine/adaptive_thresholds.py: the ACTIVE thresholds used by
# decide() are recomputed from the live drift signal and may be tighter
# than these — that recalibration is this system's real adaptive
# mechanism (see DriftStatusResponse.adaptation / PredictResponse
# .thresholds_applied for what was actually used on a given call).
ALLOW_MAX_PROBABILITY = BASE_ALLOW_MAX_PROBABILITY
BLOCK_MIN_PROBABILITY = BASE_BLOCK_MIN_PROBABILITY

DRIFT_BUFFER_SIZE = 300
DRIFT_RECOMPUTE_EVERY_N_PREDICTS = 10

Decision = Literal["ALLOW", "REVIEW", "BLOCK"]
Engine = Literal["ml_fusion", "rule_fallback", "cold_start_rule"]

_model: Optional[object] = None
_iforest: Optional[object] = None
_explainer: Optional[Explainer] = None
_metrics: Optional[dict] = None
_recent_features: deque = deque(maxlen=DRIFT_BUFFER_SIZE)
_recent_predictions: deque = deque(maxlen=200)

# Cached adaptive-threshold state. Recomputed every
# DRIFT_RECOMPUTE_EVERY_N_PREDICTS scored transactions (PSI over the whole
# buffer on every single request would be wasted work) rather than on a
# timer, so it stays exactly aligned with what /drift/status reports.
_active_thresholds = thresholds_for_drift_status("stable")
_predicts_since_drift_check = 0

# --- Circuit breaker state -------------------------------------------------
# `_breaker_forced_open` lets a demo deliberately simulate the ML container
# being unavailable (via POST /system/simulate-failure), matching the
# "graceful degradation" pattern payment infrastructure needs: a risk
# engine must never fail catastrophically and break checkout, and must
# never fail open and allow unrestricted fraud through silently. When the
# breaker is open (forced, or because model loading/inference genuinely
# failed), /predict falls back to a deterministic, transparent rule engine
# instead of a 5xx error or a silent unguarded ALLOW.
_breaker_forced_open: bool = False
_breaker_trip_count: int = 0

_razorpay_orders: dict[str, dict[str, object]] = {}


def _naive_rule_decision(feature_row: dict) -> Decision:
    """Deterministic, dependency-free fallback rule, identical in spirit to
    risk_engine/baseline_model.py's naive_rule_predict, reimplemented here
    as a single-row check with zero ML dependencies so it can never itself
    fail the way a loaded model artifact can.
    """
    is_block = feature_row["is_small_amount"] == 1 and feature_row["velocity_1h"] >= 5
    is_review = feature_row["geo_mismatch"] == 1 and feature_row["cvv_failure_rate"] >= 0.3
    if is_block:
        return "BLOCK"
    if is_review:
        return "REVIEW"
    return "ALLOW"


def _load_artifacts():
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Trained model not found at {MODEL_PATH}")
    model = joblib.load(MODEL_PATH)
    iforest = joblib.load(IFOREST_PATH) if IFOREST_PATH.exists() else None
    metrics = json.loads(METRICS_PATH.read_text(encoding="utf-8")) if METRICS_PATH.exists() else None
    explainer = Explainer(model)
    return model, iforest, explainer, metrics


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model, _iforest, _explainer, _metrics
    try:
        _model, _iforest, _explainer, _metrics = _load_artifacts()
        app.state.model_load_error = None
    except Exception as exc:
        _model = _iforest = _explainer = _metrics = None
        app.state.model_load_error = str(exc)
    yield
    _model = _iforest = _explainer = _metrics = None


app = FastAPI(
    title="Adaptive Payment Threat Intelligence API",
    description=(
        "Defense-only demo API that scores engineered features from synthetic "
        "transactions using a supervised + unsupervised fusion detector, "
        "explains individual decisions with SHAP, and monitors incoming "
        "traffic for distribution drift. Razorpay Test Mode order creation and "
        "server-side payment verification are integrated separately; no live "
        "payments are processed."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://risk-sim.vercel.app",
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class PredictRequest(BaseModel):
    """Six leak-safe features produced by risk_engine/feature_engineering.py."""

    velocity_1h: int = Field(..., ge=0, description="Same-device transactions in the prior hour")
    geo_mismatch: int = Field(..., ge=0, le=1, description="1 if country differs from billing_country")
    cvv_failure_rate: float = Field(
        ..., ge=0.0, le=1.0, description="Historical CVV failure rate for the device"
    )
    amount_log: float = Field(..., ge=0.0, description="log1p(amount) of the synthetic payment")
    is_small_amount: int = Field(..., ge=0, le=1, description="1 if amount <= 10")
    distinct_cards_1h: int = Field(
        ..., ge=0, description="Distinct card_hash values this device attempted in the prior hour"
    )
    transaction_id: Optional[str] = Field(None, description="Optional client-side reference id")
    entity_observed_count: Optional[int] = Field(
        None,
        ge=0,
        description=(
            "Optional: how many prior transactions this card/device has. When "
            "provided and below the cold-start threshold, bypasses the ML model "
            "in favor of a conservative, transparent rule (see risk_engine/cold_start.py) "
            "since velocity/CVV aggregates aren't statistically meaningful yet for "
            "a near-new entity. Omit if unknown — normal ML scoring applies."
        ),
    )


class ExplanationFactor(BaseModel):
    feature: str
    label: str
    value: float
    shap_contribution: float
    direction: str


class Explanation(BaseModel):
    summary: str
    top_factors: list[ExplanationFactor]


class StepUpInfo(BaseModel):
    verification_id: str
    expires_in_seconds: int
    demo_otp: str = Field(
        ...,
        description=(
            "DEMO ONLY: the OTP code is returned directly here because no real "
            "SMS/payment channel is connected. A production system would never "
            "return the code itself, only a delivery confirmation."
        ),
    )
    notice: str = "Demo/simulated verification only — no real SMS or payment service is connected."


class PredictResponse(BaseModel):
    transaction_id: Optional[str] = None
    prediction: int = Field(..., description="0 = normal, 1 = suspected threat (RF only)")
    risk_probability: float = Field(..., ge=0.0, le=1.0, description="RandomForest P(threat)")
    anomaly_score: float = Field(..., description="IsolationForest anomaly score (higher = more anomalous)")
    is_anomaly: bool = Field(..., description="True if IsolationForest flags this as distributionally novel")
    fused_prediction: int = Field(..., description="1 if EITHER RF or IsolationForest flags this transaction")
    decision: Decision
    explanation: Explanation
    engine: Engine = Field(
        "ml_fusion",
        description=(
            "'ml_fusion' = scored by the trained RF+IsolationForest fusion. "
            "'rule_fallback' = the ML path was unavailable and a deterministic "
            "rule engine made the decision instead (circuit breaker open)."
        ),
    )
    degraded_mode: bool = Field(False, description="True if this decision came from the fallback rule engine, not ML.")
    step_up: Optional[StepUpInfo] = Field(
        None, description="Present only for REVIEW decisions: a demo-safe OTP challenge to resolve the review."
    )
    thresholds_applied: Optional[dict] = Field(
        None,
        description=(
            "ALLOW/BLOCK probability cut points actually used for this decision. "
            "Equal to the base thresholds unless the live drift signal has "
            "moved the system into a tightened posture — see "
            "risk_engine/adaptive_thresholds.py and GET /drift/status."
        ),
    )
    notice: str = "Synthetic/demo scoring only. Not connected to any live payment system."


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    iforest_loaded: bool
    model_path: str
    synthetic_data_only: bool = True
    live_payments: bool = False
    detail: Optional[str] = None


class RazorpayOrderRequest(BaseModel):
    amount_inr: float = Field(..., gt=0, description="Order amount in INR")
    receipt: str = Field(..., min_length=1, max_length=40)


class RazorpayOrderResponse(BaseModel):
    order_id: str
    amount: int
    currency: str
    key_id: str


class RazorpayVerifyRequest(BaseModel):
    order_id: str = Field(..., min_length=1)
    payment_id: str = Field(..., min_length=1)
    signature: str = Field(..., min_length=1)


class RazorpayVerifyResponse(BaseModel):
    verified: bool
    payment_id: str
    order_id: str
    payment_status: str
    order_status: str
    amount: int
    currency: str
    test_mode: bool
    message: str


class ErrorResponse(BaseModel):
    error: str
    detail: str


class OtpRequestPayload(BaseModel):
    transaction_id: Optional[str] = None


class OtpConfirmPayload(BaseModel):
    verification_id: str
    code: str


class DriftStatusResponse(BaseModel):
    overall_status: str
    retrain_recommended: bool
    per_feature: dict
    batch_size: int
    thresholds: dict
    note: str = (
        "Computed over the last N scored transactions this session vs. the "
        "training-time reference distribution."
    )
    adaptation: Optional[dict] = Field(
        None,
        description=(
            "The decision-threshold posture currently in effect as a result of "
            "this drift signal. See risk_engine/adaptive_thresholds.py."
        ),
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def decide(risk_probability: float, allow_max: float = ALLOW_MAX_PROBABILITY, block_min: float = BLOCK_MIN_PROBABILITY) -> Decision:
    if risk_probability < allow_max:
        return "ALLOW"
    if risk_probability < block_min:
        return "REVIEW"
    return "BLOCK"


def _refresh_active_thresholds_if_due() -> None:
    """Recompute the drift-driven active thresholds every N scored
    transactions. Cheap PSI recompute over the existing rolling buffer —
    no new data collection, just reusing what /drift/status already
    computes. Logs an audit event only when the resulting posture
    actually changes, so the audit trail shows exactly when/why the
    system got more conservative (and when it relaxed back).
    """
    global _active_thresholds, _predicts_since_drift_check
    _predicts_since_drift_check += 1
    if _predicts_since_drift_check < DRIFT_RECOMPUTE_EVERY_N_PREDICTS:
        return
    _predicts_since_drift_check = 0

    if _metrics is None or "reference_distribution" not in _metrics or len(_recent_features) < 50:
        new_thresholds = thresholds_for_drift_status("stable")
    else:
        batch = pd.DataFrame(list(_recent_features))
        drift_result = compute_drift(_metrics["reference_distribution"], batch)
        new_thresholds = thresholds_for_drift_status(drift_result["overall_status"])

    if new_thresholds.drift_status != _active_thresholds.drift_status:
        audit_chain.append(
            "adaptive_threshold_change",
            {
                "previous_drift_status": _active_thresholds.drift_status,
                "new_drift_status": new_thresholds.drift_status,
                "allow_max_probability": new_thresholds.allow_max_probability,
                "block_min_probability": new_thresholds.block_min_probability,
                "note": new_thresholds.note,
            },
        )
    _active_thresholds = new_thresholds


def _client_key(request: Request) -> str:
    """Prefer an explicit client identifier header (useful for a demo
    frontend with many simulated 'sessions' behind one browser/IP) and
    fall back to the request's source IP.
    """
    explicit = request.headers.get("x-client-id")
    if explicit:
        return f"client:{explicit}"
    client = request.client
    return f"ip:{client.host}" if client else "ip:unknown"


def _maybe_issue_step_up(decision: Decision, transaction_id: Optional[str]) -> Optional[StepUpInfo]:
    """For REVIEW decisions only: issue a demo-safe OTP challenge so the
    transaction has a path to resolve into ALLOW or BLOCK, instead of
    sitting in limbo. Never issued for ALLOW/BLOCK.
    """
    if decision != "REVIEW":
        return None
    challenge = otp_engine.request_otp(transaction_id)
    audit_chain.append(
        "otp_issued",
        {
            "transaction_id": transaction_id,
            "verification_id": challenge.verification_id,
            "reason": "review_decision_step_up",
        },
    )
    return StepUpInfo(
        verification_id=challenge.verification_id,
        expires_in_seconds=OTP_TTL_SECONDS,
        demo_otp=challenge.code,
    )


def _cold_start_predict_response(
    feature_row: dict, transaction_id: Optional[str], entity_observed_count: int
) -> "PredictResponse":
    """Bypasses ML scoring entirely for a thin-history entity. See
    risk_engine/cold_start.py for why this is a deliberate, disclosed
    decision rather than a fallback of last resort — the ML model's
    probability isn't actually meaningful here.
    """
    decision, reasoning = cold_start_decision(feature_row, entity_observed_count)
    explanation = Explanation(summary=reasoning, top_factors=[])
    step_up = _maybe_issue_step_up(decision, transaction_id)

    response = PredictResponse(
        transaction_id=transaction_id,
        prediction=1 if decision != "ALLOW" else 0,
        risk_probability=0.0,
        anomaly_score=0.0,
        is_anomaly=False,
        fused_prediction=1 if decision != "ALLOW" else 0,
        decision=decision,
        explanation=explanation,
        engine="cold_start_rule",
        degraded_mode=False,
        step_up=step_up,
    )

    _recent_features.append(feature_row)
    _recent_predictions.append(
        {
            "transaction_id": transaction_id,
            "decision": decision,
            "risk_probability": 0.0,
            "is_anomaly": False,
            "explanation_summary": reasoning,
            "engine": "cold_start_rule",
        }
    )
    audit_chain.append(
        "predict",
        {
            "transaction_id": transaction_id,
            "decision": decision,
            "risk_probability": 0.0,
            "is_anomaly": False,
            "engine": "cold_start_rule",
            "entity_observed_count": entity_observed_count,
        },
    )
    return response


def _fallback_predict_response(feature_row: dict, transaction_id: Optional[str], reason: str) -> "PredictResponse":
    """Deterministic rule-engine fallback used when the circuit breaker is
    open (forced for a demo, or tripped by a genuine inference failure).
    Never raises: this is the last line of defense that keeps /predict
    returning a usable, transparent decision instead of a 5xx error or a
    silent unguarded ALLOW.
    """
    global _breaker_trip_count
    _breaker_trip_count += 1

    decision = _naive_rule_decision(feature_row)
    explanation = Explanation(
        summary=(
            f"ML engine unavailable ({reason}) — decision made by the deterministic "
            "fallback rule engine, not the trained model."
        ),
        top_factors=[],
    )
    step_up = _maybe_issue_step_up(decision, transaction_id)
    response = PredictResponse(
        transaction_id=transaction_id,
        prediction=1 if decision != "ALLOW" else 0,
        risk_probability=0.0,
        anomaly_score=0.0,
        is_anomaly=False,
        fused_prediction=1 if decision != "ALLOW" else 0,
        decision=decision,
        explanation=explanation,
        engine="rule_fallback",
        degraded_mode=True,
        step_up=step_up,
    )

    _recent_features.append(feature_row)
    _recent_predictions.append(
        {
            "transaction_id": transaction_id,
            "decision": decision,
            "risk_probability": 0.0,
            "is_anomaly": False,
            "explanation_summary": explanation.summary,
            "engine": "rule_fallback",
        }
    )
    audit_chain.append(
        "predict",
        {
            "transaction_id": transaction_id,
            "decision": decision,
            "risk_probability": 0.0,
            "is_anomaly": False,
            "engine": "rule_fallback",
            "reason": reason,
        },
    )
    return response


def _require_model():
    if _model is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Model is not loaded. Train locally with risk_engine/train_model.py "
                "and keep data/processed/threat_rf_model.joblib on disk."
            ),
        )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    loaded = _model is not None
    return HealthResponse(
        status="ok" if loaded else "degraded",
        model_loaded=loaded,
        iforest_loaded=_iforest is not None,
        model_path=str(MODEL_PATH),
        detail=None if loaded else getattr(app.state, "model_load_error", "Model is not loaded"),
    )


@app.post(
    "/predict",
    response_model=PredictResponse,
    responses={429: {"model": ErrorResponse}, 503: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
def predict(payload: PredictRequest, request: Request) -> PredictResponse:
    client_key = _client_key(request)
    allowed, remaining, retry_after = predict_limiter.check(client_key)
    if not allowed:
        audit_chain.append(
            "rate_limit_triggered",
            {"endpoint": "/predict", "client_key": client_key, "retry_after_seconds": round(retry_after, 1)},
        )
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded for /predict. Retry after {retry_after:.1f}s.",
            headers={"Retry-After": str(int(retry_after) + 1)},
        )

    feature_row = {
        "velocity_1h": payload.velocity_1h,
        "geo_mismatch": payload.geo_mismatch,
        "cvv_failure_rate": payload.cvv_failure_rate,
        "amount_log": payload.amount_log,
        "is_small_amount": payload.is_small_amount,
        "distinct_cards_1h": payload.distinct_cards_1h,
    }

    # Cold-start check happens BEFORE the circuit breaker / ML path: this
    # isn't a fallback for when something is broken, it's a deliberate
    # choice not to trust the model's probability on an entity too new
    # for its aggregate features to mean anything yet.
    if is_cold_start(payload.entity_observed_count):
        return _cold_start_predict_response(feature_row, payload.transaction_id, payload.entity_observed_count)

    # Circuit breaker: deliberately forced open for a demo, OR the model
    # was never loaded (startup failure) — route straight to the
    # deterministic fallback instead of erroring or attempting inference.
    if _breaker_forced_open:
        return _fallback_predict_response(feature_row, payload.transaction_id, "circuit breaker manually opened")
    if _model is None:
        return _fallback_predict_response(feature_row, payload.transaction_id, "model not loaded")

    try:
        features = pd.DataFrame([feature_row], columns=FEATURE_COLUMNS)
        prediction = int(_model.predict(features)[0])
        risk_probability = float(_model.predict_proba(features)[0, 1])

        is_anomaly = False
        anomaly_score = 0.0
        if _iforest is not None:
            raw_pred = int(_iforest.predict(features)[0])  # -1 anomaly, 1 normal
            is_anomaly = raw_pred == -1
            # decision_function: lower (more negative) = more anomalous.
            # Flip sign so higher = more anomalous, which is more intuitive
            # for a UI to display as a "risk-like" score.
            anomaly_score = float(-_iforest.decision_function(features)[0])

        fused_prediction = int(prediction == 1 or is_anomaly)

        explanation_raw = _explainer.explain(feature_row) if _explainer else {
            "summary": "Explainability unavailable.",
            "top_factors": [],
        }

        if not (0.0 <= risk_probability <= 1.0):
            raise ValueError("Model returned an invalid probability.")

    except Exception as exc:
        # Genuine inference failure (corrupted artifact, unexpected input
        # shape, etc.) trips the breaker for this request only and falls
        # back to the rule engine rather than surfacing a 500 to a
        # checkout flow. The exception is still logged server-side.
        print(f"[circuit-breaker] /predict inference failed, falling back to rule engine: {exc}")
        return _fallback_predict_response(feature_row, payload.transaction_id, f"inference error: {exc}")

    _refresh_active_thresholds_if_due()
    decision = decide(
        risk_probability,
        allow_max=_active_thresholds.allow_max_probability,
        block_min=_active_thresholds.block_min_probability,
    )
    if is_anomaly and decision == "ALLOW":
        # Fusion never silently allows a transaction the anomaly detector
        # flagged; at minimum it gets escalated to human review.
        decision = "REVIEW"

    step_up = _maybe_issue_step_up(decision, payload.transaction_id)

    # Track for live drift monitoring.
    _recent_features.append(feature_row)
    _recent_predictions.append(
        {
            "transaction_id": payload.transaction_id,
            "decision": decision,
            "risk_probability": risk_probability,
            "is_anomaly": is_anomaly,
            "explanation_summary": explanation_raw.get("summary", ""),
            "engine": "ml_fusion",
        }
    )
    audit_chain.append(
        "predict",
        {
            "transaction_id": payload.transaction_id,
            "decision": decision,
            "risk_probability": risk_probability,
            "is_anomaly": is_anomaly,
            "engine": "ml_fusion",
        },
    )

    return PredictResponse(
        transaction_id=payload.transaction_id,
        prediction=prediction,
        risk_probability=round(risk_probability, 6),
        anomaly_score=round(anomaly_score, 6),
        is_anomaly=is_anomaly,
        fused_prediction=fused_prediction,
        decision=decision,
        explanation=Explanation(**explanation_raw),
        engine="ml_fusion",
        degraded_mode=False,
        step_up=step_up,
        thresholds_applied={
            "allow_max_probability": _active_thresholds.allow_max_probability,
            "block_min_probability": _active_thresholds.block_min_probability,
            "adaptation_active": _active_thresholds.adaptation_active,
        },
    )


class DecisionDirective(BaseModel):
    """Structured, machine-actionable follow-up for a decision, so a caller
    doesn't have to hardcode 'if decision == REVIEW then show OTP' logic
    of its own -- the backend states the required action explicitly.
    """

    action: Literal["ALLOW_PAYMENT", "STEP_UP", "BLOCK_PAYMENT"]
    method: Optional[str] = Field(
        None, description="Step-up method, e.g. 'OTP' (simulated/demo — see StepUpInfo.notice)."
    )
    reason_codes: list[str] = Field(default_factory=list)


def _reason_codes_for(feature_row: dict, decision: Decision, is_anomaly: bool) -> list[str]:
    """Small, deterministic, auditable reason-code vocabulary derived
    directly from the same feature values the model scored -- not a
    second, independent judgment, just a human-legible restatement of
    which raw signals were elevated on this specific transaction.
    """
    codes: list[str] = []
    if feature_row["cvv_failure_rate"] >= 0.3:
        codes.append("HIGH_CVV_FAILURE_RATE")
    if feature_row["geo_mismatch"] == 1:
        codes.append("GEO_MISMATCH")
    if feature_row["velocity_1h"] >= 10:
        codes.append("HIGH_VELOCITY")
    if feature_row["distinct_cards_1h"] >= 3:
        codes.append("MULTIPLE_DISTINCT_CARDS")
    if feature_row["is_small_amount"] == 1 and feature_row["velocity_1h"] >= 5:
        codes.append("CARD_TESTING_PATTERN")
    if is_anomaly:
        codes.append("NOVEL_ANOMALY_DETECTED")
    if decision == "ALLOW" and not codes:
        codes.append("NO_ELEVATED_SIGNALS")
    return codes


def _directive_for(decision: Decision, reason_codes: list[str], step_up: Optional[StepUpInfo]) -> DecisionDirective:
    if decision == "BLOCK":
        return DecisionDirective(action="BLOCK_PAYMENT", reason_codes=reason_codes)
    if decision == "REVIEW":
        return DecisionDirective(
            action="STEP_UP",
            method="OTP" if step_up is not None else None,
            reason_codes=reason_codes,
        )
    return DecisionDirective(action="ALLOW_PAYMENT", reason_codes=reason_codes)


class SimulateAttackResponse(BaseModel):
    """Response for POST /api/v1/simulate-attack.

    Deliberately NOT a separate model or a separate code path: this
    endpoint calls the SAME `predict()` function used by POST /predict
    (see the handler below), then adds a structured `directive` /
    `reason_codes` / policy-context wrapper on top of the identical
    PredictResponse fields. There is no special-cased "demo" scoring
    logic here and no JavaScript-side ML -- pasting arbitrary valid JSON
    into this endpoint exercises the exact RandomForest + IsolationForest
    + fusion + cost-aware-threshold + SHAP + audit pipeline that a real
    checkout transaction would.
    """

    transaction_id: Optional[str] = None
    timestamp: float
    risk_score: float = Field(..., description="RandomForest P(threat) on the deployed model's output scale.")
    risk_score_type: str = Field(
        "model_score",
        description=(
            "'model_score', not 'calibrated_probability': see /model/diagnostics "
            "for the Brier-score calibration check this label is based on."
        ),
    )
    rf_signal: dict
    isolation_forest_signal: dict
    fusion: dict
    decision: Decision
    directive: DecisionDirective
    reason_codes: list[str]
    top_risk_factors: list[ExplanationFactor]
    shap_explanation: Explanation
    active_thresholds: dict
    adaptive_posture: dict
    engine: Engine
    degraded_mode: bool
    step_up: Optional[StepUpInfo] = None
    audit_reference: Optional[dict] = None


@app.post("/api/v1/simulate-attack", response_model=SimulateAttackResponse)
def simulate_attack(payload: PredictRequest, request: Request) -> SimulateAttackResponse:
    """Jury/live transaction injection endpoint (Phase 2/3): paste raw
    JSON matching PredictRequest's schema and it is scored by the exact
    same pipeline as a real checkout transaction -- see docstring on
    SimulateAttackResponse. This function does not duplicate any scoring
    logic; it calls `predict()` directly and republishes its fields in a
    richer, more explicitly structured shape for a jury/ops UI.
    """
    base = predict(payload, request)  # the SAME function backing POST /predict

    feature_row = {
        "velocity_1h": payload.velocity_1h,
        "geo_mismatch": payload.geo_mismatch,
        "cvv_failure_rate": payload.cvv_failure_rate,
        "amount_log": payload.amount_log,
        "is_small_amount": payload.is_small_amount,
        "distinct_cards_1h": payload.distinct_cards_1h,
    }
    reason_codes = _reason_codes_for(feature_row, base.decision, base.is_anomaly)
    directive = _directive_for(base.decision, reason_codes, base.step_up)

    thresholds = base.thresholds_applied or {
        "allow_max_probability": _active_thresholds.allow_max_probability,
        "block_min_probability": _active_thresholds.block_min_probability,
        "adaptation_active": _active_thresholds.adaptation_active,
    }
    adaptive_posture = {
        "drift_status": _active_thresholds.drift_status,
        "adaptation_active": _active_thresholds.adaptation_active,
        "note": _active_thresholds.note,
    }

    audit_entries = audit_chain.recent(limit=1)
    audit_reference = (
        {"sequence": audit_entries[0]["sequence"], "entry_hash": audit_entries[0]["entry_hash"]}
        if audit_entries
        else None
    )

    return SimulateAttackResponse(
        transaction_id=base.transaction_id,
        timestamp=time.time(),
        risk_score=base.risk_probability,
        risk_score_type="model_score",
        rf_signal={"prediction": base.prediction, "probability": base.risk_probability},
        isolation_forest_signal={"is_anomaly": base.is_anomaly, "anomaly_score": base.anomaly_score},
        fusion={"fused_prediction": base.fused_prediction},
        decision=base.decision,
        directive=directive,
        reason_codes=reason_codes,
        top_risk_factors=base.explanation.top_factors,
        shap_explanation=base.explanation,
        active_thresholds=thresholds,
        adaptive_posture=adaptive_posture,
        engine=base.engine,
        degraded_mode=base.degraded_mode,
        step_up=base.step_up,
        audit_reference=audit_reference,
    )


class CanonicalEventRequest(BaseModel):
    """Raw, source-agnostic transaction envelope -- see
    risk_engine/canonical_event.py's module docstring for the full
    contract and its honesty constraints (notably: NOT for IEEE-CIS
    events, which are refused with a 422 here and scored by their own
    separate model instead).
    """

    transaction_id: str
    timestamp: str = Field(..., description="ISO 8601, e.g. '2026-09-05T12:00:00'")
    amount: float = Field(..., ge=0.0)
    currency: str = "INR"
    payment_method: Optional[str] = None
    account_id: Optional[str] = None
    card_token: Optional[str] = None
    device_id: Optional[str] = None
    ip_address: Optional[str] = None
    country: Optional[str] = None
    billing_country: Optional[str] = None
    cvv_result: Optional[str] = None
    merchant: Optional[str] = None
    source_system: Literal["synthetic", "razorpay_test_mode"] = Field(
        "synthetic",
        description=(
            "'ieee_cis' is intentionally NOT accepted here -- see "
            "risk_engine/canonical_event.py. IEEE-CIS transactions are scored "
            "by the separate, independently-evaluated model in "
            "risk_engine/ieee_cis_train.py, not this live path."
        ),
    )


_canonical_history = DeviceHistoryStore()


@app.post("/api/v1/score-canonical-event", response_model=SimulateAttackResponse)
def score_canonical_event(payload: CanonicalEventRequest, request: Request) -> SimulateAttackResponse:
    """Phase 1: canonical transaction event contract, end to end.

    RAW JSON -> CanonicalTransactionEvent -> derive_live_features
    (online, in-memory, per-device rolling history -- see
    risk_engine/canonical_event.py for exactly what this does and does
    NOT guarantee relative to the offline training pipeline) ->
    PredictRequest -> the SAME predict() function backing /predict and
    /api/v1/simulate-attack -> RF + IsolationForest + fusion + cost-aware
    decision -> SHAP -> audit event -> JSON response.

    This is the live-scoring path Phase 1 describes for the two sources
    where it is semantically honest to run it (synthetic, Razorpay Test
    Mode). It deliberately does not exist for IEEE-CIS.
    """
    try:
        ts = datetime.fromisoformat(payload.timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid timestamp: {exc}") from exc

    event = CanonicalTransactionEvent(
        transaction_id=payload.transaction_id,
        timestamp=ts,
        amount=payload.amount,
        currency=payload.currency,
        payment_method=payload.payment_method,
        account_id=payload.account_id,
        card_token=payload.card_token,
        device_id=payload.device_id,
        ip_address=payload.ip_address,
        country=payload.country,
        billing_country=payload.billing_country,
        cvv_result=payload.cvv_result,
        merchant=payload.merchant,
        source_system=payload.source_system,
        raw=payload.model_dump(),
    )

    derived = derive_live_features(event, _canonical_history)
    predict_payload = PredictRequest(transaction_id=event.transaction_id, **derived)

    response = simulate_attack(predict_payload, request)
    return response


@app.get("/razorpay/status")
def razorpay_status() -> dict:
    """Lets the frontend check Razorpay Test Mode availability BEFORE
    rendering the checkout UI, instead of discovering it only via a
    failed order-creation call. Distinguishes the two independent
    reasons Razorpay can be unavailable (SDK not installed vs.
    credentials not configured) so the message is actionable rather than
    a generic 'something went wrong'.
    """
    if not RAZORPAY_SDK_AVAILABLE:
        return {
            "available": False,
            "reason": "sdk_not_installed",
            "detail": "The 'razorpay' Python package is not installed in this backend.",
        }
    key_id = os.getenv("RAZORPAY_KEY_ID")
    key_secret = os.getenv("RAZORPAY_KEY_SECRET")
    if not key_id or not key_secret:
        return {
            "available": False,
            "reason": "credentials_not_configured",
            "detail": "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set. See .env.example.",
        }
    return {"available": True, "reason": None, "detail": "Razorpay Test Mode is configured."}


@app.post("/razorpay/order", response_model=RazorpayOrderResponse)
def razorpay_order(payload: RazorpayOrderRequest) -> RazorpayOrderResponse:
    """Create a Razorpay Test Mode order and register it server-side."""
    try:
        order = create_order(
            amount_inr=payload.amount_inr,
            receipt=payload.receipt,
            notes={
                "source": "risk-sim",
                "environment": "test",
            },
        )

        _razorpay_orders[order["id"]] = {
            "amount": int(order["amount"]),
            "currency": order["currency"],
            "receipt": payload.receipt,
        }

        key_id = os.getenv("RAZORPAY_KEY_ID")
        if not key_id:
            raise RazorpayConfigError("RAZORPAY_KEY_ID is not configured.")

        audit_chain.append(
            "razorpay_order_created",
            {
                "order_id": order["id"],
                "amount": int(order["amount"]),
                "currency": order["currency"],
                "receipt": payload.receipt,
                "environment": "test",
            },
        )

        return RazorpayOrderResponse(
            order_id=order["id"],
            amount=int(order["amount"]),
            currency=order["currency"],
            key_id=key_id,
        )

    except RazorpaySDKUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RazorpayConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        print(f"[razorpay] order creation failed: {exc}")
        raise HTTPException(
            status_code=502,
            detail="Unable to create Razorpay Test Mode order.",
        ) from exc


@app.post("/razorpay/verify", response_model=RazorpayVerifyResponse)
def razorpay_verify(payload: RazorpayVerifyRequest) -> RazorpayVerifyResponse:
    """Verify a Razorpay Test Mode payment server-side."""
    expected_order = _razorpay_orders.get(payload.order_id)

    if expected_order is None:
        raise HTTPException(
            status_code=400,
            detail="Unknown Razorpay order. Create the order through this server first.",
        )

    try:
        razorpay_order = fetch_order(payload.order_id)

        if razorpay_order.get("id") != payload.order_id:
            raise HTTPException(status_code=400, detail="Razorpay order identity mismatch.")

        if int(razorpay_order.get("amount", -1)) != int(expected_order["amount"]):
            raise HTTPException(status_code=400, detail="Razorpay order amount mismatch.")

        if razorpay_order.get("currency") != expected_order["currency"]:
            raise HTTPException(status_code=400, detail="Razorpay order currency mismatch.")

        signature_valid = verify_payment_signature(
            order_id=payload.order_id,
            payment_id=payload.payment_id,
            signature=payload.signature,
        )

        if not signature_valid:
            audit_chain.append(
                "razorpay_payment_rejected",
                {
                    "order_id": payload.order_id,
                    "payment_id": payload.payment_id,
                    "reason": "invalid_signature",
                    "environment": "test",
                },
            )
            raise HTTPException(status_code=400, detail="Payment signature verification failed.")

        payment = fetch_payment(payload.payment_id)

        if payment.get("order_id") != payload.order_id:
            raise HTTPException(status_code=400, detail="Payment does not belong to the verified order.")

        payment_status = str(payment.get("status", "unknown"))
        order_status = str(razorpay_order.get("status", "unknown"))

        audit_chain.append(
            "razorpay_payment_verified",
            {
                "order_id": payload.order_id,
                "payment_id": payload.payment_id,
                "payment_status": payment_status,
                "order_status": order_status,
                "amount": int(payment.get("amount", expected_order["amount"])),
                "currency": payment.get("currency", expected_order["currency"]),
                "environment": "test",
                "signature_verified": True,
            },
        )

        return RazorpayVerifyResponse(
            verified=True,
            payment_id=payload.payment_id,
            order_id=payload.order_id,
            payment_status=payment_status,
            order_status=order_status,
            amount=int(payment.get("amount", expected_order["amount"])),
            currency=str(payment.get("currency", expected_order["currency"])),
            test_mode=True,
            message="Razorpay Test Mode payment verified successfully.",
        )

    except HTTPException:
        raise
    except RazorpaySDKUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RazorpayConfigError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        print(f"[razorpay] payment verification failed: {exc}")
        raise HTTPException(status_code=502, detail="Unable to verify Razorpay payment.") from exc


@app.get("/system/status")
def system_status() -> dict:
    """Circuit breaker state, for a frontend badge:
    🟢 AI ENGINE ONLINE  vs  🔴 FALLBACK MODE — RULE ENGINE ACTIVE
    """
    return {
        "breaker_open": _breaker_forced_open or _model is None,
        "forced_open": _breaker_forced_open,
        "model_loaded": _model is not None,
        "fallback_triggers_this_session": _breaker_trip_count,
    }


@app.post("/system/simulate-failure")
def simulate_failure() -> dict:
    """Deliberately opens the circuit breaker so every subsequent /predict
    call routes to the deterministic rule-engine fallback, regardless of
    whether the real model is healthy. Intended for a live demo: trip
    this mid-presentation to show graceful degradation, then call
    /system/restore to close it again. This never crashes the process —
    it is a controlled, reversible simulation of the ML path being down.
    """
    global _breaker_forced_open
    _breaker_forced_open = True
    return {"status": "circuit breaker opened", "breaker_open": True}


@app.post("/system/restore")
def restore_system() -> dict:
    """Closes the circuit breaker, returning /predict to normal ML-fusion
    scoring.
    """
    global _breaker_forced_open
    _breaker_forced_open = False
    return {"status": "circuit breaker closed", "breaker_open": False}


@app.get("/model/metrics")
def model_metrics() -> dict:
    """Full held-out evaluation: honest precision/recall/F1/ROC-AUC, confusion
    matrix, per-attack-subtype recall, isolation forest + fusion metrics, and
    a full threshold sweep for the cost simulator.
    """
    if _metrics is None:
        raise HTTPException(status_code=503, detail="Metrics not available. Run risk_engine/train_model.py.")
    return _metrics


@app.get("/model/cost-curve")
def cost_curve() -> dict:
    """Just the threshold sweep, shaped for a chart: precision, recall, and
    net financial impact (fraud prevented minus false-positive review cost)
    at each candidate decision threshold. Also surfaces the single
    threshold that maximizes net_impact_inr, so the UI can show a concrete
    recommendation instead of making the person read a whole curve.
    """
    if _metrics is None or "threshold_sweep" not in _metrics:
        raise HTTPException(status_code=503, detail="Cost curve not available. Run risk_engine/train_model.py.")

    sweep = _metrics["threshold_sweep"]
    optimal = max(sweep, key=lambda point: point["net_impact_inr"]) if sweep else None

    return {
        "sweep": sweep,
        "current_allow_max": ALLOW_MAX_PROBABILITY,
        "current_block_min": BLOCK_MIN_PROBABILITY,
        "optimal_threshold": optimal,
        "optimal_threshold_note": (
            "Threshold that maximizes net_impact_inr (fraud prevented minus "
            "false-positive review cost) over the held-out sweep, given the "
            "stated cost assumptions. Not a live recommendation — recompute "
            "after any retrain, and treat the underlying INR assumptions as "
            "editable business inputs, not fixed constants."
            if optimal
            else None
        ),
        "assumptions": {
            "cost_per_false_positive_inr": _metrics.get("cost_per_false_positive_inr"),
            "avg_fraud_loss_prevented_inr": _metrics.get("avg_fraud_loss_prevented_inr"),
        },
    }


@app.get("/drift/status", response_model=DriftStatusResponse)
def drift_status() -> DriftStatusResponse:
    """Population-stability-index drift check over the rolling window of
    the most recently scored transactions THIS SESSION, compared against
    the training-time reference distribution. This is what makes the
    system adaptive in an honest, defense-only way: it detects when real
    incoming traffic no longer looks like what the model was trained on,
    rather than simulating an evolving attacker.
    """
    if _metrics is None or "reference_distribution" not in _metrics:
        raise HTTPException(status_code=503, detail="Reference distribution not available.")
    if len(_recent_features) < 50:
        return DriftStatusResponse(
            overall_status="insufficient_data",
            retrain_recommended=False,
            per_feature={},
            batch_size=len(_recent_features),
            thresholds={"watch": 0.10, "retrain": 0.25},
            adaptation={
                "allow_max_probability": _active_thresholds.allow_max_probability,
                "block_min_probability": _active_thresholds.block_min_probability,
                "adaptation_active": _active_thresholds.adaptation_active,
                "note": _active_thresholds.note,
            },
        )

    batch = pd.DataFrame(list(_recent_features))
    result = compute_drift(_metrics["reference_distribution"], batch)
    result["adaptation"] = {
        "allow_max_probability": _active_thresholds.allow_max_probability,
        "block_min_probability": _active_thresholds.block_min_probability,
        "adaptation_active": _active_thresholds.adaptation_active,
        "note": _active_thresholds.note,
    }
    return DriftStatusResponse(**result)


@app.post("/drift/reset")
def drift_reset() -> dict:
    """Clear the rolling drift-monitoring buffer (useful for demos: reset
    between showing 'stable' baseline traffic and injecting a shifted batch).
    Also resets the drift-driven adaptive thresholds back to base — a
    stale tightened posture shouldn't survive a deliberate demo reset.
    """
    global _active_thresholds, _predicts_since_drift_check
    _recent_features.clear()
    _recent_predictions.clear()
    _active_thresholds = thresholds_for_drift_status("stable")
    _predicts_since_drift_check = 0
    return {"status": "cleared"}


@app.get("/audit/recent")
def recent_predictions() -> dict:
    """In-memory session log of recent scored transactions, for a live
    audit trail view. Not persisted; resets when the service restarts.
    """
    return {"count": len(_recent_predictions), "items": list(_recent_predictions)}


@app.get("/model/baseline-comparison")
def baseline_comparison() -> dict:
    """Naive rule-based baseline vs. ML fusion, evaluated on the identical
    held-out split. See risk_engine/baseline_model.py.
    """
    path = PROJECT_ROOT / "data" / "processed" / "baseline_comparison.json"
    if not path.exists():
        raise HTTPException(status_code=503, detail="Run risk_engine/baseline_model.py first.")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/model/stress-test")
def stress_test_results() -> dict:
    """Fixed, hand-authored edge-case battery results. See
    risk_engine/stress_test.py.
    """
    path = PROJECT_ROOT / "data" / "processed" / "stress_test_results.json"
    if not path.exists():
        raise HTTPException(status_code=503, detail="Run risk_engine/stress_test.py first.")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/model/graph-feature-ablation")
def graph_feature_ablation() -> dict:
    """Bonus graph-based identity clustering feature: ablation study and
    mean cluster size by attack subtype. See risk_engine/graph_features.py.
    """
    path = PROJECT_ROOT / "data" / "processed" / "graph_feature_ablation.json"
    if not path.exists():
        raise HTTPException(status_code=503, detail="Run risk_engine/graph_features.py first.")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/model/dataset-report")
def dataset_report() -> dict:
    """Machine-generated dataset provenance and TRAIN/VALIDATION/TEST
    partition statistics -- what datasets were considered, why the
    synthetic generator is primary for this loss class, and exact
    per-split row/attack/device counts. See risk_engine/generate_reports.py
    and DATASET_STRATEGY.md.
    """
    path = PROJECT_ROOT / "data" / "processed" / "dataset_report.json"
    if not path.exists():
        raise HTTPException(status_code=503, detail="Run risk_engine/generate_reports.py first.")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/model/ieee-cis-benchmark")
def ieee_cis_benchmark() -> dict:
    """Separate real-world generalization benchmark on the IEEE-CIS Fraud
    Detection dataset (own generic isFraud label, own model, own
    chronological TRAIN/VALIDATION/TEST split). See
    risk_engine/ieee_cis_train.py, DATASET_STRATEGY.md §5, and
    MODEL_CARD.md §19 for full methodology.

    Deliberately NOT the model backing /predict above, and deliberately not
    merged with /model/metrics: DATASET_STRATEGY.md explains why IEEE-CIS's
    generic fraud label cannot stand in as evidence about this project's
    actual target loss class (card-testing/BIN-enumeration). This endpoint
    exists purely so the numbers are reproducibly inspectable, not so they
    can be quoted as if they were the deployed model's performance.
    """
    path = PROJECT_ROOT / "data" / "processed" / "ieee_cis" / "ieee_cis_metrics.json"
    if not path.exists():
        raise HTTPException(
            status_code=503,
            detail=(
                "Run risk_engine/ieee_cis_features.py then "
                "risk_engine/ieee_cis_train.py first (requires "
                "data/external/ieee-cis/train_transaction.csv and "
                "train_identity.csv)."
            ),
        )
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/model/final-comparison")
def final_model_comparison() -> list:
    """The complete baseline ladder on the identical held-out TEST split:
    rule-only, RandomForest alone, IsolationForest alone, and the fusion
    policy -- each with precision/recall/F1/subtype-recall, so 'why not
    just use a simple classifier' has a direct, evidenced answer. See
    risk_engine/generate_reports.py.
    """
    path = PROJECT_ROOT / "data" / "processed" / "final_model_comparison.json"
    if not path.exists():
        raise HTTPException(status_code=503, detail="Run risk_engine/generate_reports.py first.")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/model/diagnostics")
def model_diagnostics() -> dict:
    """Calibration (Brier score), fairness proxy by country, and latency
    benchmark. See risk_engine/model_diagnostics.py.
    """
    path = PROJECT_ROOT / "data" / "processed" / "model_diagnostics.json"
    if not path.exists():
        raise HTTPException(status_code=503, detail="Run risk_engine/model_diagnostics.py first.")
    return json.loads(path.read_text(encoding="utf-8"))


@app.post("/verify/otp/request")
def request_otp(payload: OtpRequestPayload, request: Request) -> dict:
    """Explicitly request a fresh OTP (e.g. a 'resend code' action), rate
    limited per client since a genuine user calls this at most a few times.
    Demo/simulated only — see StepUpInfo.notice.
    """
    client_key = _client_key(request)
    allowed, remaining, retry_after = otp_request_limiter.check(client_key)
    if not allowed:
        audit_chain.append(
            "rate_limit_triggered",
            {"endpoint": "/verify/otp/request", "client_key": client_key, "retry_after_seconds": round(retry_after, 1)},
        )
        raise HTTPException(
            status_code=429,
            detail=f"Too many OTP requests. Retry after {retry_after:.1f}s.",
            headers={"Retry-After": str(int(retry_after) + 1)},
        )

    challenge = otp_engine.request_otp(payload.transaction_id)
    audit_chain.append(
        "otp_issued",
        {"transaction_id": payload.transaction_id, "verification_id": challenge.verification_id, "reason": "manual_request"},
    )
    return {
        "verification_id": challenge.verification_id,
        "expires_in_seconds": OTP_TTL_SECONDS,
        "demo_otp": challenge.code,
        "notice": "Demo/simulated verification only — no real SMS or payment service is connected.",
    }


@app.post("/verify/otp/confirm")
def confirm_otp(payload: OtpConfirmPayload, request: Request) -> dict:
    """Submit an OTP code. Successful verification is treated as a genuine
    risk-reducing signal (finalizes to ALLOW); exhausted/expired
    verification is treated as a risk-increasing signal (finalizes to
    BLOCK), per 'OTP success should reduce uncertainty/risk; repeated OTP
    failures should increase risk'.
    """
    client_key = _client_key(request)
    allowed, remaining, retry_after = otp_verify_limiter.check(client_key)
    if not allowed:
        audit_chain.append(
            "rate_limit_triggered",
            {"endpoint": "/verify/otp/confirm", "client_key": client_key, "retry_after_seconds": round(retry_after, 1)},
        )
        raise HTTPException(
            status_code=429,
            detail=f"Too many verification attempts. Retry after {retry_after:.1f}s.",
            headers={"Retry-After": str(int(retry_after) + 1)},
        )

    result = otp_engine.verify_otp(payload.verification_id, payload.code)
    challenge = otp_engine.get_challenge(payload.verification_id)

    final_decision: Optional[Decision] = None
    if result["verified"]:
        final_decision = "ALLOW"
    elif result["reason"] in ("expired", "exhausted"):
        final_decision = "BLOCK"

    audit_chain.append(
        "otp_verify_attempt",
        {
            "verification_id": payload.verification_id,
            "transaction_id": challenge.transaction_id if challenge else None,
            "verified": result["verified"],
            "reason": result["reason"],
            "final_decision": final_decision,
        },
    )

    return {**result, "final_decision": final_decision, "max_attempts": MAX_VERIFY_ATTEMPTS}


@app.get("/audit/chain")
def audit_chain_recent(limit: int = 100) -> dict:
    """Full tamper-evident audit chain (predict decisions, OTP events,
    rate-limit trips), each entry hash-linked to the previous one. See
    /audit/verify-integrity to check the chain hasn't been altered.
    """
    return {"entries": audit_chain.recent(limit=limit)}


@app.get("/model/threshold-business-case")
def threshold_business_case() -> dict:
    """Phase A: the validation threshold sweep presented as an explicit
    business decision -- named operating points (aggressive/balanced/
    conservative) with monthly-equivalent INR figures and a plain-English
    merchant recommendation for each. See risk_engine/threshold_business_case.py.
    """
    path = PROJECT_ROOT / "data" / "processed" / "threshold_business_case.json"
    if not path.exists():
        raise HTTPException(
            status_code=503, detail="Run risk_engine/threshold_business_case.py first."
        )
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/model/load-test")
def load_test_results() -> dict:
    """Phase B: p50/p95/p99 /predict latency under concurrent load, and
    whether/how much it degrades vs. the single-request baseline. See
    risk_engine/load_test.py.
    """
    path = PROJECT_ROOT / "data" / "processed" / "load_test_results.json"
    if not path.exists():
        raise HTTPException(status_code=503, detail="Run risk_engine/load_test.py first.")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/model/evasion-analysis")
def evasion_analysis_results() -> dict:
    """Phase C: adversarial/evasion analysis -- how RF/fusion recall holds
    up as low-and-slow attack spacing widens, and whether the graph-based
    identity-cluster-size feature remains useful when velocity_1h does
    not. See risk_engine/evasion_analysis.py.
    """
    path = PROJECT_ROOT / "data" / "processed" / "evasion_analysis.json"
    if not path.exists():
        raise HTTPException(status_code=503, detail="Run risk_engine/evasion_analysis.py first.")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/model/adaptive-effectiveness")
def adaptive_effectiveness_results() -> dict:
    """Answers 'why did the system adapt' and 'did adaptation actually
    help': a controlled experiment comparing baseline (stable, static
    thresholds), drifted+static thresholds, and drifted+adaptive
    thresholds on the same held-out TEST rows. Reports the honest delta
    (adaptive minus static) on precision/recall/F1/FPR/review-rate/
    expected-cost/missed-fraud, including cases where adaptation does not
    help. See risk_engine/adaptive_effectiveness_experiment.py.
    """
    path = PROJECT_ROOT / "data" / "processed" / "adaptive_effectiveness_experiment.json"
    if not path.exists():
        raise HTTPException(
            status_code=503, detail="Run risk_engine/adaptive_effectiveness_experiment.py first."
        )
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/audit/verify-integrity")
def audit_verify_integrity() -> dict:
    """Recomputes every entry's hash and the chain linkage, and reports
    whether tampering would be detected. Returns intact=True on a healthy
    chain; the endpoint exists specifically so an auditor doesn't have to
    trust the audit log's own claims about itself.
    """
    return audit_chain.verify_integrity()


@app.get("/audit/evidence-pack/{transaction_id}")
def audit_evidence_pack(transaction_id: str) -> dict:
    """A structured, exportable 'Risk Decision Evidence Report' for a
    single transaction — the risk engine's own decision reasoning and
    verification outcome, honestly scoped (no fabricated fulfillment or
    communication evidence this system doesn't have). See
    risk_engine/evidence_pack.py for the full disclosure.
    """
    return build_evidence_pack(transaction_id)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
