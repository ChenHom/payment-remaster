import { ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { createSQSClient } from './client';
import { DBClient } from '../db/client';

export async function pollAndProcessWithDLQ(queueUrl: string, handler: (msg:any) => Promise<void>, dbClient: DBClient, env: any = process.env) {
  const sqs = createSQSClient(env.AWS_REGION, env);
  const receiveCommand = new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: 10,
    WaitTimeSeconds: 10
  });
  const res = await sqs.send(receiveCommand);
  if (!res.Messages) return;
  for (const m of res.Messages) {
    try {
      const body = JSON.parse(m.Body as string);
      await handler(body);
      const deleteCommand = new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: m.ReceiptHandle!
      });
      await sqs.send(deleteCommand);
    } catch (e: any) {
      try {
        // write into event_dead_letters
        const now = new Date().toISOString();
        await dbClient.query('INSERT INTO event_dead_letters (id, event_id, event_type, trace_id, payload, error_message, failed_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [
          'evdl-' + (m.MessageId || Math.random().toString(36).slice(2,10)),
          m.MessageId,
          JSON.parse(m.Body as string)?.event_type || 'unknown',
          JSON.parse(m.Body as string)?.trace_id || null,
          m.Body,
          (e && e.message) || 'Error processing event',
          now,
          now
        ]);
      } catch (ee) {
        // log
      }
      // let SQS handle redelivery and DLQ
    }
  }
}
