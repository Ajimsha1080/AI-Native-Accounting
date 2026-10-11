import { UUID } from '@ledger-ae/shared-types';
import { roundHalfEven, formatMoney } from '@ledger-ae/ledger-core';

export interface LegacyAccountRecord {
  legacyAccountId: string;
  legacyAccountName: string;
  legacyAccountType: string;
  openingDebitFils: bigint;
  openingCreditFils: bigint;
  currency: string;
}

export interface MigrationImportResult {
  sourceSystem: 'ZOHO_BOOKS' | 'QUICKBOOKS_ONLINE' | 'TALLY_PRIME';
  totalAccountsImported: number;
  totalDebitsFils: bigint;
  totalCreditsFils: bigint;
  isBalanced: boolean;
  varianceFils: bigint;
  mappedAccounts: {
    ledgerAeAccountNumber: string;
    accountName: string;
    accountCategory: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
    openingBalanceFils: bigint; // positive for normal balance
  }[];
  validationErrors: string[];
}

/**
 * Migration Importers for transitioning legacy UAE businesses to LedgerAE.
 * Supports Zoho Books, QuickBooks Online, and Tally Prime.
 */
export class MigrationImporterEngine {
  /**
   * Imports Chart of Accounts and Opening Balances from Zoho Books.
   */
  static importZohoBooks(accounts: LegacyAccountRecord[]): MigrationImportResult {
    const errors: string[] = [];
    let totalDebits = 0n;
    let totalCredits = 0n;

    const mapped = accounts.map((acc, index) => {
      totalDebits += acc.openingDebitFils;
      totalCredits += acc.openingCreditFils;

      let category: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE' = 'ASSET';
      const typeLower = acc.legacyAccountType.toLowerCase();

      if (typeLower.includes('bank') || typeLower.includes('cash') || typeLower.includes('asset')) {
        category = 'ASSET';
      } else if (typeLower.includes('liability') || typeLower.includes('payable')) {
        category = 'LIABILITY';
      } else if (typeLower.includes('equity')) {
        category = 'EQUITY';
      } else if (typeLower.includes('income') || typeLower.includes('revenue')) {
        category = 'REVENUE';
      } else if (typeLower.includes('expense')) {
        category = 'EXPENSE';
      }

      const accountNumber = (1000 + index * 10).toString();
      const netOpeningBalance =
        category === 'ASSET' || category === 'EXPENSE'
          ? acc.openingDebitFils - acc.openingCreditFils
          : acc.openingCreditFils - acc.openingDebitFils;

      return {
        ledgerAeAccountNumber: accountNumber,
        accountName: acc.legacyAccountName,
        accountCategory: category,
        openingBalanceFils: netOpeningBalance
      };
    });

    const variance = totalDebits >= totalCredits ? totalDebits - totalCredits : totalCredits - totalDebits;
    const isBalanced = variance === 0n;

    if (!isBalanced) {
      errors.push(
        `Zoho Books Opening Balance Mismatch: Total Debits (AED ${formatMoney(totalDebits, 'AED')}) != Total Credits (AED ${formatMoney(totalCredits, 'AED')}). Variance: ${formatMoney(variance, 'AED')}`
      );
    }

    return {
      sourceSystem: 'ZOHO_BOOKS',
      totalAccountsImported: accounts.length,
      totalDebitsFils: totalDebits,
      totalCreditsFils: totalCredits,
      isBalanced,
      varianceFils: variance,
      mappedAccounts: mapped,
      validationErrors: errors
    };
  }

  /**
   * Imports Trial Balance from QuickBooks Online (QBO).
   */
  static importQuickBooks(accounts: LegacyAccountRecord[]): MigrationImportResult {
    const errors: string[] = [];
    let totalDebits = 0n;
    let totalCredits = 0n;

    const mapped = accounts.map((acc, index) => {
      totalDebits += acc.openingDebitFils;
      totalCredits += acc.openingCreditFils;

      let category: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE' = 'ASSET';
      const typeLower = acc.legacyAccountType.toLowerCase();

      if (typeLower.includes('asset') || typeLower.includes('bank')) {
        category = 'ASSET';
      } else if (typeLower.includes('liability')) {
        category = 'LIABILITY';
      } else if (typeLower.includes('equity')) {
        category = 'EQUITY';
      } else if (typeLower.includes('revenue') || typeLower.includes('income')) {
        category = 'REVENUE';
      } else {
        category = 'EXPENSE';
      }

      return {
        ledgerAeAccountNumber: (2000 + index * 10).toString(),
        accountName: acc.legacyAccountName,
        accountCategory: category,
        openingBalanceFils: acc.openingDebitFils > 0n ? acc.openingDebitFils : acc.openingCreditFils
      };
    });

    const variance = totalDebits >= totalCredits ? totalDebits - totalCredits : totalCredits - totalDebits;
    const isBalanced = variance === 0n;

    if (!isBalanced) {
      errors.push(`QBO Trial Balance out of balance by AED ${formatMoney(variance, 'AED')}`);
    }

    return {
      sourceSystem: 'QUICKBOOKS_ONLINE',
      totalAccountsImported: accounts.length,
      totalDebitsFils: totalDebits,
      totalCreditsFils: totalCredits,
      isBalanced,
      varianceFils: variance,
      mappedAccounts: mapped,
      validationErrors: errors
    };
  }

  /**
   * Imports Ledgers from Tally Prime.
   */
  static importTallyPrime(accounts: LegacyAccountRecord[]): MigrationImportResult {
    const errors: string[] = [];
    let totalDebits = 0n;
    let totalCredits = 0n;

    const mapped = accounts.map((acc, index) => {
      totalDebits += acc.openingDebitFils;
      totalCredits += acc.openingCreditFils;

      let category: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE' = 'ASSET';
      const groupLower = acc.legacyAccountType.toLowerCase();

      if (groupLower.includes('sundry debtor') || groupLower.includes('bank') || groupLower.includes('cash')) {
        category = 'ASSET';
      } else if (groupLower.includes('sundry creditor') || groupLower.includes('duties & taxes') || groupLower.includes('loan')) {
        category = 'LIABILITY';
      } else if (groupLower.includes('capital') || groupLower.includes('reserves')) {
        category = 'EQUITY';
      } else if (groupLower.includes('sales')) {
        category = 'REVENUE';
      } else {
        category = 'EXPENSE';
      }

      return {
        ledgerAeAccountNumber: (3000 + index * 10).toString(),
        accountName: acc.legacyAccountName,
        accountCategory: category,
        openingBalanceFils: acc.openingDebitFils > 0n ? acc.openingDebitFils : acc.openingCreditFils
      };
    });

    const variance = totalDebits >= totalCredits ? totalDebits - totalCredits : totalCredits - totalDebits;
    const isBalanced = variance === 0n;

    if (!isBalanced) {
      errors.push(`Tally Prime ledger balances out of balance by AED ${formatMoney(variance, 'AED')}`);
    }

    return {
      sourceSystem: 'TALLY_PRIME',
      totalAccountsImported: accounts.length,
      totalDebitsFils: totalDebits,
      totalCreditsFils: totalCredits,
      isBalanced,
      varianceFils: variance,
      mappedAccounts: mapped,
      validationErrors: errors
    };
  }
}
