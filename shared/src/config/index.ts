export interface EnvConfig {
  DB: any; // Hyperdrive binding or connection string
  DATABASE_URL?: string;
  SQS_QUEUE_URL?: string;
  AWS_REGION?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  WEBHOOK_SECRET?: string;
  TEST_MERCHANT_KEY?: string;
  MOCK_PROVIDER_URL?: string;
  MOCK_CALLBACK_TOKEN?: string;
}

export function fromEnv(env: any): EnvConfig {
  return {
    DB: env.DB,
    DATABASE_URL: env.DATABASE_URL,
    SQS_QUEUE_URL: env.SQS_QUEUE_URL,
    AWS_REGION: env.AWS_REGION,
    AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_ACCESS_KEY,
    WEBHOOK_SECRET: env.WEBHOOK_SECRET,
    TEST_MERCHANT_KEY: env.TEST_MERCHANT_KEY,
    MOCK_PROVIDER_URL: env.MOCK_PROVIDER_URL,
    MOCK_CALLBACK_TOKEN: env.MOCK_CALLBACK_TOKEN
  };
}
