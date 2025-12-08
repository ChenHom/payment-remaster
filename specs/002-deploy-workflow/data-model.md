# Data Model: Configuration & Secrets

## GitHub Secrets Schema

The following secrets must be configured in the GitHub Repository (Settings -> Secrets and variables -> Actions).

### Global Secrets (Repository Scope)

| Name | Description | Example Value |
|------|-------------|---------------|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID | `a1b2c3d4...` |
| `CLOUDFLARE_API_TOKEN` | API Token with Workers permissions | `xYz123...` |
| `AWS_ACCESS_KEY_ID` | IAM User Key for SAM deployment | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | IAM User Secret | `secret...` |

### Environment Secrets (Staging / Production)

These secrets should be defined in their respective GitHub Environments (`staging`, `production`) to allow isolation.

| Name | Description | Example Value |
|------|-------------|---------------|
| `DATABASE_URL` | PostgreSQL Connection String | `postgres://user:pass@host:5432/db` |
| `WEBHOOK_SECRET` | Secret for signing merchant webhooks | `whsec_...` |
| `MOCK_CALLBACK_TOKEN` | Token for validating upstream callbacks | `mock_token_...` |
| `TEST_MERCHANT_KEY` | API Key for E2E testing | `test_key_...` |

## Environment Variables Map

Mapping GitHub Secrets to Script Environment Variables:

| Script Variable | GitHub Secret Source |
|-----------------|----------------------|
| `CLOUDFLARE_ACCOUNT_ID` | `secrets.CLOUDFLARE_ACCOUNT_ID` |
| `CLOUDFLARE_API_TOKEN` | `secrets.CLOUDFLARE_API_TOKEN` |
| `AWS_ACCESS_KEY_ID` | `secrets.AWS_ACCESS_KEY_ID` |
| `AWS_SECRET_ACCESS_KEY` | `secrets.AWS_SECRET_ACCESS_KEY` |
| `DATABASE_URL` | `secrets.DATABASE_URL` |
| `WEBHOOK_SECRET` | `secrets.WEBHOOK_SECRET` |
| `MOCK_CALLBACK_TOKEN` | `secrets.MOCK_CALLBACK_TOKEN` |
| `TEST_MERCHANT_KEY` | `secrets.TEST_MERCHANT_KEY` |
