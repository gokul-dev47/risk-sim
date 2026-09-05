"""Risk decision evidence pack.

When a merchant disputes a chargeback with an issuing bank, they need to
present evidence justifying their side. A real dispute response typically
also needs fulfillment evidence (shipping manifests, delivery
confirmation) — this system has none of that; it's a risk-scoring
service, not an order-fulfillment platform, and this module does not
pretend otherwise.

What it DOES provide, honestly: a structured, tamper-evident record of
*why the risk engine made the decision it made* on a specific
transaction — the model/rule reasoning, the risk signals considered, and
the verification outcome if a step-up challenge was involved. This is a
real, useful piece of dispute evidence (proof the merchant's own risk
process was diligent and non-arbitrary), scoped honestly to what this
system actually observed.
"""

from __future__ import annotations

from datetime import datetime, timezone

from risk_engine.audit_chain import TamperEvidentAuditLog, audit_chain

EVENT_LABELS = {
    "predict": "Risk Decision",
    "otp_issued": "Step-Up Verification Issued",
    "otp_verify_attempt": "Step-Up Verification Attempt",
    "rate_limit_triggered": "Rate Limit Triggered",
}


def _format_timestamp(unix_ts: float) -> str:
    return datetime.fromtimestamp(unix_ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def build_evidence_pack(transaction_id: str, log: TamperEvidentAuditLog = audit_chain) -> dict:
    entries = log.entries_for_transaction(transaction_id)

    if not entries:
        return {
            "transaction_id": transaction_id,
            "found": False,
            "report_markdown": (
                f"# Risk Decision Evidence Report\n\n"
                f"No audit events found for transaction `{transaction_id}` in this "
                f"session's in-memory log. This report only covers events from the "
                f"current process's runtime — it is not durable, persistent storage."
            ),
        }

    integrity = log.verify_integrity()

    lines = [
        "# Risk Decision Evidence Report",
        "",
        f"**Transaction ID:** `{transaction_id}`",
        f"**Report generated:** {_format_timestamp(datetime.now(tz=timezone.utc).timestamp())}",
        f"**Audit chain integrity:** {'Verified intact' if integrity['intact'] else 'INTEGRITY CHECK FAILED — see detail below'}",
        "",
        "> **Scope disclosure**: this report documents the risk engine's own decision "
        "reasoning and verification outcome for this transaction. It does NOT include "
        "fulfillment evidence (shipping, delivery confirmation) or customer "
        "communication logs, which this system does not capture. It is intended as "
        "one input to a dispute response, demonstrating the merchant's risk process "
        "was diligent and non-arbitrary — not a complete chargeback defense package "
        "on its own.",
        "",
        "---",
        "",
        "## Event Timeline",
        "",
    ]

    for entry in entries:
        label = EVENT_LABELS.get(entry["event_type"], entry["event_type"])
        content = entry["content"]
        lines.append(f"### {label}")
        lines.append(f"- **Sequence:** #{entry['sequence']}")
        lines.append(f"- **Timestamp:** {_format_timestamp(entry['timestamp'])}")

        if entry["event_type"] == "predict":
            lines.append(f"- **Decision:** {content.get('decision')}")
            lines.append(f"- **Risk probability:** {content.get('risk_probability', 0):.4f}")
            lines.append(f"- **Anomaly flagged:** {content.get('is_anomaly')}")
            lines.append(f"- **Scoring engine:** {content.get('engine')}")
            if content.get("entity_observed_count") is not None:
                lines.append(f"- **Entity history at time of decision:** {content['entity_observed_count']} prior transaction(s)")
        elif entry["event_type"] == "otp_verify_attempt":
            lines.append(f"- **Verified:** {content.get('verified')}")
            lines.append(f"- **Reason:** {content.get('reason')}")
            lines.append(f"- **Resulting decision:** {content.get('final_decision') or 'unchanged'}")
        elif entry["event_type"] == "otp_issued":
            lines.append(f"- **Reason issued:** {content.get('reason')}")

        lines.append(f"- **Chain hash:** `{entry['entry_hash'][:16]}…`")
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append(f"**Integrity check detail:** {integrity['detail']}")
    lines.append("")
    lines.append(
        "This report is generated from a hash-chained audit log — each event's "
        "hash includes the prior event's hash, so any retroactive edit to this "
        "history is detectable. See `GET /audit/verify-integrity` to re-verify "
        "independently."
    )

    return {
        "transaction_id": transaction_id,
        "found": True,
        "event_count": len(entries),
        "chain_intact": integrity["intact"],
        "report_markdown": "\n".join(lines),
    }
