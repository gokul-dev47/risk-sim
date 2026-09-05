"""Tamper-evident audit log via hash chaining.

Each audit entry stores sha256(previous_entry_hash + canonical_json(this
entry's content)) as its own hash. Any retroactive edit to an earlier
entry changes its hash, which changes every subsequent entry's hash,
making tampering detectable by recomputing the chain — the same
principle used by blockchains and git commit hashes, applied here to a
simple in-memory audit trail.

This is in-memory and resets on process restart, matching the scope of
this Buildathon demo (same as the existing session audit buffer it
replaces) — the tamper-evidence property is about detecting *retroactive
edits within a running session*, not providing durable, persistent audit
storage, which would need a real append-only store in production.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

GENESIS_HASH = "0" * 64


def _canonical_json(payload: dict) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


@dataclass
class ChainedAuditEntry:
    sequence: int
    timestamp: float
    event_type: str
    content: dict[str, Any]
    prev_hash: str
    entry_hash: str = field(init=False)

    def __post_init__(self) -> None:
        payload = {
            "sequence": self.sequence,
            "timestamp": self.timestamp,
            "event_type": self.event_type,
            "content": self.content,
            "prev_hash": self.prev_hash,
        }
        self.entry_hash = hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()

    def to_dict(self) -> dict:
        return {
            "sequence": self.sequence,
            "timestamp": self.timestamp,
            "event_type": self.event_type,
            "content": self.content,
            "prev_hash": self.prev_hash,
            "entry_hash": self.entry_hash,
        }


class TamperEvidentAuditLog:
    def __init__(self, maxlen: int = 500) -> None:
        self._entries: deque[ChainedAuditEntry] = deque(maxlen=maxlen)
        self._next_sequence = 0

    def append(self, event_type: str, content: dict[str, Any]) -> ChainedAuditEntry:
        prev_hash = self._entries[-1].entry_hash if self._entries else GENESIS_HASH
        entry = ChainedAuditEntry(
            sequence=self._next_sequence,
            timestamp=time.time(),
            event_type=event_type,
            content=content,
            prev_hash=prev_hash,
        )
        self._entries.append(entry)
        self._next_sequence += 1
        return entry

    def recent(self, limit: int = 200) -> list[dict]:
        items = list(self._entries)[-limit:]
        return [e.to_dict() for e in items]

    def entries_for_transaction(self, transaction_id: str) -> list[dict]:
        """All chain entries whose content references this transaction_id,
        in chronological order — the raw material for a per-transaction
        evidence report.
        """
        matches = [
            e.to_dict()
            for e in self._entries
            if e.content.get("transaction_id") == transaction_id
        ]
        return matches

    def verify_integrity(self) -> dict:
        """Recomputes every entry's hash from its stored content and
        checks it against both the stored hash and the chain linkage. This
        is what makes tampering detectable: an attacker (or a bug) that
        edits `content` on any entry after the fact will produce a hash
        mismatch here, even if they don't bother updating entry_hash.
        """
        entries = list(self._entries)
        if not entries:
            return {"intact": True, "checked": 0, "broken_at_sequence": None, "detail": "No audit entries yet."}

        expected_prev = GENESIS_HASH
        for entry in entries:
            recomputed = ChainedAuditEntry(
                sequence=entry.sequence,
                timestamp=entry.timestamp,
                event_type=entry.event_type,
                content=entry.content,
                prev_hash=entry.prev_hash,
            )
            if entry.prev_hash != expected_prev:
                return {
                    "intact": False,
                    "checked": len(entries),
                    "broken_at_sequence": entry.sequence,
                    "detail": f"Chain linkage broken at sequence {entry.sequence}: prev_hash does not match the preceding entry's hash.",
                }
            if recomputed.entry_hash != entry.entry_hash:
                return {
                    "intact": False,
                    "checked": len(entries),
                    "broken_at_sequence": entry.sequence,
                    "detail": f"Content/hash mismatch at sequence {entry.sequence}: stored hash does not match recomputed hash — this entry's content changed after it was written.",
                }
            expected_prev = entry.entry_hash

        return {"intact": True, "checked": len(entries), "broken_at_sequence": None, "detail": "Chain verified: no tampering detected."}


audit_chain = TamperEvidentAuditLog()
