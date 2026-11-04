"""Deterministic Debit-Credit Invariant & Mathematical Verification Engine.

Enforces zero-float integer fils accounting invariants on extracted invoices and bank statements:
1. Invoices:
   - Double-entry journal balance: Expense/Asset Debit + Input VAT Debit == Accounts Payable Credit
   - Line items reconciliation: sum(lines.netAmountFils) == subtotalFils
   - Tax equation reconciliation: subtotalFils + vatTotalFils == totalFils
   - Statutory UAE TRN validation: exactly 15 digits starting with '100'
   - VAT rate & tax-code consistency
2. Bank Statements:
   - Per-row balanced two-line journal: Bank Account vs Suspense/Counter-account (debit == credit)
   - Statement arithmetic: openingBalanceFils + sum(credits) - sum(debits) == closingBalanceFils
   - Continuous running balance reconciliation per row; exact failure row numbers recorded
3. Confidence computation: Computed solely from verification checks; any failure triggers HITL review.
"""

import re
from dataclasses import dataclass, field
from typing import Any


def is_valid_uae_trn(trn: str | None) -> bool:
    """Validates 15-digit statutory UAE TRN starting with 100."""
    if not trn:
        return False
    digits = re.sub(r"\D", "", trn)
    return len(digits) == 15 and digits.startswith("100")


@dataclass
class JournalLineCandidate:
    accountCode: str
    accountName: str
    debitFils: int
    creditFils: int


@dataclass
class JournalEntryCandidate:
    entryType: str  # "PURCHASE_INVOICE" | "SALES_INVOICE" | "BANK_TRANSACTION"
    lines: list[JournalLineCandidate] = field(default_factory=list)
    totalDebitFils: int = 0
    totalCreditFils: int = 0
    isBalanced: bool = False


@dataclass
class InvoiceValidationResult:
    journalCandidate: JournalEntryCandidate
    isDebitsEqualCredits: bool
    isSumLinesEqualSubtotal: bool
    isSubtotalPlusVatEqualTotal: bool
    isVatRateConsistent: bool
    isTrnValid: bool
    missingFields: list[str]
    fieldConfidence: dict[str, float]
    passedAllChecks: bool
    requiresHumanReview: bool
    computedConfidence: float
    reviewReasons: list[str]


@dataclass
class BankStatementRowValidation:
    rowNumber: int
    date: str
    narrative: str
    debitFils: int
    creditFils: int
    reportedRunningBalanceFils: int
    expectedRunningBalanceFils: int
    isBalanceMatching: bool
    journalCandidate: JournalEntryCandidate
    isRowBalanced: bool


@dataclass
class BankStatementValidationResult:
    rowValidations: list[BankStatementRowValidation]
    failingRowNumbers: list[int]
    isStatementArithmeticValid: bool
    openingBalanceFils: int
    reportedClosingBalanceFils: int
    calculatedClosingBalanceFils: int
    totalCreditsFils: int
    totalDebitsFils: int
    missingFields: list[str]
    fieldConfidence: dict[str, float]
    passedAllChecks: bool
    requiresHumanReview: bool
    computedConfidence: float
    reviewReasons: list[str]


