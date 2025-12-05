import { computeSignature } from '../../../shared/src/http/signature';
import { createPgDeadLetterRepository, type DeadLetterRepository } from '../../../shared/src/db/repositories/dead-letter';
import { createDBClient, type DBClient } from '../../../shared/src/db/client';

/**
 * Webhook retry configuration (from spec.md)
 * - 第 1 次重試：10 秒後
 * - 第 2 次重試：30 秒後
 * - 第 3 次重試：60 秒後
 */
const RETRY_DELAYS_MS = [10_000, 30_000, 60_000];
const MAX_RETRIES = 3;
const WEBHOOK_TIMEOUT_MS = 3000;

interface Env {
  WEBHOOK_URL?: string;
  WEBHOOK_SECRET?: string;
  DATABASE_URL?: string;
  AWS_REGION?: string;
}

interface OrderStatusChangedEvent {
  event_id: string;
  event_type: 'order.status.changed';
  trace_id: string;
  timestamp: string;
  payload: {
    order_id: string;
    merchant_id: string;
    merchant_order_no: string;
    previous_status: string;
    new_status: string;
  };
}

interface WebhookPayload {
  order_id: string;
  merchant_order_no: string;
  status: string;
}

interface WebhookResult {
  success: boolean;
  attempts: number;
  lastError?: string;
  lastHttpStatus?: number;
}

/**
 * Send webhook notification with signature
 */
async function sendWebhook(
  url: string,
  payload: WebhookPayload,
  secret: string,
  timeoutMs = WEBHOOK_TIMEOUT_MS
): Promise<{ ok: boolean; status: number }> {
  const body = JSON.stringify(payload);
  const signature = computeSignature(secret, body);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature
      },
      body,
      signal: controller.signal
    });
    return { ok: response.ok, status: response.status };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Check if HTTP status code is retryable
 * Retryable: 5xx, timeout, connection error
 * Not retryable: 4xx
 */
function isRetryable(status: number): boolean {
  return status >= 500 && status < 600;
}

/**
 * Execute webhook with retry logic
 */
