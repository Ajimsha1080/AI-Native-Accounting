import pytest

from app.core.exceptions import UnbalancedJournalException
from app.domain.accounting.invariants import calculate_hash_chain, validate_double_entry_balance


def test_balanced_double_entry():
    lines = [
        {"account_id": "acc-1", "direction": "DEBIT", "amount_fils": 500000},
        {"account_id": "acc-2", "direction": "CREDIT", "amount_fils": 500000},
    ]
    total_debits, total_credits = validate_double_entry_balance(lines)
    assert total_debits == 500000
    assert total_credits == 500000
    assert total_debits == total_credits


def test_unbalanced_double_entry_raises_exception():
    lines = [
        {"account_id": "acc-1", "direction": "DEBIT", "amount_fils": 500000},
        {"account_id": "acc-2", "direction": "CREDIT", "amount_fils": 499999},  # 1 fils variance
    ]
    with pytest.raises(UnbalancedJournalException) as exc_info:
        validate_double_entry_balance(lines)
    assert exc_info.value.code == "UNBALANCED_JOURNAL"
    assert exc_info.value.details["variance_fils"] == 1


def test_deterministic_hash_chain():
    payload = {"voucher": "JV-2026-001", "total_fils": 100000}
    prev_hash = "0" * 64
    hash1 = calculate_hash_chain(prev_hash, payload)
    hash2 = calculate_hash_chain(prev_hash, payload)
    assert hash1 == hash2
    assert len(hash1) == 64
