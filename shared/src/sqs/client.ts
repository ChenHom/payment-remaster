import { SQSClient, SQSClientConfig } from '@aws-sdk/client-sqs';

export function createSQSClient(region: string | undefined, env: any = process.env) {
  if (!region) {
    region = env.AWS_REGION || 'us-east-1';
  }
  const config: SQSClientConfig = { region };
  if (env.AWS_ACCESS_KEY_ID) {
    config.credentials = {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY
    };
  }
  return new SQSClient(config);
}
