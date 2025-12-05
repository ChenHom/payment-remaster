import AWS from 'aws-sdk';

export async function pollAndProcess(queueUrl: string, handler: (msg:any) => Promise<void>, env: any = process.env) {
  const sqs = new AWS.SQS({ region: env.AWS_REGION || 'us-east-1' });
  const params = { QueueUrl: queueUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: 10 };
  const res = await sqs.receiveMessage(params).promise();
  if (!res.Messages) return;
  for (const m of res.Messages) {
    try {
      const body = JSON.parse(m.Body as string);
      await handler(body);
      await sqs.deleteMessage({ QueueUrl: queueUrl, ReceiptHandle: m.ReceiptHandle! }).promise();
    } catch (e) {
      // log and continue; SQS will redeliver until DLQ
    }
  }
}
