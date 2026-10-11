import crypto from 'node:crypto';
import Stripe from 'stripe';
import {
  PaymentGatewayClient,
  CreatePaymentIntentParams,
  PaymentIntentResult,
  PaymentCaptureResult,
  PaymentRefundResult
} from './contracts.js';

export interface StripeGatewayConfig {
  apiKey?: string;
  webhookSecret?: string;
  stripeInstance?: Stripe;
}

/**
 * Real Stripe Payment Gateway Client for LedgerAE.
 * Processes UAE corporate card payments and subscriptions in AED and foreign currencies.
 * All monetary amounts are handled strictly as integer minor units (fils/cents).
 */
export class StripePaymentClient implements PaymentGatewayClient {
  private stripe: Stripe;
  private webhookSecret: string;

  constructor(config: StripeGatewayConfig = {}) {
    const isProduction = process.env.NODE_ENV === 'production';
    const key = config.apiKey || process.env.STRIPE_SECRET_KEY;

    if (isProduction && (!key || key.startsWith('sk_test_') || key === 'sk_test_mock_stripe_key_default')) {
      throw new Error('FATAL: STRIPE_SECRET_KEY is required and must be a live secret key in production (fail closed).');
    }

    const effectiveKey = key || 'sk_test_mock_stripe_key_default';
    this.webhookSecret = config.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_mock_stripe_secret';
    this.stripe = config.stripeInstance || new Stripe(effectiveKey, { apiVersion: '2026-02-25.acacia' as any });
  }

  async createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult> {
    // Stripe accepts integer amounts in minor units (fils for AED, cents for USD)
    // Strictly validate that amountFils is within safe integer bounds without floating point operations
    if (params.amountFils < 0n) {
      throw new Error('Payment intent amount cannot be negative.');
    }
    if (params.amountFils > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('Payment amount exceeds maximum integer precision limit.');
    }
    const amountMinorUnits = Number(params.amountFils);
    if (!Number.isSafeInteger(amountMinorUnits)) {
      throw new Error('Payment amount must be a safe integer.');
    }

    const intent = await this.stripe.paymentIntents.create({
      amount: amountMinorUnits,
      currency: params.currency.toLowerCase(),
      metadata: {
        tenantId: params.tenantId,
        invoiceId: params.invoiceId || '',
        ...(params.metadata || {})
      },
      receipt_email: params.customerEmail,
      capture_method: 'manual' // Support authorization & capture workflow
    });

    return {
      intentId: intent.id,
      clientSecret: intent.client_secret || '',
      amountFils: BigInt(intent.amount),
      currency: intent.currency.toUpperCase(),
      status: intent.status as any,
      createdAt: new Date(intent.created * 1000).toISOString()
    };
  }

  async capturePayment(intentId: string): Promise<PaymentCaptureResult> {
    const captured = await this.stripe.paymentIntents.capture(intentId);

    return {
      intentId: captured.id,
      status: captured.status === 'succeeded' ? 'succeeded' : 'failed',
      amountCapturedFils: BigInt(captured.amount_received || captured.amount),
      capturedAt: new Date().toISOString()
    };
  }

  async refundPayment(intentId: string, amountFils?: bigint): Promise<PaymentRefundResult> {
    let refundAmount: number | undefined;
    if (amountFils !== undefined) {
      if (amountFils < 0n) {
        throw new Error('Refund amount cannot be negative.');
      }
      if (amountFils > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error('Refund amount exceeds maximum integer precision limit.');
      }
      refundAmount = Number(amountFils);
      if (!Number.isSafeInteger(refundAmount)) {
        throw new Error('Refund amount must be a safe integer.');
      }
    }

    const refund = await this.stripe.refunds.create({
      payment_intent: intentId,
      amount: refundAmount
    });

    return {
      refundId: refund.id,
      intentId,
      amountRefundedFils: BigInt(refund.amount),
      status: refund.status === 'succeeded' ? 'succeeded' : 'pending'
    };
  }

  verifyWebhookSignature(payload: string, signatureHeader: string, secretOverride?: string): boolean {
    const secret = secretOverride || this.webhookSecret;
    if (!secret || !signatureHeader) return false;

    try {
      // Split header into timestamp (t) and signature (v1)
      const parts = signatureHeader.split(',');
      const timestampPart = parts.find((p) => p.startsWith('t='));
      const sigPart = parts.find((p) => p.startsWith('v1='));

      if (!timestampPart || !sigPart) return false;

      const timestamp = timestampPart.slice(2);
      const signature = sigPart.slice(3);

      // Verify timestamp tolerance (within 300 seconds)
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
        return false;
      }

      // Compute expected HMAC-SHA256 signature
      const signedPayload = `${timestamp}.${payload}`;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

      if (expectedSignature.length !== signature.length) {
        return false;
      }

      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'utf-8'),
        Buffer.from(signature, 'utf-8')
      );
    } catch {
      return false;
    }
  }
}
