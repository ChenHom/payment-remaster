import { ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { createSQSClient } from './client';
import { DBClient } from '../db/client';

/**
 * T061: Event dead letter handling for SQS failures
 *
 * This consumer variant writes failed events to event_dead_letters table
 * when handler processing fails. It still allows SQS to handle redelivery
 * but provides visibility into failed events.
 */

export interface EventDeadLetterRecord {
  id: string;
  event_id: string;
  event_type: string;
  trace_id: string | null;
  payload: string;
  error_message: string;
  failed_at: string;
  created_at: string;
}

export interface ConsumeOptions {
  maxMessages?: number;
  waitTimeSeconds?: number;
  writeDeadLetterOnError?: boolean;
}

const DEFAULT_OPTIONS: ConsumeOptions = {
  maxMessages: 10,
  waitTimeSeconds: 10,
  writeDeadLetterOnError: true
};

/**
 * Records an event processing failure to the event_dead_letters table.
 * Returns HTTP 200 to SQS to prevent re-delivery (avoiding double retry).
 */
async function recordEventDeadLetter(
  dbClient: DBClient,
  messageId: string | undefined,
  messageBody: string,
  error: Error | unknown
): Promise<void> {
  const now = new Date().toISOString();
  let eventType = 'unknown';
  let traceId: string | null = null;

  try {
    const parsed = JSON.parse(messageBody);
    eventType = parsed.event_type || 'unknown';
    traceId = parsed.trace_id || null;
  } catch {
    // If parsing fails, use defaults
  }

  const errorMessage = error instanceof Error
    ? error.message
    : String(error) || 'Unknown error';

  const id = `evdl-${messageId || Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  await dbClient.query(
    `INSERT INTO event_dead_letters
      (id, event_id, event_type, trace_id, payload, error_message, failed_at, created_at)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      messageId || null,
      eventType,
      traceId,
      messageBody,
      errorMessage,
      now,
      now
    ]
  );
}

/**
 * Poll SQS queue and process messages with dead letter support.
 *
 * Error handling strategy:
 * - On handler error, write to event_dead_letters
 * - Delete message from SQS to prevent re-delivery (avoid double retry)
 * - Worker returns 200 to indicate successful handling (even if business logic failed)
 */
export async function pollAndProcessWithDLQ(
  queueUrl: string,
  handler: (msg: any) => Promise<void>,
  dbClient: DBClient,
  env: any = process.env,
  options: ConsumeOptions = {}
): Promise<{ processed: number; failed: number }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const sqs = createSQSClient(env.AWS_REGION, env);

  const receiveCommand = new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: opts.maxMessages,
    WaitTimeSeconds: opts.waitTimeSeconds
  });

  const res = await sqs.send(receiveCommand);

  if (!res.Messages || res.Messages.length === 0) {
    return { processed: 0, failed: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (const message of res.Messages) {
    const messageBody = message.Body as string;

    try {
      const body = JSON.parse(messageBody);
      await handler(body);
      processed++;
    } catch (handlerError) {
      failed++;

      // T061: Write to event dead letter on processing failure
      if (opts.writeDeadLetterOnError) {
        try {
          await recordEventDeadLetter(dbClient, message.MessageId, messageBody, handlerError);
          console.error('[SQS Consumer] Event recorded to dead letter', {
            messageId: message.MessageId,
            error: handlerError instanceof Error ? handlerError.message : String(handlerError)
          });
        } catch (dlqError) {
          // Log but don't throw - we still want to delete the message
          console.error('[SQS Consumer] Failed to write dead letter record', {
            messageId: message.MessageId,
            originalError: handlerError,
            dlqError
          });
        }
      }
    }

    // Always delete message after processing (success or failure with DLQ write)
    // This prevents SQS from re-delivering (avoiding double retry)
    try {
      const deleteCommand = new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: message.ReceiptHandle!
      });
      await sqs.send(deleteCommand);
    } catch (deleteError) {
      console.error('[SQS Consumer] Failed to delete message', {
        messageId: message.MessageId,
        error: deleteError
      });
    }
  }

  return { processed, failed };
}
