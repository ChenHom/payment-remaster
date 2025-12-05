import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { createSQSClient } from './client';

export async function sendMessage(queueUrl: string, body: any, env: any = process.env) {
  const sqs = createSQSClient(env.AWS_REGION, env);
  const command = new SendMessageCommand({
    MessageBody: JSON.stringify(body),
    QueueUrl: queueUrl
  });
  return sqs.send(command);
}
