import crypto from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { UUID } from '@ledger-ae/shared-types';

export interface OutboxEvent<T = any> {
  id?: string;
  tenantId: string;
  eventType: string; // e.g., 'INVOICE_POSTED', 'EINVOICE_TRANSMITTED', 'RECONCILIATION_MATCHED', 'PERIOD_CLOSED'
  aggregateType: string; // e.g., 'INVOICE', 'JOURNAL_ENTRY', 'BANK_STATEMENT', 'PERIOD'
  aggregateId: string;
  payload: T;
  status?: 'PENDING' | 'PUBLISHED' | 'FAILED';
  retryCount?: number;
  nextRetryAt?: Date | null;
  createdAt?: Date;
}

export interface WebhookSubscription {
  id: string;
  tenantId: string;
  url: string;
  secret: string;
  subscribedEvents: string[];
  isActive: boolean;
  createdAt: Date;
}

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  attemptNumber: number;
  status: 'DELIVERED' | 'FAILED' | 'EXHAUSTED_DLQ';
}

/**
 * OutboxService implements the Transactional Outbox Pattern.
 * Guarantees that domain state mutations and integration events are written atomically in the same PostgreSQL transaction.
 */
export class OutboxService {
  /**
   * Inserts an event into the outbox table within the active database transaction.
   */
  static async recordEvent(
    client: PoolClient | Pool,
    event: OutboxEvent
  ): Promise<string> {
    const res = await client.query<{ id: string }>(
      `INSERT INTO outbox_events (
        tenant_id,
        event_type,
        aggregate_type,
        aggregate_id,
        payload,
        status,
        retry_count,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, 'PENDING', 0, NOW())
      RETURNING id;`,
      [
        event.tenantId,
        event.eventType,
        event.aggregateType,
        event.aggregateId,
        JSON.stringify(event.payload)
      ]
    );

    return res.rows[0].id;
  }

  /**
   * Fetches pending outbox events for dispatching, locking rows to prevent dual worker delivery.
   */
  static async fetchPendingEvents(
    client: PoolClient | Pool,
    limit: number = 50
  ): Promise<OutboxEvent[]> {
    const isMem = (client as any).isPgMem;
    const query = isMem
      ? `SELECT id, tenant_id as "tenantId", event_type as "eventType", aggregate_type as "aggregateType", aggregate_id as "aggregateId", payload, status, retry_count as "retryCount", next_retry_at as "nextRetryAt", created_at as "createdAt"
         FROM outbox_events WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT $1;`
      : `SELECT id, tenant_id as "tenantId", event_type as "eventType", aggregate_type as "aggregateType", aggregate_id as "aggregateId", payload, status, retry_count as "retryCount", next_retry_at as "nextRetryAt", created_at as "createdAt"
         FROM outbox_events WHERE status = 'PENDING' AND (next_retry_at IS NULL OR next_retry_at <= NOW()) ORDER BY created_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED;`;

    const res = await client.query(query, [limit]);
    return res.rows.map((row) => ({
      ...row,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
    }));
  }

  /**
   * Marks an outbox event as successfully published.
   */
  static async markPublished(
    client: PoolClient | Pool,
    eventId: string
  ): Promise<void> {
    await client.query(
      `UPDATE outbox_events SET status = 'PUBLISHED' WHERE id = $1;`,
      [eventId]
    );
  }

  /**
   * Records a failed delivery attempt with exponential backoff or marks as DLQ.
   */
  static async markFailed(
    client: PoolClient | Pool,
    eventId: string,
    currentRetryCount: number,
    maxRetries: number = 5
  ): Promise<{ status: 'PENDING' | 'FAILED'; nextRetryAt: Date | null }> {
    const newRetryCount = currentRetryCount + 1;

    if (newRetryCount >= maxRetries) {
      await client.query(
        `UPDATE outbox_events SET status = 'FAILED', retry_count = $1, next_retry_at = NULL WHERE id = $2;`,
        [newRetryCount, eventId]
      );
      return { status: 'FAILED', nextRetryAt: null };
    }

    // Exponential backoff: 2^attempt seconds (e.g. 2s, 4s, 8s, 16s...)
    const delayMs = Math.pow(2, newRetryCount) * 1000;
    const nextRetryAt = new Date(Date.now() + delayMs);

    await client.query(
      `UPDATE outbox_events SET retry_count = $1, next_retry_at = $2 WHERE id = $3;`,
      [newRetryCount, nextRetryAt, eventId]
    );

    return { status: 'PENDING', nextRetryAt };
  }
}

/**
 * WebhookDeliveryService handles cryptographically signed HTTP webhooks with retries and DLQ.
 */
export class WebhookDeliveryService {
  /**
   * Computes an HMAC-SHA256 signature over timestamp and JSON payload.
   */
  static signPayload(secret: string, timestamp: number, payloadString: string): string {
    const signaturePayload = `${timestamp}.${payloadString}`;
    const hmac = crypto
      .createHmac('sha256', secret)
      .update(signaturePayload)
      .digest('hex');
    return `sha256=${hmac}`;
  }

  /**
   * Verifies an incoming webhook signature using constant-time comparison to prevent timing attacks.
   */
  static verifySignature(
    secret: string,
    timestamp: number,
    payloadString: string,
    receivedSignatureHeader: string,
    toleranceSeconds: number = 300
  ): boolean {
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > toleranceSeconds) {
      return false; // Replay attack protection
    }

    const expectedSignature = this.signPayload(secret, timestamp, payloadString);
    if (expectedSignature.length !== receivedSignatureHeader.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'utf-8'),
      Buffer.from(receivedSignatureHeader, 'utf-8')
    );
  }

  /**
   * Delivers an outbox event to a webhook subscriber with HMAC signature headers and retry tracking.
   */
  static async deliverWebhook(
    subscription: { id: string; url: string; secret: string; tenantId: string },
    event: OutboxEvent,
    attemptNumber: number = 1,
    customFetch?: typeof fetch
  ): Promise<WebhookDeliveryResult> {
    const fetchImpl = customFetch || globalThis.fetch;
    const timestamp = Math.floor(Date.now() / 1000);
    const payloadString = JSON.stringify({
      id: event.id,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      timestamp: new Date().toISOString(),
      data: event.payload
    });

    const signature = this.signPayload(subscription.secret, timestamp, payloadString);

    try {
      const response = await fetchImpl(subscription.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ledger-Signature': signature,
          'X-Ledger-Timestamp': timestamp.toString(),
          'X-Ledger-Event-Id': event.id || '',
          'X-Ledger-Event-Type': event.eventType
        },
        body: payloadString
      });

      if (response.ok) {
        return {
          success: true,
          statusCode: response.status,
          attemptNumber,
          status: 'DELIVERED'
        };
      }

      const isDlq = attemptNumber >= 5;
      return {
        success: false,
        statusCode: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`,
        attemptNumber,
        status: isDlq ? 'EXHAUSTED_DLQ' : 'FAILED'
      };
    } catch (err: any) {
      const isDlq = attemptNumber >= 5;
      return {
        success: false,
        error: err.message || 'Network delivery failure',
        attemptNumber,
        status: isDlq ? 'EXHAUSTED_DLQ' : 'FAILED'
      };
    }
  }
}
