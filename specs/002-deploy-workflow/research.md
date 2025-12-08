# Research: Deployment Workflow Automation

## Technical Decisions

### 1. CI/CD Platform: GitHub Actions

**Decision**: Use GitHub Actions for both Staging and Production pipelines.
**Rationale**: 
- Native integration with the repository.
- Free tier availability.
- "Environments" feature allows separation of secrets (Staging vs. Prod).
- Extensive marketplace for AWS and Cloudflare actions (though we will use CLI tools for consistency with local scripts).

### 2. Secret Management

**Decision**: Use GitHub Secrets combined with GitHub Environments.
**Rationale**: 
- Secure storage of sensitive credentials (AWS keys, CF tokens).
- Environment-specific secrets allow using different credentials/configs for Staging and Production without changing the workflow definition.
- **Required Secrets**:
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
  - `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
  - `DATABASE_URL` (for DB migrations/checks)
  - `WEBHOOK_SECRET`, `MOCK_CALLBACK_TOKEN`, `TEST_MERCHANT_KEY` (Application configs)

### 3. Pipeline Orchestration (Lambda -> Workers Dependency)

**Decision**: Deploy Lambda Bridge first, verify outputs, then deploy Workers.
**Rationale**: 
- Workers depend on SQS Queue URLs (often hardcoded or passed as vars). 
- `scripts/deploy-lambda.sh` outputs the Queue URLs. 
- **Enhancement**: The CI pipeline should capture the `SQSQueueUrl` from the Lambda deployment step and inject it as a variable (`SQS_QUEUE_URL`) into the Worker deployment step to ensure they are synchronized.

### 4. Concurrency Control

**Decision**: Use GitHub Actions `concurrency` groups.
**Rationale**: 
- Prevents race conditions if multiple commits are pushed rapidly.
- For Staging: `cancel-in-progress: true` (prefer latest code).
- For Production: `cancel-in-progress: false` (ensure stable rollout).

### 5. Verification Strategy

**Decision**: 
- Pre-deploy: Run unit/integration tests (`pnpm test`).
- Post-deploy: Use a dedicated `verify-deployment` step that hits the `/health` endpoints.
- **Tools**: `curl` in a shell step, utilizing the Health Check API defined in Feature 001.

## Alternatives Considered

### Alternative A: Cloudflare Pages CI
- **Pros**: Native for Workers.
- **Cons**: Doesn't support AWS Lambda deployment natively; would need complex custom build steps.

### Alternative B: AWS CodePipeline
- **Pros**: Great for Lambda.
- **Cons**: Overkill for Cloudflare Workers; easier to orchestrate everything from GitHub Actions which sits "above" both providers.

## Implementation Details

### Workflow Triggers
- **Staging**: `on: push: branches: [main]`
- **Production**: `on: workflow_dispatch` (Manual)

### Environment Variables Pattern
- We will reuse the existing bash scripts (`deploy-lambda.sh`, `deploy-workers.sh`) to ensure local dev and CI use the exact same logic.
- The CI workflow will essentially be a wrapper ensuring tools are installed and secrets are exposed as env vars.
