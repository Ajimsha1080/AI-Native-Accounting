import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LedgerApiController } from './controller.js';
import { Direction } from '@ledger-ae/ledger-core';

describe('LedgerAE API Service Endpoints', () => {
  const api = new LedgerApiController();

  test('POST /ledger/entries accepts balanced journal entry and returns voucher hash', async () => {
    const res = await api.postJournalEntry({
      entry: {
        tenantId: 'ten-01',
        entityId: 'ent-01',
        bookId: 'book-01',
        periodId: 'period-2026-01',
        entryNumber: 'VOUCHER-API-001',
        postingDate: '2026-01-20',
        documentDate: '2026-01-20',
        sourceModule: 'API_TEST',
        memoEn: 'Office Furniture Acquisition',
        createdBy: 'usr-controller',
        lines: [
          {
            accountId: 'acc-asset',
            currency: 'AED',
            amountTxn: 1500000n, // AED 15,000.00
            amountBase: 1500000n,
            fxRate: 100000000n,
            direction: Direction.DEBIT
          },
          {
            accountId: 'acc-ap',
            currency: 'AED',
            amountTxn: 1500000n,
            amountBase: 1500000n,
            fxRate: 100000000n,
            direction: Direction.CREDIT
          }
        ]
      }
    });

    assert.equal(res.success, true);
    assert.equal(res.data?.voucherNumber, 'VOUCHER-API-001');
    assert.ok(res.data?.hash);
  });

  test('POST /ledger/entries rejects unbalanced entry with clear invariant error', async () => {
    const res = await api.postJournalEntry({
      entry: {
        tenantId: 'ten-01',
        entityId: 'ent-01',
        bookId: 'book-01',
        periodId: 'period-2026-01',
        entryNumber: 'VOUCHER-API-ERR',
        postingDate: '2026-01-20',
        documentDate: '2026-01-20',
        sourceModule: 'API_TEST',
        memoEn: 'Imbalanced Entry',
        createdBy: 'usr-controller',
        lines: [
          {
            accountId: 'acc-asset',
            currency: 'AED',
            amountTxn: 1500000n,
            amountBase: 1500000n,
            fxRate: 100000000n,
            direction: Direction.DEBIT
          },
          {
            accountId: 'acc-ap',
            currency: 'AED',
            amountTxn: 1400000n, // 1,000 AED deficit
            amountBase: 1400000n,
            fxRate: 100000000n,
            direction: Direction.CREDIT
          }
        ]
      }
    });

    assert.equal(res.success, false);
    assert.match(res.error!, /Invariant Validation Failed/);
  });

  test('POST /einvoicing/transmit generates UBL and receives positive ASP clearance', async () => {
    const res = await api.transmitEInvoice({
      invoiceNumber: 'INV-API-2026-01',
      issueDate: '2026-02-15',
      currencyCode: 'AED',
      supplier: {
        name: 'Alpha Software LLC',
        trn: '100234567800003',
        streetName: 'Business Bay',
        city: 'Dubai',
        emirate: 'Dubai',
        countryCode: 'AE'
      },
      customer: {
        name: 'Beta Trading PJSC',
        trn: '100987654321001',
        streetName: 'Hamdan St',
        city: 'Abu Dhabi',
        emirate: 'Abu Dhabi',
        countryCode: 'AE'
      },
      subtotalFils: 2000000n, // AED 20,000.00
      vatTotalFils: 100000n,   // AED 1,000.00
      grandTotalFils: 2100000n, // AED 21,000.00
      lines: [
        {
          id: '1',
          description: 'Custom ERP Localization Module',
          quantity: 1,
          unitPriceFils: 2000000n,
          lineExtensionAmountFils: 2000000n,
          vatRatePercent: 5,
          vatAmountFils: 100000n,
          taxCategoryCode: 'S'
        }
      ]
    });

    assert.equal(res.success, true);
    assert.equal(res.data?.mlsStatusCode, 'AP');
    assert.ok(res.data?.clearanceReference);
  });

  test('Public API Idempotency: Duplicate submission with same Idempotency-Key returns cached response without duplicate posting', async () => {
    const idempotencyKey = 'idem-req-abc-987';
    const entryPayload = {
      tenantId: 'ten-corp-01',
      idempotencyKey,
      entry: {
        tenantId: 'ten-corp-01',
        entityId: 'ent-01',
        bookId: 'book-01',
        periodId: 'period-2026-01',
        entryNumber: 'VOUCHER-IDEM-01',
        postingDate: '2026-01-20',
        documentDate: '2026-01-20',
        sourceModule: 'API_IDEM_TEST',
        memoEn: 'Idempotent Payment Post',
        createdBy: 'usr-client',
        lines: [
          {
            accountId: 'acc-bank',
            currency: 'AED',
            amountTxn: 500000n,
            amountBase: 500000n,
            fxRate: 100000000n,
            direction: Direction.DEBIT
          },
          {
            accountId: 'acc-ar',
            currency: 'AED',
            amountTxn: 500000n,
            amountBase: 500000n,
            fxRate: 100000000n,
            direction: Direction.CREDIT
          }
        ]
      }
    };

    // First call
    const res1 = await api.postJournalEntry(entryPayload);
    assert.equal(res1.success, true);
    assert.equal(res1.isIdempotentReplay, undefined);

    // Second call with same idempotency key
    const res2 = await api.postJournalEntry(entryPayload);
    assert.equal(res2.success, true);
    assert.equal(res2.isIdempotentReplay, true);
    assert.equal(res2.data?.voucherNumber, res1.data?.voucherNumber);
    assert.equal(res2.data?.hash, res1.data?.hash);
  });

  test('Public API Webhooks: Dispatches signed HMAC-SHA256 webhook event upon successful journal posting', async () => {
    const webhookSecret = 'whsec_secure_key_12345';
    api.registerWebhook({
      url: 'https://client-erp.example.ae/webhooks/ledger',
      secret: webhookSecret,
      events: ['journal.posted']
    });

    const initialWebhookCount = api.dispatchedWebhooks.length;

    await api.postJournalEntry({
      tenantId: 'ten-webhook-01',
      entry: {
        tenantId: 'ten-webhook-01',
        entityId: 'ent-01',
        bookId: 'book-01',
        periodId: 'period-2026-01',
        entryNumber: 'VOUCHER-WH-01',
        postingDate: '2026-01-22',
        documentDate: '2026-01-22',
        sourceModule: 'WEBHOOK_TEST',
        memoEn: 'Webhook Event Trigger Entry',
        createdBy: 'usr-wh',
        lines: [
          {
            accountId: 'acc-cash',
            currency: 'AED',
            amountTxn: 200000n,
            amountBase: 200000n,
            fxRate: 100000000n,
            direction: Direction.DEBIT
          },
          {
            accountId: 'acc-rev',
            currency: 'AED',
            amountTxn: 200000n,
            amountBase: 200000n,
            fxRate: 100000000n,
            direction: Direction.CREDIT
          }
        ]
      }
    });

    assert.equal(api.dispatchedWebhooks.length, initialWebhookCount + 1);
    const lastWebhook = api.dispatchedWebhooks[api.dispatchedWebhooks.length - 1];
    assert.equal(lastWebhook.eventType, 'journal.posted');
    assert.equal(lastWebhook.tenantId, 'ten-webhook-01');
    assert.ok(lastWebhook.signature);
    assert.equal(lastWebhook.signature.length, 64); // 64 hex characters (SHA-256)
  });
});
