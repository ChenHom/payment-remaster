# Tasks: 最小代收交易流

**Input**: Design documents from `/specs/001-minimal-payment-flow/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**Tests**: 規格中定義了 Test Strategy（單元測試、整合測試），本任務清單包含測試任務。

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and Monorepo structure setup

- [ ] T001 Create Monorepo root structure with pnpm-workspace.yaml and package.json
- [ ] T002 [P] Create workers/order-ingress skeleton with wrangler.toml and package.json
- [ ] T003 [P] Create workers/gateway-router skeleton with wrangler.toml and package.json
- [ ] T004 [P] Create workers/upstream-callback skeleton with wrangler.toml and package.json
- [ ] T005 [P] Create workers/merchant-webhook-notifier skeleton with wrangler.toml and package.json
- [ ] T006 [P] Create workers/mock-provider skeleton with wrangler.toml and package.json
- [ ] T007 [P] Create shared/ package structure with package.json and tsconfig.json
- [ ] T008 [P] Configure ESLint and Prettier for TypeScript in root
- [ ] T009 [P] Create docker-compose.yml for PostgreSQL and LocalStack (SQS)
- [ ] T010 Setup Vitest configuration in vitest.config.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T011 Create PostgreSQL migration in shared/db/migrations/001_initial_schema.sql
- [ ] T012 [P] Implement database client in shared/db/client.ts (Hyperdrive/pg connection)
- [ ] T013 [P] Define environment config types in shared/config/index.ts
- [ ] T014 [P] Implement error types and AppError class in shared/http/errors.ts
- [ ] T015 [P] Implement request validation utilities with Zod in shared/http/validation.ts
- [ ] T016 [P] Define OrderStatus enum and state machine in shared/domain/payment-order.ts
- [ ] T017 [P] Define event base types in shared/events/types.ts
- [ ] T018 Implement PaymentOrderRepository interface in shared/db/repositories/payment-order.ts
- [ ] T019 [P] Implement DeadLetterRepository interface in shared/db/repositories/dead-letter.ts
- [ ] T020 [P] Implement AWS SQS client in shared/sqs/client.ts
- [ ] T021 Implement SQS producer (sendMessage) in shared/sqs/producer.ts
- [ ] T022 [P] Create OrderCreated event factory in shared/events/order-created.ts
- [ ] T023 [P] Create OrderStatusChanged event factory in shared/events/order-status-changed.ts
- [ ] T024 [P] Implement signature utilities (SHA-256) in shared/http/signature.ts
- [ ] T025 Unit test for state machine transitions in tests/unit/domain/payment-order.test.ts

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - 商戶下單建立交易 (Priority: P1) 🎯 MVP

**Goal**: 商戶透過 API 發起代收交易請求，系統建立訂單並回傳平台訂單編號

**Independent Test**: HTTP 呼叫 `POST /api/merchant/orders` 並驗證回傳 order_id 與 status=PENDING

### Tests for User Story 1

- [ ] T026 [P] [US1] Contract test for POST /api/merchant/orders in tests/contract/order-ingress.test.ts
- [ ] T027 [P] [US1] Unit test for idempotency logic in tests/unit/domain/idempotency.test.ts

### Implementation for User Story 1

- [ ] T028 [US1] Implement idempotency check logic in shared/domain/idempotency.ts
- [ ] T029 [US1] Implement createOrReturn method in shared/db/repositories/payment-order.ts
- [ ] T030 [US1] Implement order-ingress Worker HTTP handler in workers/order-ingress/src/index.ts
- [ ] T031 [US1] Add API key validation middleware in workers/order-ingress/src/index.ts
- [ ] T032 [US1] Add request body validation for CreateOrderRequest in workers/order-ingress/src/index.ts
- [ ] T033 [US1] Integrate SQS producer to publish OrderCreated event in workers/order-ingress/src/index.ts
- [ ] T034 [US1] Add structured logging (trace_id, order_id, merchant_id) in workers/order-ingress/src/index.ts

**Checkpoint**: User Story 1 完成，可獨立測試下單 API

---

## Phase 4: User Story 2 - 交易路由至上游並取得結果 (Priority: P2)

**Goal**: 訂單建立後，系統將交易轉發至上游並更新狀態為 PROCESSING，收到回調後更新為終態

**Independent Test**: 建立訂單後驗證狀態從 PENDING → PROCESSING → SUCCESS/FAILED

### Tests for User Story 2

- [ ] T035 [P] [US2] Integration test for order routing flow in tests/integration/order-flow.test.ts
- [ ] T036 [P] [US2] Unit test for callback idempotency in tests/unit/domain/callback-idempotency.test.ts

### Implementation for User Story 2

- [ ] T037 [US2] Implement updateStatusIfMatch (CAS) in shared/db/repositories/payment-order.ts
- [ ] T038 [US2] Implement mock-provider Worker in workers/mock-provider/src/index.ts
- [ ] T039 [US2] Add delayed callback logic (3-10s) in workers/mock-provider/src/index.ts
- [ ] T040 [US2] Implement gateway-router Worker HTTP endpoint in workers/gateway-router/src/index.ts
- [ ] T041 [US2] Add OrderCreated event consumption logic in workers/gateway-router/src/index.ts
- [ ] T042 [US2] Integrate upstream call (mock-provider) in workers/gateway-router/src/index.ts
- [ ] T043 [US2] Update order status to PROCESSING after upstream call in workers/gateway-router/src/index.ts
- [ ] T044 [US2] Implement upstream-callback Worker in workers/upstream-callback/src/index.ts
- [ ] T045 [US2] Add callback token validation in workers/upstream-callback/src/index.ts
- [ ] T046 [US2] Update order status to SUCCESS/FAILED based on callback in workers/upstream-callback/src/index.ts
- [ ] T047 [US2] Publish OrderStatusChanged event in workers/upstream-callback/src/index.ts
- [ ] T048 [US2] Add callback idempotency check (terminal state handling) in workers/upstream-callback/src/index.ts

**Checkpoint**: User Stories 1 + 2 完成，可驗證完整下單到狀態確認流程

---

## Phase 5: User Story 3 - 通知商戶交易結果 (Priority: P3)

**Goal**: 交易狀態確定後，系統透過 Webhook 通知商戶最終結果

**Independent Test**: 訂單狀態變更後驗證商戶 Webhook 端點收到通知

### Tests for User Story 3

- [ ] T049 [P] [US3] Integration test for webhook notification in tests/integration/webhook-notification.test.ts
- [ ] T050 [P] [US3] Unit test for webhook signature generation in tests/unit/http/signature.test.ts

### Implementation for User Story 3

- [ ] T051 [US3] Implement merchant-webhook-notifier Worker in workers/merchant-webhook-notifier/src/index.ts
- [ ] T052 [US3] Add OrderStatusChanged event consumption in workers/merchant-webhook-notifier/src/index.ts
- [ ] T053 [US3] Implement webhook payload builder with signature in workers/merchant-webhook-notifier/src/index.ts
- [ ] T054 [US3] Add HTTP POST to merchant webhook URL with 3s timeout in workers/merchant-webhook-notifier/src/index.ts
- [ ] T055 [US3] Implement retry logic (10s/30s/60s intervals, max 3 retries) in workers/merchant-webhook-notifier/src/index.ts
- [ ] T056 [US3] Add structured logging for webhook attempts in workers/merchant-webhook-notifier/src/index.ts

**Checkpoint**: User Stories 1 + 2 + 3 完成，可驗證完整流程含商戶通知

---

## Phase 6: User Story 4 - 失敗通知進入死信佇列 (Priority: P4)

**Goal**: Webhook 通知重試失敗後，系統將通知記錄至死信佇列

**Independent Test**: 模擬 Webhook 持續失敗，驗證記錄進入 dead_letter_records

### Tests for User Story 4

- [ ] T057 [P] [US4] Integration test for dead letter flow in tests/integration/webhook-retry.test.ts
- [ ] T058 [P] [US4] Unit test for dead letter record creation in tests/unit/db/dead-letter.test.ts

### Implementation for User Story 4

- [ ] T059 [US4] Implement dead letter record creation in shared/db/repositories/dead-letter.ts
- [ ] T060 [US4] Add dead letter logic when retry exhausted in workers/merchant-webhook-notifier/src/index.ts
- [ ] T061 [US4] Implement event dead letter handling for SQS failures in shared/sqs/consumer.ts
- [ ] T062 [US4] Add findByOrderId query in shared/db/repositories/dead-letter.ts
- [ ] T063 [US4] Add listRecent query for manual review in shared/db/repositories/dead-letter.ts
- [ ] T064 [US4] Add ERROR level logging when entering dead letter in workers/merchant-webhook-notifier/src/index.ts

**Checkpoint**: 所有 User Stories (1-4) 完成，系統具備完整韌性

---

## Phase 7: Lambda Bridge (AWS SQS → Workers)

**Purpose**: 實作 Lambda 橋接讓 SQS 訊息觸發 Workers

- [ ] T065 Create lambda-bridge/ directory with package.json and tsconfig.json
- [ ] T066 [P] Implement SQS to gateway-router Lambda handler in lambda-bridge/src/gateway-router-trigger.ts
- [ ] T067 [P] Implement SQS to merchant-webhook-notifier Lambda handler in lambda-bridge/src/webhook-notifier-trigger.ts
- [ ] T068 Create SAM template.yaml for Lambda deployment in lambda-bridge/template.yaml
- [ ] T069 Add Lambda bridge deployment script in scripts/deploy-lambda.sh

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T070 [P] Add health check endpoint to all HTTP Workers
- [ ] T071 [P] Configure Wrangler environment variables for production in all wrangler.toml
- [ ] T072 [P] Add metrics counter stubs (orders_created_total, etc.) in shared/observability/metrics.ts
- [ ] T073 Create deployment script for all Workers in scripts/deploy-workers.sh
- [ ] T074 [P] Update quickstart.md with actual commands and paths
- [ ] T075 Run full E2E validation per quickstart.md workflow
- [ ] T076 [P] Add README.md with project overview and architecture diagram

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational) ← BLOCKS all user stories
    ↓
Phase 3 (US1: P1) → Phase 4 (US2: P2) → Phase 5 (US3: P3) → Phase 6 (US4: P4)
                                                                    ↓
                                                          Phase 7 (Lambda Bridge)
                                                                    ↓
                                                          Phase 8 (Polish)
```

