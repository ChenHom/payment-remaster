import { createSQSClient } from './client';

export async function sendMessage(queueUrl: string, body: any, env: any = process.env) {
  const sqs = createSQSClient(env.AWS_REGION, env);
  const params = {
    MessageBody: JSON.stringify(body),
    QueueUrl: queueUrl
  };
  return sqs.sendMessage(params).promise();
}
