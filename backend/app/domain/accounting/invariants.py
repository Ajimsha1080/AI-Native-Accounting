import hashlib
import json
from typing import Any

from app.core.exceptions import UnbalancedJournalException


def validate_double_entry_balance(lines: list[dict[str, Any]]) -> tuple[int, int]:
    """
    Validates the primary double-entry invariant: Sum of Debits == Sum of Credits.
    All amounts MUST be in integer minor units (fils).
    Raises UnbalancedJournalException if variance != 0.
    """
    total_debits = 0
    total_credits = 0

    for line in lines:
        amount = int(line["amount_fils"])
        direction = str(line["direction"]).upper()
        if direction == "DEBIT":
            total_debits += amount
        elif direction == "CREDIT":
            total_credits += amount
        else:
            raise ValueError(
                f"Invalid entry line direction: {direction}. Must be 'DEBIT' or 'CREDIT'."
            )

    if total_debits != total_credits:
        raise UnbalancedJournalException(debit_fils=total_debits, credit_fils=total_credits)

    return total_debits, total_credits


def calculate_hash_chain(previous_hash: str | None, payload: dict[str, Any]) -> str:
    """
    Calculates deterministic SHA-256 hash for immutable audit logging and voucher integrity.
    Canonical JSON serialization guarantees consistent hashing across runs.
    """
    canonical_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    content = f"{previous_hash or '0' * 64}:{canonical_json}"
    return hashlib.sha256(content.encode("utf-8")).hexdigest()