async function executeWebhookWithRetry(
  webhookUrl: string,
  payload: WebhookPayload,
  secret: string,
  traceId: string,
  delayFn: (ms: number) => Promise<void> = (ms) => new Promise(r => setTimeout(r, ms))
): Promise<WebhookResult> {
  let attempts = 0;
  let lastError = '';
  let lastHttpStatus: number | undefined;

  // Initial attempt
  attempts++;
  console.log('[Webhook Notifier] Sending webhook', {
    trace_id: traceId,
    order_id: payload.order_id,
    attempt: attempts,
    url: webhookUrl
  });

  try {
    const result = await sendWebhook(webhookUrl, payload, secret);
    lastHttpStatus = result.status;
    if (result.ok) {
      console.log('[Webhook Notifier] Webhook sent successfully', {
        trace_id: traceId,
        order_id: payload.order_id,
        attempts
      });
      return { success: true, attempts };
    }
    if (!isRetryable(result.status)) {
      // 4xx - don't retry
      console.warn('[Webhook Notifier] Webhook rejected (4xx), not retrying', {
        trace_id: traceId,
        order_id: payload.order_id,
        status: result.status
      });
      lastError = `Webhook rejected with status ${result.status}`;
      return { success: false, attempts, lastError, lastHttpStatus };
    }
    lastError = `Webhook failed with status ${result.status}`;
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'Unknown error';
    console.warn('[Webhook Notifier] Initial attempt failed', {
      trace_id: traceId,
      order_id: payload.order_id,
      error: lastError
    });
  }

  // Retry loop
  for (let i = 0; i < MAX_RETRIES; i++) {
    const delayMs = RETRY_DELAYS_MS[i];
    console.log('[Webhook Notifier] Waiting before retry', {
      trace_id: traceId,
      order_id: payload.order_id,
      retry: i + 1,
      delay_seconds: delayMs / 1000
    });

    await delayFn(delayMs);

    attempts++;
    try {
      const result = await sendWebhook(webhookUrl, payload, secret);
      lastHttpStatus = result.status;
      if (result.ok) {
        console.log('[Webhook Notifier] Webhook sent successfully after retry', {
          trace_id: traceId,
          order_id: payload.order_id,
          attempts
        });
        return { success: true, attempts };
      }
      if (!isRetryable(result.status)) {
        lastError = `Webhook rejected with status ${result.status}`;
        console.warn('[Webhook Notifier] Webhook rejected (4xx), stopping retries', {
          trace_id: traceId,
          order_id: payload.order_id,
          status: result.status
        });
        return { success: false, attempts, lastError, lastHttpStatus };
      }
      lastError = `Webhook failed with status ${result.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
    }

    console.warn('[Webhook Notifier] Retry failed', {
      trace_id: traceId,
      order_id: payload.order_id,
      retry: i + 1,
      error: lastError
    });
  }

  return { success: false, attempts, lastError, lastHttpStatus };
}

/**
 * T064: Handle webhook retry exhausted - write to dead letter
 * T065: ERROR level logging when entering dead letter
 */
async function handleDeadLetter(
  deadLetterRepo: DeadLetterRepository,
  event: OrderStatusChangedEvent,
  payload: WebhookPayload,
  webhookUrl: string,
  webhookResult: WebhookResult
): Promise<void> {
  const { order_id, merchant_id } = event.payload;
  const { trace_id } = event;

  // T065: ERROR level logging when entering dead letter
  console.error('[Webhook Notifier] Webhook retry exhausted, entering dead letter', {
    trace_id,
    order_id,
    merchant_id,
    webhook_url: webhookUrl,
    total_attempts: webhookResult.attempts,
    last_error: webhookResult.lastError,
    last_http_status: webhookResult.lastHttpStatus
  });

  // T064: Create/update dead letter record using upsert for idempotency
  await deadLetterRepo.upsert({
    order_id,
    merchant_id,
    webhook_url: webhookUrl,
    payload: JSON.stringify(payload),
    last_error_message: webhookResult.lastError || 'Unknown error after retries',
    last_http_status: webhookResult.lastHttpStatus,
    additional_retry_count: MAX_RETRIES
  });
}

/**
 * Main request handler
 */
export async function handleRequest(request: Request, env: Env = {}): Promise<Response> {
  const url = new URL(request.url);

  // Health check endpoint
  if (request.method === 'GET' && url.pathname === '/health') {
    return new Response(JSON.stringify({
      status: 'ok',
      service: 'merchant-webhook-notifier',
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // SQS event endpoint
  if (request.method === 'POST' && url.pathname === '/sqs/order-status-changed') {
    return handleOrderStatusChanged(request, env);
  }

  // Legacy POST handler for backward compatibility
  if (request.method === 'POST') {
    return handleOrderStatusChanged(request, env);
  }

  return new Response(JSON.stringify({ error: 'Not Found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleOrderStatusChanged(request: Request, env: Env): Promise<Response> {
  let dbClient: DBClient | null = null;

  try {
    const event = await request.json() as OrderStatusChangedEvent;
    const { order_id, merchant_id, merchant_order_no, new_status } = event.payload;
    const { trace_id } = event;

    // Structured logging
    console.log('[Webhook Notifier] Processing OrderStatusChanged event', {
      trace_id,
      event_id: event.event_id,
      order_id,
      merchant_id,
      new_status
    });

    // Get webhook configuration
    // TODO: In production, lookup merchant webhook URL from database
    const webhookUrl = env.WEBHOOK_URL || 'https://merchant.example.com/webhook';
    const webhookSecret = env.WEBHOOK_SECRET || 'WEBHOOK_SECRET';

    // Build webhook payload
    const payload: WebhookPayload = {
      order_id,
      merchant_order_no,
      status: new_status
    };

    // Execute webhook with retry
    const result = await executeWebhookWithRetry(
      webhookUrl,
      payload,
      webhookSecret,
      trace_id
    );

    if (result.success) {
      return new Response(JSON.stringify({
        status: 'ok',
        order_id,
        attempts: result.attempts
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Webhook failed after all retries - write to dead letter
    if (env.DATABASE_URL) {
      dbClient = createDBClient(env.DATABASE_URL);
      const deadLetterRepo = createPgDeadLetterRepository(dbClient);
      await handleDeadLetter(deadLetterRepo, event, payload, webhookUrl, result);
    } else {
      // T065: Log error even if database is not configured
      console.error('[Webhook Notifier] Dead letter skipped - no database configured', {
        trace_id,
        order_id,
        merchant_id
      });
    }

    return new Response(JSON.stringify({
      status: 'dead_letter',
      order_id,
      attempts: result.attempts,
      error: result.lastError
    }), {
      status: 200, // Return 200 to prevent SQS re-delivery
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Webhook Notifier] Request processing failed', { error: errorMessage });

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export default { fetch: handleRequest };
