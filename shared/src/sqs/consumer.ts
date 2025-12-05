import { ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { createSQSClient } from './client';

export async function pollAndProcess(queueUrl: string, handler: (msg:any) => Promise<void>, env: any = process.env) {
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
    } catch (e) {
      // log and continue; SQS will redeliver until DLQ
    }
  }
}
