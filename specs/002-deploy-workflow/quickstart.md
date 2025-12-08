# Quickstart: CI/CD Pipeline Setup

This guide describes how to configure the GitHub Actions CI/CD pipeline for the Payment Remaster project.

## Prerequisites

1. **GitHub Repository**: Admin access to configure Secrets and Environments.
2. **AWS Account**: IAM User with permissions for CloudFormation, Lambda, SQS, and IAM (to create roles).
3. **Cloudflare Account**: Account ID and API Token.

## Step 1: Configure Environments

1. Go to **Settings** -> **Environments**.
2. Create two environments:
   - `staging`
   - `production`
3. For `production`, consider adding a **Protection Rule** (Reviewers) to require manual approval before jobs can run.

## Step 2: Configure Secrets

Go to **Settings** -> **Secrets and variables** -> **Actions**.

### Repository Secrets (Shared)
Add these for global access:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (e.g., `ap-northeast-1`)
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

### Environment Secrets
Add these to **both** `staging` and `production` environments with appropriate values:
- `DATABASE_URL`
- `WEBHOOK_SECRET`
- `MOCK_CALLBACK_TOKEN`
- `TEST_MERCHANT_KEY`

## Step 3: Triggering Deployments

### Staging
- Simply **push a commit** to the `main` branch.
- The `Deploy Staging` workflow will run automatically.

### Production
1. Go to the **Actions** tab.
2. Select **Deploy Production** workflow from the left sidebar.
3. Click **Run workflow**.
4. Check **Confirm Deployment**.
5. Click **Run workflow**.

## Verification

After deployment, check the workflow logs. The "Summary" step will list the deployed service URLs.
You can verify the deployment by running:

```bash
curl https://<order-ingress-url>/health
```
