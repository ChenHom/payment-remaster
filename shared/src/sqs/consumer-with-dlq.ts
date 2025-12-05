import AWS from 'aws-sdk';
import { DBClient } from '../db/client';

export async function pollAndProcessWithDLQ(queueUrl: string, handler: (msg:any) => Promise<void>, dbClient: DBClient, env: any = process.env) {
  const sqs = new AWS.SQS({ region: env.AWS_REGION || 'us-east-1' });
  const params = { QueueUrl: queueUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: 10 };
  const res = await sqs.receiveMessage(params).promise();
  if (!res.Messages) return;
  for (const m of res.Messages) {
    try {
      const body = JSON.parse(m.Body as string);
      await handler(body);
      await sqs.deleteMessage({ QueueUrl: queueUrl, ReceiptHandle: m.ReceiptHandle! }).promise();
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
