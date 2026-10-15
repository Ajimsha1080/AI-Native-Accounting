import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  EInvoicingAspClient,
  BankAggregatorClient,
  PaymentGatewayClient
} from './contracts.js';
import { PintAeAspClient } from './einvoicing-asp.js';
import { LeanOpenFinanceClient } from './bank-aggregator.js';
import { StripePaymentClient } from './stripe-gateway.js';

describe('Phase 7: Integrations Behind Interfaces with Contract Tests', () => {
  const TENANT_ID = '00000000-0000-0000-0000-000000000001';

  // =========================================================================
  // Contract Test Suite 1: Accredited UAE E-Invoicing ASP (PINT-AE)
  // =========================================================================
  describe('Contract: Accredited UAE E-Invoicing Provider (PINT-AE Peppol)', () => {
    const validUblXml = `
      <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
               xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
               xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
        <cbc:CustomizationID>urn:peppol:pint:billing-1@ae-1</cbc:CustomizationID>
        <cbc:ID>INV-2026-0042</cbc:ID>
        <cac:AccountingSupplierParty>
          <cac:Party>
            <cac:PartyTaxScheme>
              <cbc:CompanyID>100234567800003</cbc:CompanyID>
            </cac:PartyTaxScheme>
          </cac:Party>
        </cac:AccountingSupplierParty>
      </Invoice>
    `;

    test('Transmits valid PINT-AE invoice and satisfies contract with ACCEPTED status and clearance reference', async () => {
      // Mock HTTP Sandbox for Accredited Access Point
      const mockFetch = async (url: any, init: any) => {
        assert.ok(String(url).endsWith('/invoices/transmit'));
        assert.equal(init.headers['Content-Type'], 'application/xml');
        assert.ok(init.headers['Authorization'].startsWith('Bearer '));

        return {
          ok: true,
          status: 200,
          json: async () => ({
            transmissionId: 'ASP-TX-AE-98214',
            status: 'ACCEPTED',
            mlsStatusCode: 'AP',
            clearanceReference: 'FTA-CLR-9900228811',
            timestamp: '2026-03-15T10:00:00Z'
          })
        } as any;
      };

      const client: EInvoicingAspClient = new PintAeAspClient({ customFetch: mockFetch });

      const result = await client.transmitInvoice({
        tenantId: TENANT_ID,
        invoiceId: 'inv-42',
        invoiceNumber: 'INV-2026-0042',
        ublXml: validUblXml
      });

      assert.equal(result.status, 'ACCEPTED');
      assert.equal(result.mlsStatusCode, 'AP');
      assert.equal(result.transmissionId, 'ASP-TX-AE-98214');
      assert.equal(result.clearanceReference, 'FTA-CLR-9900228811');
      assert.ok(result.archiveHash.length === 64);
    });

    test('Contract violation: Missing CustomizationID returns REJECTED without sending to gateway', async () => {
      const invalidCustomizationXml = validUblXml.replace(
        'urn:peppol:pint:billing-1@ae-1',
        'urn:peppol:cenbii:invalid'
      );

      const client: EInvoicingAspClient = new PintAeAspClient();
      const result = await client.transmitInvoice({
        tenantId: TENANT_ID,
        invoiceId: 'inv-err',
        invoiceNumber: 'INV-ERR',
        ublXml: invalidCustomizationXml
      });

      assert.equal(result.status, 'REJECTED');
      assert.equal(result.mlsStatusCode, 'RE');
      assert.match(result.rejectionReason!, /Missing mandatory CustomizationID/);
    });

    test('Contract violation: Invalid 15-digit TRN returns REJECTED with statutory error', async () => {
      const invalidTrnXml = validUblXml.replace('100234567800003', '999999999999999');

      const client: EInvoicingAspClient = new PintAeAspClient();
      const result = await client.transmitInvoice({
        tenantId: TENANT_ID,
        invoiceId: 'inv-err-trn',
        invoiceNumber: 'INV-ERR-TRN',
        ublXml: invalidTrnXml
      });

      assert.equal(result.status, 'REJECTED');
      assert.equal(result.mlsStatusCode, 'RE');
      assert.match(result.rejectionReason!, /Supplier TRN is invalid under UAE FTA 15-digit rules/);
    });

    test('Contract: HTTP 503 gateway outage returns TRANSIENT_ERROR with IP status for Temporal retry', async () => {
      const mockOutageFetch = async () => ({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable'
      } as any);

      const client: EInvoicingAspClient = new PintAeAspClient({ customFetch: mockOutageFetch });
      const result = await client.transmitInvoice({
        tenantId: TENANT_ID,
        invoiceId: 'inv-transient',
        invoiceNumber: 'INV-TR',
        ublXml: validUblXml
      });

      assert.equal(result.status, 'TRANSIENT_ERROR');
      assert.equal(result.mlsStatusCode, 'IP');
      assert.match(result.rejectionReason!, /HTTP 503/);
    });

    test('Contract: checkClearanceStatus queries ASP and returns clearance status', async () => {
      const mockStatusFetch = async (url: any) => {
        assert.ok(String(url).includes('/invoices/ASP-TX-9988/status'));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            transmissionId: 'ASP-TX-9988',
            status: 'ACCEPTED',
            clearanceReference: 'FTA-CLR-9988-FINAL',
            clearedAt: '2026-03-15T10:05:00Z'
          })
        } as any;
      };

      const client = new PintAeAspClient({ customFetch: mockStatusFetch });
      const statusRes = await client.checkClearanceStatus('ASP-TX-9988');
      assert.equal(statusRes.status, 'ACCEPTED');
      assert.equal(statusRes.clearanceReference, 'FTA-CLR-9988-FINAL');
    });

    test('Contract: checkClearanceStatus handles gateway error or network failure gracefully', async () => {
      const mockFailFetch = async () => ({
        ok: false,
        status: 500
      } as any);

      const client = new PintAeAspClient({ customFetch: mockFailFetch });
      const statusRes = await client.checkClearanceStatus('ASP-TX-FAIL');
      assert.equal(statusRes.status, 'IN_PROCESS');
      assert.match(statusRes.rejectionReason!, /HTTP 500/);

      const mockNetErrFetch = async () => {
        throw new Error('Connection refused');
      };
      const clientErr = new PintAeAspClient({ customFetch: mockNetErrFetch });
      const statusNetRes = await clientErr.checkClearanceStatus('ASP-TX-NET');
      assert.equal(statusNetRes.status, 'IN_PROCESS');
      assert.match(statusNetRes.rejectionReason!, /Connection refused/);
    });
  });

  // =========================================================================
  // Contract Test Suite 2: UAE Open Finance Bank Aggregator (Lean Technologies)
  // =========================================================================
  describe('Contract: UAE Open Finance Bank Aggregator (Lean Technologies)', () => {
    test('Satisfies BankAggregatorClient contract for account listing with zero-float BigInt minor units', async () => {
      const mockFetch = async (url: any) => {
        assert.ok(String(url).endsWith('/accounts'));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            payload: [
              {
                id: 'acc-fab-01',
                account_number: '1029384756',
                iban: 'AE0703300001029384756',
                bank_name: 'First Abu Dhabi Bank (FAB)',
                currency: 'AED',
                balance: '1250000.50'
              }
            ]
          })
        } as any;
      };

      const client: BankAggregatorClient = new LeanOpenFinanceClient({ customFetch: mockFetch });
      const accounts = await client.listAccounts(TENANT_ID);

      assert.equal(accounts.length, 1);
      assert.equal(accounts[0].iban, 'AE0703300001029384756');
      assert.equal(accounts[0].bankName, 'First Abu Dhabi Bank (FAB)');
      // AED 1,250,000.50 -> 125,000,050 fils
      assert.equal(accounts[0].balanceMinorUnits, 125000050n);
    });

    test('Satisfies transaction fetching contract with exact integer fils and direction mapping', async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          payload: [
            {
              id: 'txn-credit-01',
              booking_date: '2026-03-01',
              amount: '45000.00',
              currency: 'AED',
              direction: 'CREDIT',
              reference: 'INV-2026-9011',
              narrative: 'Transfer from Emaar Properties PJSC',
              counterparty_name: 'Emaar Properties'
            },
            {
              id: 'txn-debit-02',
              booking_date: '2026-03-02',
              amount: '-26.25',
              currency: 'AED',
              direction: 'DEBIT',
              reference: 'CHG-99',
              narrative: 'SWIFT wire fee + VAT'
            }
          ]
        })
      } as any);

      const client: BankAggregatorClient = new LeanOpenFinanceClient({ customFetch: mockFetch });
      const txns = await client.getTransactions('acc-fab-01', '2026-03-01', '2026-03-31');

      assert.equal(txns.length, 2);
      assert.equal(txns[0].direction, 'CREDIT');
      assert.equal(txns[0].amountMinorUnits, 4500000n); // AED 45,000.00
      assert.equal(txns[1].direction, 'DEBIT');
      assert.equal(txns[1].amountMinorUnits, 2625n); // AED 26.25
    });

    test('Satisfies webhook signature verification contract (HMAC-SHA256)', () => {
      const secret = 'whsec_lean_test_secret_key_123';
      const client = new LeanOpenFinanceClient({ webhookSecret: secret });

      const payload = JSON.stringify({ event: 'transactions.new', account_id: 'acc-fab-01' });
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      assert.equal(client.verifyWebhookSignature(payload, signature), true);
      assert.equal(client.verifyWebhookSignature(payload, 'invalid_sig_hex_12345'), false);
    });
  });

  // =========================================================================
  // Contract Test Suite 3: Stripe Payment Gateway
  // =========================================================================
  describe('Contract: Stripe Payment Gateway', () => {
    test('Satisfies PaymentGatewayClient contract for payment intent creation in exact fils', async () => {
      const mockStripeInstance: any = {
        paymentIntents: {
          create: async (params: any) => {
            assert.equal(params.amount, 25000); // 250.00 AED in fils
            assert.equal(params.currency, 'aed');
            return {
              id: 'pi_3NzABC1234567890',
              client_secret: 'pi_3NzABC1234567890_secret_xyz',
              amount: params.amount,
              currency: params.currency,
              status: 'requires_payment_method',
              created: Math.floor(Date.now() / 1000)
            };
          }
        }
      };

      const client: PaymentGatewayClient = new StripePaymentClient({
        stripeInstance: mockStripeInstance
      });

      const intent = await client.createPaymentIntent({
        tenantId: TENANT_ID,
        amountFils: 25000n, // AED 250.00
        currency: 'AED',
        invoiceId: 'inv-2026-0042'
      });

      assert.equal(intent.intentId, 'pi_3NzABC1234567890');
      assert.equal(intent.amountFils, 25000n);
      assert.equal(intent.currency, 'AED');
      assert.equal(intent.status, 'requires_payment_method');
      assert.ok(intent.clientSecret.includes('secret'));
    });

    test('Satisfies payment capture and refund contract with exact BigInt amounts', async () => {
      const mockStripeInstance: any = {
        paymentIntents: {
          capture: async (id: string) => ({
            id,
            status: 'succeeded',
            amount_received: 50000 // AED 500.00
          })
        },
        refunds: {
          create: async (params: any) => ({
            id: 're_9812409124',
            amount: params.amount,
            status: 'succeeded'
          })
        }
      };

      const client: PaymentGatewayClient = new StripePaymentClient({
        stripeInstance: mockStripeInstance
      });

      const capture = await client.capturePayment('pi_test_01');
      assert.equal(capture.status, 'succeeded');
      assert.equal(capture.amountCapturedFils, 50000n);

      const refund = await client.refundPayment('pi_test_01', 25000n);
      assert.equal(refund.status, 'succeeded');
      assert.equal(refund.amountRefundedFils, 25000n);
    });

    test('Satisfies Stripe webhook signature verification contract (t=...,v1=...)', () => {
      const webhookSecret = 'whsec_stripe_test_secret_998877';
      const client = new StripePaymentClient({ webhookSecret });

      const timestamp = Math.floor(Date.now() / 1000);
      const payload = JSON.stringify({ type: 'payment_intent.succeeded', id: 'pi_test' });

      const signedPayload = `${timestamp}.${payload}`;
      const v1 = crypto.createHmac('sha256', webhookSecret).update(signedPayload).digest('hex');
      const header = `t=${timestamp},v1=${v1}`;

      assert.equal(client.verifyWebhookSignature(payload, header), true);

      // Rejects tampered payload
      const tamperedPayload = JSON.stringify({ type: 'payment_intent.succeeded', id: 'pi_HACKED' });
      assert.equal(client.verifyWebhookSignature(tamperedPayload, header), false);

      // Rejects expired timestamp (> 300s)
      const expiredTimestamp = timestamp - 500;
      const expiredSigned = `${expiredTimestamp}.${payload}`;
      const expiredV1 = crypto.createHmac('sha256', webhookSecret).update(expiredSigned).digest('hex');
      const expiredHeader = `t=${expiredTimestamp},v1=${expiredV1}`;
      assert.equal(client.verifyWebhookSignature(payload, expiredHeader), false);
    });

    test('Stripe client strictly rejects negative amounts and unsafe floats/numbers', async () => {
      const mockStripe: any = { paymentIntents: { create: async () => ({}) } };
      const client = new StripePaymentClient({ stripeInstance: mockStripe });

      await assert.rejects(
        async () => {
          await client.createPaymentIntent({
            tenantId: TENANT_ID,
            amountFils: -500n,
            currency: 'AED'
          });
        },
        /Payment intent amount cannot be negative/
      );

      await assert.rejects(
        async () => {
          await client.refundPayment('pi_test', -100n);
        },
        /Refund amount cannot be negative/
      );
    });

    test('Fails closed in production if live credentials are missing or default', () => {
      const prevEnv = process.env.NODE_ENV;
      const prevKey = process.env.STRIPE_SECRET_KEY;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.STRIPE_SECRET_KEY;

        // Stripe must throw
        assert.throws(() => {
          new StripePaymentClient({ apiKey: 'sk_test_mock_stripe_key_default' });
        }, /FATAL: STRIPE_SECRET_KEY is required and must be a live secret key in production/);

        // Peppol ASP must throw
        assert.throws(() => {
          new PintAeAspClient({ apiKey: 'asp_sandbox_default_key' });
        }, /FATAL: EINVOICE_ASP_API_KEY is required/);

        // Lean must throw
        assert.throws(() => {
          new LeanOpenFinanceClient({ appToken: 'lean_sandbox_app_token' });
        }, /FATAL: LEAN_APP_TOKEN is required/);
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevKey !== undefined) {
          process.env.STRIPE_SECRET_KEY = prevKey;
        } else {
          delete process.env.STRIPE_SECRET_KEY;
        }
      }
    });
  });
});

