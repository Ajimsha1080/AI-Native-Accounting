import crypto from 'node:crypto';
import { parseDecimalToMinorUnits } from '@ledger-ae/shared-types';
import {
  BankAggregatorClient,
  AggregatorAccount,
  AggregatorTransaction
} from './contracts.js';

export interface LeanAggregatorConfig {
  baseUrl?: string;
  appToken?: string;
  webhookSecret?: string;
  customFetch?: typeof fetch;
}

/**
 * Real UAE Central Bank-regulated Open Finance Aggregator Client (Lean Technologies API standard).
 * Fetches corporate bank statements and account balances from UAE financial institutions (FAB, ENBD, ADCB, Mashreq).
 * All monetary amounts are parsed directly into integer minor units (BigInt fils) with zero floating-point math.
 */
export class LeanOpenFinanceClient implements BankAggregatorClient {
  private baseUrl: string;
  private appToken: string;
  private webhookSecret: string;
  private fetchImpl: typeof fetch;

  constructor(config: LeanAggregatorConfig = {}) {
    const isProduction = process.env.NODE_ENV === 'production';
    const appToken = config.appToken || process.env.LEAN_APP_TOKEN;

    if (isProduction && (!appToken || appToken === 'lean_sandbox_app_token' || appToken.startsWith('lean_placeholder'))) {
      throw new Error('FATAL: LEAN_APP_TOKEN is required and must be configured with live credentials in production (fail closed).');
    }

    this.baseUrl = config.baseUrl || process.env.LEAN_BASE_URL || 'https://sandbox.leantech.me/v1';
    this.appToken = appToken || 'lean_sandbox_app_token';
    this.webhookSecret = config.webhookSecret || process.env.LEAN_WEBHOOK_SECRET || 'lean_sandbox_wh_secret';
    this.fetchImpl = config.customFetch || globalThis.fetch;
  }

  async listAccounts(tenantId: string): Promise<AggregatorAccount[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/accounts`, {
      headers: {
        'lean-app-token': this.appToken,
        'X-Tenant-Id': tenantId
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to list accounts from Lean aggregator: HTTP ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as any;
    const accountsData = json.payload || json.accounts || json || [];

    return (Array.isArray(accountsData) ? accountsData : []).map((acc: any) => ({
      accountId: acc.id || acc.account_id,
      accountNumber: acc.account_number || '',
      iban: acc.iban || '',
      bankName: acc.bank_name || acc.institution_name || 'UAE Bank',
      currency: acc.currency || 'AED',
      balanceMinorUnits: parseDecimalToMinorUnits(acc.balance || acc.balance_amount || '0.00'),
      lastSyncedAt: acc.last_synced_at || new Date().toISOString()
    }));
  }

  async getTransactions(
    accountId: string,
    fromDate: string,
    toDate: string
  ): Promise<AggregatorTransaction[]> {
    const url = new URL(`${this.baseUrl}/accounts/${accountId}/transactions`);
    url.searchParams.set('from_date', fromDate);
    url.searchParams.set('to_date', toDate);

    const response = await this.fetchImpl(url.toString(), {
      headers: {
        'lean-app-token': this.appToken
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch transactions for account ${accountId}: HTTP ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as any;
    const txData = json.payload || json.transactions || json || [];

    return (Array.isArray(txData) ? txData : []).map((tx: any) => {
      const amountStr = String(tx.amount || '0.00');
      const isNegative = amountStr.startsWith('-');
      const absAmountStr = isNegative ? amountStr.slice(1) : amountStr;
      const fils = parseDecimalToMinorUnits(absAmountStr);

      const direction: 'CREDIT' | 'DEBIT' =
        tx.direction ? (tx.direction.toUpperCase() as any) : isNegative ? 'DEBIT' : 'CREDIT';

      return {
        transactionId: tx.id || tx.transaction_id || `txn-${Date.now()}`,
        accountId,
        bookingDate: tx.booking_date || tx.date || new Date().toISOString().split('T')[0],
        valueDate: tx.value_date || tx.date || new Date().toISOString().split('T')[0],
        amountMinorUnits: fils,
        currency: tx.currency || 'AED',
        direction,
        reference: tx.reference || tx.description || 'TRANSFER',
        narrative: tx.narrative || tx.description || '',
        counterpartyName: tx.counterparty_name || undefined,
        counterpartyIban: tx.counterparty_iban || undefined
      };
    });
  }

  verifyWebhookSignature(payload: string, signature: string, secretOverride?: string): boolean {
    const secret = secretOverride || this.webhookSecret;
    if (!secret || !signature) return false;

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    if (expectedSignature.length !== signature.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'utf-8'),
      Buffer.from(signature, 'utf-8')
    );
  }
}
