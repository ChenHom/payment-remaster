import AWS from 'aws-sdk';

export function createSQSClient(region: string | undefined, env: any = process.env) {
  if (!region) {
    region = env.AWS_REGION || 'us-east-1';
  }
  const config = { region } as any;
  if (env.AWS_ACCESS_KEY_ID) {
    config.accessKeyId = env.AWS_ACCESS_KEY_ID;
    config.secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
  }
  return new AWS.SQS(config);
}
