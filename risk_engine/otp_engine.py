"""Demo-safe OTP step-up verification.

**Explicitly a demo/simulated verification — no real SMS or payment
service is connected.** No message is actually sent anywhere; the OTP
code is returned directly in the API response so a presenter or judge can
complete the flow without a phone. This would never happen in production
(there, only a delivery confirmation would be returned, never the code
itself) — the simulation is disclosed, not disguised as production
behavior.

Integrates with the core risk decision workflow rather than existing as
an isolated feature: it exists specifically to give a REVIEW-decision
transaction a path to resolve into ALLOW (successful step-up) or BLOCK
(exhausted attempts / expired), rather than sitting in limbo. Successful
verification is a genuine, disclosed risk signal, not decoration.
"""

from __future__ import annotations

import secrets
import time
import uuid
from dataclasses import dataclass, field

OTP_LENGTH = 6
OTP_TTL_SECONDS = 300  # 5 minutes
MAX_VERIFY_ATTEMPTS = 3


@dataclass
class OtpChallenge:
    verification_id: str
    code: str
    created_at: float
    expires_at: float
    transaction_id: str | None
    attempts_used: int = 0
    consumed: bool = False
    outcome: str | None = None  # "success" | "failed" | "expired" | "exhausted"


class OtpEngine:
    """In-memory OTP store. Single-process, in-memory by design — matches
    the scope of this Buildathon demo; a real deployment would use a
    short-TTL store like Redis, and would never return the code itself.
    """

    def __init__(self) -> None:
        self._challenges: dict[str, OtpChallenge] = {}

    def request_otp(self, transaction_id: str | None) -> OtpChallenge:
        now = time.time()
        code = f"{secrets.randbelow(10 ** OTP_LENGTH):0{OTP_LENGTH}d}"
        challenge = OtpChallenge(
            verification_id=str(uuid.uuid4()),
            code=code,
            created_at=now,
            expires_at=now + OTP_TTL_SECONDS,
            transaction_id=transaction_id,
        )
        self._challenges[challenge.verification_id] = challenge
        return challenge

    def verify_otp(self, verification_id: str, submitted_code: str) -> dict:
        challenge = self._challenges.get(verification_id)
        if challenge is None:
            return {
                "verified": False,
                "reason": "unknown_verification_id",
                "message": "This verification session was not found or has already been cleared.",
            }

        if challenge.consumed:
            return {
                "verified": False,
                "reason": "already_finalized",
                "message": f"This verification already finished with outcome: {challenge.outcome}.",
            }

        now = time.time()
        if now > challenge.expires_at:
            challenge.consumed = True
            challenge.outcome = "expired"
            return {
                "verified": False,
                "reason": "expired",
                "message": "This code has expired. Please request a new one.",
            }

        if challenge.attempts_used >= MAX_VERIFY_ATTEMPTS:
            challenge.consumed = True
            challenge.outcome = "exhausted"
            return {
                "verified": False,
                "reason": "exhausted",
                "message": "Too many incorrect attempts. This verification is locked — please request a new code.",
            }

        challenge.attempts_used += 1

        if secrets.compare_digest(submitted_code.strip(), challenge.code):
            challenge.consumed = True
            challenge.outcome = "success"
            return {"verified": True, "reason": "correct_code", "message": "Verification successful."}

        remaining = MAX_VERIFY_ATTEMPTS - challenge.attempts_used
        if remaining <= 0:
            challenge.consumed = True
            challenge.outcome = "exhausted"
            return {
                "verified": False,
                "reason": "exhausted",
                "message": "Too many incorrect attempts. This verification is locked — please request a new code.",
            }

        return {
            "verified": False,
            "reason": "incorrect_code",
            "message": f"Incorrect code. {remaining} attempt(s) remaining before this verification locks.",
            "attempts_remaining": remaining,
        }

    def get_challenge(self, verification_id: str) -> OtpChallenge | None:
        return self._challenges.get(verification_id)


otp_engine = OtpEngine()