### User Story Dependencies

| User Story | Depends On | Can Start After |
|------------|------------|-----------------|
| US1 (P1) | Foundational | Phase 2 完成 |
| US2 (P2) | US1 | Phase 3 完成（需要 order-ingress 建立訂單） |
| US3 (P3) | US2 | Phase 4 完成（需要 OrderStatusChanged 事件） |
| US4 (P4) | US3 | Phase 5 完成（需要 Webhook 重試邏輯） |

### Within Each User Story

- Tests (T0XX) 先寫並確認失敗
- Repository/Domain 邏輯優先
- Worker 實作其次
- 整合與日誌最後

### Parallel Opportunities

**Phase 1**（Setup）：
```bash
# T002-T010 全部可平行
Task: T002, T003, T004, T005, T006, T007, T008, T009
```

**Phase 2**（Foundational）：
```bash
# 可平行執行
Task: T012, T013, T014, T015, T016, T017, T019, T020, T022, T023, T024
# 需依序
Task: T011 → T018 (migration → repository)
Task: T020 → T021 (SQS client → producer)
```

**Phase 3**（US1）：
```bash
# 測試可平行
Task: T026, T027

# 實作流程
T028 (idempotency) → T029 (repository) → T030-T034 (Worker)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup ✓
2. Complete Phase 2: Foundational ✓
3. Complete Phase 3: User Story 1 ✓
4. **STOP and VALIDATE**: 測試 POST /api/merchant/orders
5. Deploy/demo if ready → **MVP 完成**

### Incremental Delivery

| 交付階段 | 內容 | 可驗證功能 |
|----------|------|------------|
| MVP | Setup + Foundation + US1 | 商戶可下單並取得 order_id |
| v0.2 | + US2 | 訂單可路由至上游並取得結果 |
| v0.3 | + US3 | 商戶收到 Webhook 通知 |
| v0.4 | + US4 | 失敗通知進入死信佇列 |
| v1.0 | + Lambda Bridge + Polish | 完整上線就緒 |

---

## Task Summary

| Phase | Tasks | Parallel Tasks |
|-------|-------|----------------|
| Phase 1: Setup | 10 | 8 |
| Phase 2: Foundational | 15 | 11 |
| Phase 3: US1 | 9 | 2 |
| Phase 4: US2 | 14 | 2 |
| Phase 5: US3 | 8 | 2 |
| Phase 6: US4 | 8 | 2 |
| Phase 7: Lambda Bridge | 5 | 2 |
| Phase 8: Polish | 7 | 5 |
| **Total** | **76** | **34** |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- PostgreSQL migrations 需先執行才能測試 Repository
- Lambda Bridge 可在 US4 後任意時間實作
