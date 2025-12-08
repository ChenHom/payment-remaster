# Feature Specification: Deployment Workflow Automation

**Feature Branch**: `002-deploy-workflow`
**Created**: 2025-12-08
**Status**: Draft
**Input**: Implement deployment to places mentioned in the file (Automate deployment to Cloudflare Workers and AWS Lambda)

## Clarifications

### Session 2025-12-08

- Q: How should the Lambda deployment script output the SQS Queue URL for the Workers deployment? → A: GitHub Output format (`name=value >> $GITHUB_OUTPUT`)
- Q: What deployment tool/mode should be used for the Lambda Bridge? → A: SAM CLI (using `lambda-bridge/template.yaml`)
- Q: How to handle secret separation between Staging and Production? → A: Strict Separation (Map environment-specific secrets to generic script variables)
- Q: What defines a successful health check for deployment verification? → A: in dev or after deploy
- Q: How should partial deployment failures (e.g., Lambda succeeds, Workers fail) be handled? → A: Manual Rollback (Pipeline stops; engineer manually reverts)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automated Staging Deployment (Priority: P1)

As a developer, I want my code to be automatically deployed to the Staging environment whenever I merge changes to the `main` branch, so that I can immediately verify integration in a live environment without manual steps.

**Why this priority**: Automation reduces human error and ensures the staging environment is always up-to-date with the latest codebase, accelerating the feedback loop.

**Independent Test**: Push a commit to `main` and verify that the GitHub Actions workflow triggers, succeeds, and the changes are reflected in the Staging environment endpoints.

**Acceptance Scenarios**:

1. **Given** a valid commit pushed to the `main` branch, **When** the CI pipeline runs, **Then** it automatically deploys both Lambda Bridge and Cloudflare Workers to the Staging environment.
2. **Given** a commit that fails unit tests, **When** the CI pipeline runs, **Then** the deployment step is skipped and the workflow is marked as failed.
3. **Given** a deployment failure (e.g., AWS API error), **When** the workflow finishes, **Then** it reports a failure status and does not leave the environment in an inconsistent state (standard CloudFormation behavior).

---

### User Story 2 - Production Deployment via Manual Trigger (Priority: P2)

As a release manager, I want to trigger a deployment to the Production environment manually after validating the Staging environment, so that I have control over when changes go live to customers.

**Why this priority**: Production deployments require strict control and validation. Automated deployment to production carries higher risk, so a manual gate is essential for this stage.

**Independent Test**: Trigger the "Deploy to Production" workflow manually in GitHub Actions UI and verify the Production environment endpoints are updated.

**Acceptance Scenarios**:

1. **Given** a stable build on `main`, **When** I manually trigger the production deployment workflow, **Then** the system requests confirmation (if configured) and deploys to Production.
2. **Given** the deployment is triggered, **When** the process completes, **Then** the system outputs the Production environment URLs for verification.

---

### User Story 3 - Environment Secret Management (Priority: P3)

As an administrator, I need a clear mechanism to configure and validate all required secrets (AWS credentials, Cloudflare tokens, database URLs) in the CI environment, so that deployments can authenticate successfully.

**Why this priority**: Without correct secrets, automated deployments will fail. This foundation is necessary for US1 and US2.

**Independent Test**: Configure secrets in the repository and run a "Validate Configuration" workflow or script that checks connectivity without deploying.

**Acceptance Scenarios**:

1. **Given** a list of required secrets (AWS_ACCESS_KEY, CF_API_TOKEN, etc.), **When** I configure them in GitHub Repository Secrets, **Then** the deployment workflow can successfully read them during execution.
2. **Given** missing secrets, **When** the workflow starts, **Then** it fails early with a clear error message indicating which secret is missing.

### Edge Cases

- **Concurrent Deployments**: What happens if two commits are pushed to `main` rapidly? (GitHub Actions concurrency groups should cancel the older run or queue them).
- **Partial Failure**: What if Lambda deploys but Workers fail? (Pipeline should fail; manual rollback or retry required).
- **Credential Rotation**: How to handle expired API tokens? (Pipeline fails auth check).

## Requirements *(mandatory)*

### Functional Requirements

**CI/CD Pipeline**
- **FR-001**: System MUST provide a GitHub Actions workflow for Staging deployment triggered by pushes to `main`.
- **FR-002**: System MUST provide a GitHub Actions workflow for Production deployment triggered by `workflow_dispatch`.
- **FR-003**: The pipeline MUST execute the following logical steps in order:
  1. Checkout code
  2. Install project dependencies
  3. Run static analysis (linting/type-checking)
  4. Run unit and integration tests
  5. Deploy Lambda Bridge components using **AWS SAM CLI**. **Constraint**: `scripts/deploy-lambda.sh` MUST output the created SQS Queue URL in GitHub Output format (e.g., `echo "sqs_queue_url=https://..." >> $GITHUB_OUTPUT`) to be consumed by subsequent steps.
  6. Deploy Cloudflare Workers components. **Constraint**: Workers deployment must accept the `SQS_QUEUE_URL` captured from the Lambda deployment step.
- **FR-004**: The pipeline MUST support environment separation (Staging vs. Production) using GitHub Environments or input variables. **Constraint**: Secrets must be strictly separated and mapped explicitly in the workflow (e.g., `DATABASE_URL` env var is populated from `STAGING_DATABASE_URL` secret for staging job).

**Configuration & Security**
- **FR-005**: System MUST securely inject secrets from GitHub Secrets into the build environment.
- **FR-006**: System MUST utilize concurrency control to prevent overlapping deployments to the same environment.

**Verification**
- **FR-007**: The pipeline MUST run a post-deployment health check (using the `/health` endpoints defined in 001) to verify successful rollout. **Success Criteria**: HTTP 200 OK + JSON status: "ok" (in dev or after deploy).

### Key Entities

- **GitHub Workflow**: Represents the automation definition (YAML).
- **Environment Secrets**: Represents the secure credentials stored in the repository.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Automated staging deployment completes within 10 minutes from code push.
- **SC-002**: Production deployment process requires 0 manual CLI commands (UI trigger only).
- **SC-003**: Deployment workflow passes 100% of the time when code is valid and external services are up.
- **SC-004**: Health checks verify 100% of deployed services are reachable immediately after deployment.
