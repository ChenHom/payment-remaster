# Tasks: Deployment Workflow Automation

**Input**: Design documents from `/specs/002-deploy-workflow/`
**Prerequisites**: plan.md ✓, spec.md ✓, data-model.md ✓, contracts/ ✓, research.md ✓

**Tests**: Tests are implicit in the pipeline steps (build & test) and explicit in the post-deployment verification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and structure setup for CI/CD

- [x] T001 Create .github/workflows directory structure
- [x] T002 [P] Create initial .github/workflows/deploy-staging.yaml skeleton
- [x] T003 [P] Create initial .github/workflows/deploy-production.yaml skeleton
- [x] T004 [P] Update .gitignore to exclude any CI artifacts if needed

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core logic and shared actions that MUST be complete before specific workflows can run

- [x] T005 Update scripts/deploy-workers.sh to accept SQS_QUEUE_URL as explicit argument/env var override
- [x] T006 Update scripts/deploy-lambda.sh to output SQS_QUEUE_URL in a format easily parsable by GitHub Actions (e.g., specific output step)
- [x] T007 [P] Create a reusable composite action or verify steps for "Setup Environment" (Node, pnpm, AWS CLI, Wrangler) in .github/workflows/setup/action.yaml (optional, or inline in workflows)

**Checkpoint**: Scripts are ready for CI integration.

---

## Phase 3: User Story 1 - Automated Staging Deployment (Priority: P1)

**Goal**: Automatically deploy Lambda and Workers to Staging on push to main.

**Independent Test**: Push to main triggers workflow, passes tests, deploys infrastructure, and passes health check.

### Implementation for User Story 1

- [x] T008 [US1] Configure Staging workflow triggers (`on: push: branches: [main]`) in .github/workflows/deploy-staging.yaml
- [x] T009 [US1] Implement "Checkout & Setup" job (checkout, node, pnpm, AWS, Wrangler) in .github/workflows/deploy-staging.yaml
- [x] T010 [US1] Implement "Build & Test" job (pnpm install, lint, test) in .github/workflows/deploy-staging.yaml
- [x] T011 [US1] Implement "Deploy Lambda Bridge" step utilizing `scripts/deploy-lambda.sh` with secrets in .github/workflows/deploy-staging.yaml
- [x] T012 [US1] Implement "Capture Outputs" step to extract SQS_QUEUE_URL from Lambda deployment in .github/workflows/deploy-staging.yaml
- [x] T013 [US1] Implement "Deploy Workers" step utilizing `scripts/deploy-workers.sh` with injected secrets and SQS_QUEUE_URL in .github/workflows/deploy-staging.yaml
- [x] T014 [US1] Implement "Verify Deployment" step running curl against health endpoints in .github/workflows/deploy-staging.yaml
- [x] T015 [US1] Configure concurrency group (`staging`, cancel-in-progress: true) in .github/workflows/deploy-staging.yaml

**Checkpoint**: Staging pipeline is fully functional.

---

## Phase 4: User Story 2 - Production Deployment via Manual Trigger (Priority: P2)

**Goal**: Manually trigger deployment to Production via GitHub UI.

**Independent Test**: Manually run "Deploy Production" workflow, confirm inputs, verify deployment to Prod environment.

### Implementation for User Story 2

- [x] T016 [US2] Configure Production workflow triggers (`on: workflow_dispatch`) with inputs from contract in .github/workflows/deploy-production.yaml
- [x] T017 [US2] Implement Input Validation step (fail if confirm_deploy is false) in .github/workflows/deploy-production.yaml
- [x] T018 [US2] Implement "Checkout & Setup" job (same as staging) in .github/workflows/deploy-production.yaml
- [x] T019 [US2] Implement "Build & Test" job with `skip_tests` conditional logic in .github/workflows/deploy-production.yaml
- [x] T020 [US2] Implement "Deploy Lambda Bridge" step for Production environment in .github/workflows/deploy-production.yaml
- [x] T021 [US2] Implement "Deploy Workers" step for Production environment in .github/workflows/deploy-production.yaml
- [x] T022 [US2] Implement "Verify Deployment" step for Production in .github/workflows/deploy-production.yaml
- [x] T023 [US2] Configure concurrency group (`production`, cancel-in-progress: false) in .github/workflows/deploy-production.yaml

**Checkpoint**: Production pipeline is fully functional with manual gates.

---

## Phase 5: User Story 3 - Environment Secret Management (Priority: P3)

**Goal**: Ensure all required secrets are documented and validated.

**Independent Test**: Run a validation script or verify documentation against actual GitHub Secrets configuration.

### Implementation for User Story 3

- [x] T024 [P] [US3] Create a script `scripts/validate-ci-secrets.sh` to check for presence of required env vars (dry-run mode)
- [x] T025 [P] [US3] Add a "Pre-flight Check" step to both workflows to validate secrets presence before starting deployment
- [x] T026 [P] [US3] Update project documentation (README.md or wiki) with the secret setup guide from `quickstart.md`

**Checkpoint**: Secret management is robust and documented.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements and final validation

- [x] T027 [P] Add workflow status badges to README.md
- [x] T028 [P] Refactor common workflow steps into Composite Actions (if significant duplication found) to .github/actions/
- [x] T029 Run full E2E validation of the pipelines (trigger Staging, then trigger Prod)

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational) ← BLOCKS all workflows
    ↓
Phase 3 (US1: Staging)
    ↓
Phase 4 (US2: Production)
    ↓
Phase 5 (US3: Secrets)
    ↓
Phase 6 (Polish)
```

### User Story Dependencies

| User Story | Depends On | Can Start After |
|------------|------------|-----------------|
| US1 (Staging) | Foundational | Phase 2 |
| US2 (Production) | US1 (Logic reuse) | Phase 3 |
| US3 (Secrets) | US1/US2 (Requirements) | Phase 2 (Parallelizable) |

### Parallel Opportunities

**Phase 1** (Setup):
- T002, T003, T004 can be done in parallel.

**Phase 5** (Secrets):
- T024, T025, T026 can be done in parallel with main workflow development.

---

## Implementation Strategy

### MVP First (Staging Pipeline)

1. Complete Phase 1 & 2.
2. Implement Phase 3 (Staging).
3. Validate Staging deployment with a real commit.
4. **Checkpoint**: Staging automation works.

### Incremental Delivery

| Delivery | Content | Verifiable Outcome |
|----------|---------|--------------------|
| MVP | Staging Pipeline | Push to main -> Deploys to Staging |
| v1.0 | Production Pipeline | Manual Trigger -> Deploys to Prod |
| v1.1 | Robustness | Secret validation, Badges, Docs |

---

## Task Summary

| Phase | Tasks | Parallel Tasks |
|-------|-------|----------------|
| Phase 1: Setup | 4 | 3 |
| Phase 2: Foundational | 3 | 1 |
| Phase 3: US1 | 8 | 0 |
| Phase 4: US2 | 8 | 0 |
| Phase 5: US3 | 3 | 3 |
| Phase 6: Polish | 3 | 2 |
| **Total** | **29** | **9** |