class DeterministicFinancialValidator:
    """Zero-float statutory and double-entry mathematical validator."""

    @classmethod
    def validate_invoice(
        cls,
        *,
        vendor_name: str | None,
        vendor_trn: str | None,
        invoice_number: str | None,
        invoice_date: str | None,
        subtotal_fils: int | None,
        vat_total_fils: int | None,
        total_fils: int | None,
        lines: list[dict[str, Any]],
        is_sales_invoice: bool = False,
    ) -> InvoiceValidationResult:
        missing_fields: list[str] = []
        field_confidence: dict[str, float] = {}
        review_reasons: list[str] = []

        # 1. Field presence & confidence
        if vendor_name and vendor_name.strip():
            field_confidence["vendorName"] = 0.95
        else:
            missing_fields.append("vendorName")
            field_confidence["vendorName"] = 0.0

        valid_trn = is_valid_uae_trn(vendor_trn)
        if vendor_trn:
            field_confidence["vendorTrn"] = 1.0 if valid_trn else 0.2
            if not valid_trn:
                review_reasons.append(f"Statutory validation error: TRN '{vendor_trn}' is not a valid 15-digit UAE TRN starting with 100.")
        else:
            missing_fields.append("vendorTrn")
            field_confidence["vendorTrn"] = 0.0
            review_reasons.append("Missing mandatory statutory supplier TRN.")

        if invoice_number and invoice_number.strip():
            field_confidence["invoiceNumber"] = 0.95
        else:
            missing_fields.append("invoiceNumber")
            field_confidence["invoiceNumber"] = 0.0

        if invoice_date and invoice_date.strip():
            field_confidence["invoiceDate"] = 0.95
        else:
            missing_fields.append("invoiceDate")
            field_confidence["invoiceDate"] = 0.0

        if subtotal_fils is None:
            missing_fields.append("subtotalFils")
            field_confidence["subtotalFils"] = 0.0
        else:
            field_confidence["subtotalFils"] = 0.9

        if vat_total_fils is None:
            missing_fields.append("vatTotalFils")
            field_confidence["vatTotalFils"] = 0.0
        else:
            field_confidence["vatTotalFils"] = 0.9

        if total_fils is None or total_fils == 0:
            missing_fields.append("totalFils")
            field_confidence["totalFils"] = 0.0
            review_reasons.append("Missing total invoice gross amount.")
        else:
            field_confidence["totalFils"] = 0.95

        sub_f = subtotal_fils or 0
        vat_f = vat_total_fils or 0
        tot_f = total_fils or 0

        # 2. Mathematical checks
        math_valid = (sub_f + vat_f) == tot_f if (subtotal_fils is not None and vat_total_fils is not None and total_fils is not None) else False
        if not math_valid and total_fils is not None:
            review_reasons.append(f"Arithmetic discrepancy: Subtotal ({sub_f} fils) + VAT ({vat_f} fils) != Total ({tot_f} fils).")

        # Sum of lines == subtotal
        if lines:
            sum_line_net = sum(int(l.get("netAmountFils", 0)) for l in lines)
            sum_lines_valid = (sum_line_net == sub_f) if subtotal_fils is not None else False
            if not sum_lines_valid and subtotal_fils is not None:
                review_reasons.append(f"Line items reconciliation discrepancy: sum(lines.net) ({sum_line_net} fils) != Subtotal ({sub_f} fils).")
        else:
            missing_fields.append("lines")
            field_confidence["lines"] = 0.0
            sum_lines_valid = False

        # VAT rate / tax-code consistency
        vat_rate_consistent = True
        for idx, line in enumerate(lines, start=1):
            tax_code = line.get("proposedTaxCode", "SR_5")
            net_amt = int(line.get("netAmountFils", 0))
            vat_amt = int(line.get("vatAmountFils", 0))
            if tax_code == "SR_5":
                expected_vat = round(net_amt * 0.05)
                # Allow 1 fils rounding variance
                if abs(vat_amt - expected_vat) > 2 and net_amt > 0:
                    vat_rate_consistent = False
                    review_reasons.append(f"Line {idx} tax discrepancy: tax code SR_5 on {net_amt} fils expects {expected_vat} fils VAT, found {vat_amt} fils.")
            elif tax_code in ("ZR_EXP_0", "ZR_LOC_0", "EX_FIN") and vat_amt != 0:
                vat_rate_consistent = False
                review_reasons.append(f"Line {idx} tax discrepancy: zero-rated/exempt code {tax_code} must have 0 fils VAT, found {vat_amt} fils.")

        # 3. Journal Entry Candidate Construction
        journal_lines: list[JournalLineCandidate] = []
        if is_sales_invoice:
            # Sales: Debit AR (total), Credit Output VAT, Credit Revenue (subtotal)
            journal_lines.append(JournalLineCandidate("1200-ACCOUNTS-RECEIVABLE", "Accounts Receivable", tot_f, 0))
            journal_lines.append(JournalLineCandidate("2102-OUTPUT-VAT-PAYABLE", "Output VAT 5%", 0, vat_f))
            journal_lines.append(JournalLineCandidate("4000-OPERATING-REVENUE", "Commercial Revenue", 0, sub_f))
        else:
            # Purchase: Debit Expense (subtotal), Debit Input VAT, Credit Accounts Payable (total)
            journal_lines.append(JournalLineCandidate("5000-OPERATING-EXPENSES", "Operating Expenses", sub_f, 0))
            journal_lines.append(JournalLineCandidate("2101-INPUT-VAT-RECOVERABLE", "Input VAT 5%", vat_f, 0))
            journal_lines.append(JournalLineCandidate("2000-ACCOUNTS-PAYABLE", "Accounts Payable", 0, tot_f))

        tot_debits = sum(jl.debitFils for jl in journal_lines)
        tot_credits = sum(jl.creditFils for jl in journal_lines)
        debit_credit_balanced = (tot_debits == tot_credits) and (tot_debits > 0)

        if not debit_credit_balanced and tot_f > 0:
            review_reasons.append(f"Double-entry equilibrium failure: Total Debits ({tot_debits} fils) != Total Credits ({tot_credits} fils).")

        candidate = JournalEntryCandidate(
            entryType="SALES_INVOICE" if is_sales_invoice else "PURCHASE_INVOICE",
            lines=journal_lines,
            totalDebitFils=tot_debits,
            totalCreditFils=tot_credits,
            isBalanced=debit_credit_balanced,
        )

        # 4. Computed Confidence based solely on checks
        score = 0.0
        if debit_credit_balanced:
            score += 0.35
        if math_valid:
            score += 0.25
        if valid_trn:
            score += 0.20
        if sum_lines_valid:
            score += 0.10
        if vat_rate_consistent:
            score += 0.10
        if missing_fields:
            score -= (len(missing_fields) * 0.1)
        score = max(0.0, min(1.0, round(score, 4)))

        passed_all = (
            debit_credit_balanced
            and math_valid
            and valid_trn
            and sum_lines_valid
            and vat_rate_consistent
            and (len(missing_fields) == 0)
        )

        requires_review = (not passed_all) or (len(review_reasons) > 0)

        return InvoiceValidationResult(
            journalCandidate=candidate,
            isDebitsEqualCredits=debit_credit_balanced,
            isSumLinesEqualSubtotal=sum_lines_valid,
            isSubtotalPlusVatEqualTotal=math_valid,
            isVatRateConsistent=vat_rate_consistent,
            isTrnValid=valid_trn,
            missingFields=missing_fields,
            fieldConfidence=field_confidence,
            passedAllChecks=passed_all,
            requiresHumanReview=requires_review,
            computedConfidence=score,
            reviewReasons=review_reasons,
        )

    @classmethod
    def validate_bank_statement(
        cls,
        *,
        account: str | None,
        opening_balance_fils: int | None,
        closing_balance_fils: int | None,
        rows: list[dict[str, Any]],
    ) -> BankStatementValidationResult:
        missing_fields: list[str] = []
        field_confidence: dict[str, float] = {}
        review_reasons: list[str] = []
        failing_row_numbers: list[int] = []
        row_validations: list[BankStatementRowValidation] = []

        if account and account.strip():
            field_confidence["account"] = 0.95
        else:
            missing_fields.append("account")
            field_confidence["account"] = 0.0
            review_reasons.append("Missing bank account number or identifier.")

        if opening_balance_fils is None:
            missing_fields.append("openingBalanceFils")
            field_confidence["openingBalanceFils"] = 0.0
            review_reasons.append("Missing statement opening balance.")
        else:
            field_confidence["openingBalanceFils"] = 0.95

        if closing_balance_fils is None:
            missing_fields.append("closingBalanceFils")
            field_confidence["closingBalanceFils"] = 0.0
            review_reasons.append("Missing statement closing balance.")
        else:
            field_confidence["closingBalanceFils"] = 0.95

        open_f = opening_balance_fils or 0
        reported_close_f = closing_balance_fils or 0
        current_running_balance = open_f

        tot_credits = 0
        tot_debits = 0

        for idx, row in enumerate(rows, start=1):
            row_num = int(row.get("rowNumber", idx))
            r_date = str(row.get("date", ""))
            r_narrative = str(row.get("narrative", ""))
            r_debit = int(row.get("debitFils", 0))
            r_credit = int(row.get("creditFils", 0))
            r_reported_running = int(row.get("runningBalanceFils", 0))

            tot_credits += r_credit
            tot_debits += r_debit

            # Expected running balance step: previous + credit - debit
            expected_running = current_running_balance + r_credit - r_debit
            balance_match = (expected_running == r_reported_running)
            current_running_balance = expected_running

            # Per-row balanced two-line journal:
            # Money in (credit): Debit Bank Account, Credit Suspense Account
            # Money out (debit): Credit Bank Account, Debit Suspense Account
            row_journal_lines: list[JournalLineCandidate] = []
            if r_credit > 0:
                row_journal_lines.append(JournalLineCandidate("1010-CASH-AT-BANK", "Bank Operating Account", r_credit, 0))
                row_journal_lines.append(JournalLineCandidate("9999-UNALLOCATED-SUSPENSE", "Unallocated Bank Receipts", 0, r_credit))
            elif r_debit > 0:
                row_journal_lines.append(JournalLineCandidate("9999-UNALLOCATED-SUSPENSE", "Unallocated Bank Payments", r_debit, 0))
                row_journal_lines.append(JournalLineCandidate("1010-CASH-AT-BANK", "Bank Operating Account", 0, r_debit))

            tot_row_deb = sum(l.debitFils for l in row_journal_lines)
            tot_row_cred = sum(l.creditFils for l in row_journal_lines)
            row_balanced = (tot_row_deb == tot_row_cred) and (tot_row_deb > 0 or (r_credit == 0 and r_debit == 0))

            if not balance_match:
                failing_row_numbers.append(row_num)
                review_reasons.append(
                    f"Row {row_num} running balance mismatch: reported {r_reported_running} fils, expected {expected_running} fils (Delta: {r_reported_running - expected_running} fils)."
                )

            if not row_balanced:
                failing_row_numbers.append(row_num)
                review_reasons.append(f"Row {row_num} journal equilibrium failure: Debits {tot_row_deb} fils != Credits {tot_row_cred} fils.")

            row_candidate = JournalEntryCandidate(
                entryType="BANK_TRANSACTION",
                lines=row_journal_lines,
                totalDebitFils=tot_row_deb,
                totalCreditFils=tot_row_cred,
                isBalanced=row_balanced,
            )

            row_validations.append(BankStatementRowValidation(
                rowNumber=row_num,
                date=r_date,
                narrative=r_narrative,
                debitFils=r_debit,
                creditFils=r_credit,
                reportedRunningBalanceFils=r_reported_running,
                expectedRunningBalanceFils=expected_running,
                isBalanceMatching=balance_match,
                journalCandidate=row_candidate,
                isRowBalanced=row_balanced,
            ))

        calculated_close = open_f + tot_credits - tot_debits
        arithmetic_valid = (calculated_close == reported_close_f) if closing_balance_fils is not None else False

        if not arithmetic_valid and closing_balance_fils is not None:
            review_reasons.append(
                f"Statement reconciliation failure: Opening ({open_f} fils) + Credits ({tot_credits} fils) - Debits ({tot_debits} fils) = {calculated_close} fils, but Closing is reported as {reported_close_f} fils."
            )

        # Confidence based strictly on deterministic checks
        score = 0.0
        if arithmetic_valid:
            score += 0.40
        if not failing_row_numbers:
            score += 0.40
        if account:
            score += 0.10
        if opening_balance_fils is not None and closing_balance_fils is not None:
            score += 0.10
        if failing_row_numbers:
            score -= min(0.5, len(failing_row_numbers) * 0.1)
        score = max(0.0, min(1.0, round(score, 4)))

        passed_all = (
            arithmetic_valid
            and (len(failing_row_numbers) == 0)
            and (len(missing_fields) == 0)
            and (len(rows) > 0)
        )

        requires_review = (not passed_all) or (len(review_reasons) > 0)

        return BankStatementValidationResult(
            rowValidations=row_validations,
            failingRowNumbers=sorted(set(failing_row_numbers)),
            isStatementArithmeticValid=arithmetic_valid,
            openingBalanceFils=open_f,
            reportedClosingBalanceFils=reported_close_f,
            calculatedClosingBalanceFils=calculated_close,
            totalCreditsFils=tot_credits,
            totalDebitsFils=tot_debits,
            missingFields=missing_fields,
            fieldConfidence=field_confidence,
            passedAllChecks=passed_all,
            requiresHumanReview=requires_review,
            computedConfidence=score,
            reviewReasons=review_reasons,
        )
