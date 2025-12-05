import fetch from 'node-fetch';
import type { SQSEvent, SQSBatchResponse, SQSBatchItemFailure, Context } from 'aws-lambda';

/**
 * T068: Webhook Notifier Trigger Lambda Handler
 *
 * Consumes SQS OrderStatusChanged events (BatchSize=10) and forwards to Workers.
 *
 * Retry Logic:
 * - 5xx/timeout → Lambda fails (SQS redelivers)
 * - 4xx → Success (don't retry, message is acknowledged)
 */

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

interface LambdaResult {
  messageId: string;
  success: boolean;
  statusCode?: number;
  error?: string;
}

// Environment configuration
const HTTP_TIMEOUT_MS = parseInt(process.env.HTTP_TIMEOUT || '5000', 10);

async function forwardToWorker(
  workerEndpoint: string,
  event: OrderStatusChangedEvent,
  messageId: string
): Promise<LambdaResult> {
  const traceId = event.trace_id || `trace-${messageId}`;

  console.log('[Webhook Notifier Trigger] Processing message', {
    message_id: messageId,
    trace_id: traceId,
    order_id: event.payload?.order_id,
    new_status: event.payload?.new_status
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(`${workerEndpoint}/sqs/order-status-changed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Trace-Id': traceId,
        'X-Message-Id': messageId
      },
      body: JSON.stringify(event),
      signal: controller.signal as any
    });

    clearTimeout(timeoutId);

    const statusCode = response.status;

    // 4xx - Don't retry, acknowledge message
    if (statusCode >= 400 && statusCode < 500) {
      console.warn('[Webhook Notifier Trigger] Worker rejected message (4xx)', {
        message_id: messageId,
        trace_id: traceId,
        status: statusCode
      });
      return { messageId, success: true, statusCode }; // Success = don't retry
    }

    // 5xx - Fail, let SQS redeliver
    if (statusCode >= 500) {
      console.error('[Webhook Notifier Trigger] Worker error (5xx), will retry', {
        message_id: messageId,
        trace_id: traceId,
        status: statusCode
      });
      return { messageId, success: false, statusCode, error: `HTTP ${statusCode}` };
    }

    // 2xx - Success
    console.log('[Webhook Notifier Trigger] Message processed successfully', {
      message_id: messageId,
      trace_id: traceId,
      status: statusCode
    });
    return { messageId, success: true, statusCode };

  } catch (error) {
    clearTimeout(timeoutId);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error('[Webhook Notifier Trigger] Request failed', {
      message_id: messageId,
      trace_id: traceId,
      error: errorMessage
    });

    return { messageId, success: false, error: errorMessage };
  }
}

export async function handler(
  event: SQSEvent,
  context: Context
): Promise<SQSBatchResponse> {
  const workerEndpoint = process.env.WEBHOOK_NOTIFIER_URL;

  if (!workerEndpoint) {
    console.error('[Webhook Notifier Trigger] WEBHOOK_NOTIFIER_URL not configured');
    // Return all messages as failed to trigger redelivery
    return {
      batchItemFailures: event.Records.map(record => ({
        itemIdentifier: record.messageId
      }))
    };
  }

  console.log('[Webhook Notifier Trigger] Processing batch', {
    batch_size: event.Records.length,
    request_id: context.awsRequestId
  });

  const results = await Promise.all(
    event.Records.map(async (record) => {
      try {
        const body = JSON.parse(record.body) as OrderStatusChangedEvent;
        return await forwardToWorker(workerEndpoint, body, record.messageId);
      } catch (parseError) {
        console.error('[Webhook Notifier Trigger] Failed to parse message body', {
          message_id: record.messageId,
          error: parseError instanceof Error ? parseError.message : 'Parse error'
        });
        // Parsing error - don't retry (message is malformed)
        return { messageId: record.messageId, success: true };
      }
    })
  );

  // Collect failures for partial batch response
  const batchItemFailures: SQSBatchItemFailure[] = results
    .filter(r => !r.success)
    .map(r => ({ itemIdentifier: r.messageId }));

  console.log('[Webhook Notifier Trigger] Batch complete', {
    total: event.Records.length,
    succeeded: results.filter(r => r.success).length,
    failed: batchItemFailures.length
  });

  return { batchItemFailures };
}

export default { handler };
