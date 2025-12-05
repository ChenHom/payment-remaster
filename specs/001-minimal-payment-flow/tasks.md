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

- [x] T001 Create Monorepo root structure with pnpm-workspace.yaml and package.json
- [x] T002 [P] Create workers/order-ingress skeleton with wrangler.toml and package.json
- [x] T003 [P] Create workers/gateway-router skeleton with wrangler.toml and package.json
- [x] T004 [P] Create workers/upstream-callback skeleton with wrangler.toml and package.json
- [x] T005 [P] Create workers/merchant-webhook-notifier skeleton with wrangler.toml and package.json
- [x] T006 [P] Create workers/mock-provider skeleton with wrangler.toml and package.json
- [x] T007 [P] Create shared/ package structure with package.json and tsconfig.json
- [x] T008 [P] Configure ESLint and Prettier for TypeScript in root
- [x] T009 [P] Create docker-compose.yml for PostgreSQL and LocalStack (SQS)
- [x] T010 Setup Vitest configuration in vitest.config.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T011 Create PostgreSQL migration in shared/db/migrations/001_initial_schema.sql
- [x] T012 [P] Implement database client in shared/db/client.ts (Hyperdrive/pg connection)
- [x] T013 [P] Define environment config types in shared/config/index.ts
- [x] T014 [P] Implement error types and AppError class in shared/http/errors.ts
- [x] T015 [P] Implement request validation utilities with Zod in shared/http/validation.ts
- [x] T016 [P] Define OrderStatus enum and state machine in shared/domain/payment-order.ts
- [x] T017 [P] Define event base types in shared/events/types.ts
- [x] T018 Implement PaymentOrderRepository interface in shared/db/repositories/payment-order.ts
- [x] T019 [P] Implement DeadLetterRepository interface in shared/db/repositories/dead-letter.ts
- [x] T020 [P] Implement AWS SQS client in shared/sqs/client.ts
- [x] T021 Implement SQS producer (sendMessage) in shared/sqs/producer.ts
- [x] T022 [P] Create OrderCreated event factory in shared/events/order-created.ts
- [x] T023 [P] Create OrderStatusChanged event factory in shared/events/order-status-changed.ts
- [x] T024 [P] Implement signature utilities (SHA-256) in shared/http/signature.ts
- [x] T025 Unit test for state machine transitions in tests/unit/domain/payment-order.test.ts

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - 商戶下單建立交易 (Priority: P1) 🎯 MVP

**Goal**: 商戶透過 API 發起代收交易請求，系統建立訂單並回傳平台訂單編號

**Independent Test**: HTTP 呼叫 `POST /api/merchant/orders` 並驗證回傳 order_id 與 status=PENDING

### Tests for User Story 1

- [x] T026 [P] [US1] Contract test for POST /api/merchant/orders in tests/contract/order-ingress.test.ts
- [x] T027 [P] [US1] Unit test for idempotency logic in tests/unit/domain/idempotency.test.ts

### Implementation for User Story 1

- [x] T028 [US1] Implement idempotency check logic in shared/domain/idempotency.ts
- [x] T029 [US1] Implement createOrReturn method in shared/db/repositories/payment-order.ts
- [x] T030 [US1] Implement order-ingress Worker HTTP handler in workers/order-ingress/src/index.ts
- [x] T031 [US1] Add API key validation middleware in workers/order-ingress/src/index.ts
- [x] T032 [US1] Add request body validation for CreateOrderRequest in workers/order-ingress/src/index.ts
- [x] T033 [US1] Integrate SQS producer to publish OrderCreated event in workers/order-ingress/src/index.ts
- [x] T034 [US1] Add structured logging (trace_id, order_id, merchant_id) in workers/order-ingress/src/index.ts

**Checkpoint**: User Story 1 完成，可獨立測試下單 API

---

## Phase 4: User Story 2 - 交易路由至上游並取得結果 (Priority: P2)

**Goal**: 訂單建立後，系統將交易轉發至上游並更新狀態為 PROCESSING，收到回調後更新為終態

**Independent Test**: 建立訂單後驗證狀態從 PENDING → PROCESSING → SUCCESS/FAILED

### Tests for User Story 2

- [x] T035 [P] [US2] Integration test for order routing flow in tests/integration/order-flow.test.ts
- [x] T036 [P] [US2] Unit test for callback idempotency in tests/unit/domain/callback-idempotency.test.ts

### Implementation for User Story 2

- [x] T037 [US2] Implement updateStatusIfMatch (CAS) in shared/db/repositories/payment-order.ts
- [x] T038 [US2] Implement mock-provider Worker in workers/mock-provider/src/index.ts
- [x] T039 [US2] Add delayed callback logic (3-10s) in workers/mock-provider/src/index.ts
- [x] T040 [US2] Implement gateway-router Worker HTTP endpoint in workers/gateway-router/src/index.ts
- [x] T041 [US2] Add OrderCreated event consumption logic in workers/gateway-router/src/index.ts
- [x] T042 [US2] Integrate upstream call (mock-provider) in workers/gateway-router/src/index.ts
- [x] T043 [US2] Update order status to PROCESSING after upstream call in workers/gateway-router/src/index.ts
- [x] T044 [US2] Implement upstream-callback Worker in workers/upstream-callback/src/index.ts
- [x] T045 [US2] Add callback token validation in workers/upstream-callback/src/index.ts
- [x] T046 [US2] Update order status to SUCCESS/FAILED based on callback in workers/upstream-callback/src/index.ts
- [x] T047 [US2] Publish OrderStatusChanged event in workers/upstream-callback/src/index.ts
- [x] T048 [US2] Add callback idempotency check (terminal state handling) in workers/upstream-callback/src/index.ts

**Checkpoint**: User Stories 1 + 2 完成，可驗證完整下單到狀態確認流程

---

## Phase 5: User Story 3 - 通知商戶交易結果 (Priority: P3)

**Goal**: 交易狀態確定後，系統透過 Webhook 通知商戶最終結果

**Independent Test**: 訂單狀態變更後驗證商戶 Webhook 端點收到通知

### Tests for User Story 3

- [x] T049 [P] [US3] Integration test for webhook notification in tests/integration/webhook-notification.test.ts
- [x] T050 [P] [US3] Unit test for webhook signature generation in tests/unit/http/signature.test.ts

### Implementation for User Story 3

- [x] T051 [US3] Implement merchant-webhook-notifier Worker in workers/merchant-webhook-notifier/src/index.ts
- [x] T052 [US3] Add OrderStatusChanged event consumption in workers/merchant-webhook-notifier/src/index.ts
- [x] T053 [US3] Implement webhook payload builder with signature in workers/merchant-webhook-notifier/src/index.ts
- [x] T054 [US3] Add HTTP POST to merchant webhook URL with 3s timeout in workers/merchant-webhook-notifier/src/index.ts
- [x] T055 [US3] Implement retry logic (10s/30s/60s intervals, max 3 retries) in workers/merchant-webhook-notifier/src/index.ts
- [x] T056 [US3] Add structured logging for webhook attempts in workers/merchant-webhook-notifier/src/index.ts

**Checkpoint**: User Stories 1 + 2 + 3 完成，可驗證完整流程含商戶通知

---

## Phase 6: User Story 4 - 失敗通知進入死信佇列 (Priority: P4)

**Goal**: Webhook 通知重試失敗後，系統將通知記錄至死信佇列

**Independent Test**: 模擬 Webhook 持續失敗，驗證記錄進入 dead_letter_records

### Tests for User Story 4

- [x] T057 [P] [US4] Unit test for webhook retry logic and dead letter record creation in tests/unit/domain/webhook-retry.test.ts
  - Test 1: 驗證 3 次重試間隔為 10s/30s/60s
  - Test 2: 驗證重試 3 次失敗後建立死信記錄
  - Test 3: 驗證重複通知的冪等行為（更新而非新建）
- [x] T058 [P] [US4] Integration test for complete webhook failure flow in tests/integration/webhook-failure.test.ts
  - Test 1: 建立訂單 → 狀態變更 → Webhook 回傳 5xx
  - Test 2: 驗證 3 次重試後進入 dead_letter_records
  - Test 3: 驗證可查詢死信記錄並查看重試次數與錯誤訊息

### Implementation for User Story 4

- [x] T059 [US4] Implement dead letter record creation logic in shared/db/repositories/dead-letter.ts
- [x] T060 [US4] Add upsert method for idempotent dead letter updates in shared/db/repositories/dead-letter.ts
- [x] T061 [US4] Implement event dead letter handling for SQS failures in shared/sqs/consumer.ts
- [x] T062 [US4] Add findByOrderId query in shared/db/repositories/dead-letter.ts
- [x] T063 [US4] Add listRecent query for manual review in shared/db/repositories/dead-letter.ts
- [x] T064 [US4] Add dead letter logic when webhook retry exhausted in workers/merchant-webhook-notifier/src/index.ts
- [x] T065 [US4] Add ERROR level logging when entering dead letter in workers/merchant-webhook-notifier/src/index.ts

**Checkpoint**: 所有 User Stories (1-4) 完成，系統具備完整韌性

---

## Phase 7: Lambda Bridge (AWS SQS → Workers)

**Purpose**: 實作 Lambda 橋接讓 SQS 訊息觸發 Workers

- [x] T066 Create lambda-bridge/ directory with package.json and tsconfig.json
- [x] T067 [P] Implement gateway-router-trigger Lambda handler in lambda-bridge/src/gateway-router-trigger.ts
  - 消費 SQS OrderCreated 事件批次（BatchSize=10）
  - HTTP POST 至 Workers /sqs/order-created 端點
  - 實作重試邏輯：5xx/timeout → Lambda 失敗（SQS 重新投遞），4xx → 成功（不重試）
  - CloudWatch 日誌記錄 trace_id、訊息 ID、處理狀態
- [x] T068 [P] Implement webhook-notifier-trigger Lambda handler in lambda-bridge/src/webhook-notifier-trigger.ts
  - 消費 SQS OrderStatusChanged 事件批次（BatchSize=10）
  - HTTP POST 至 Workers /sqs/order-status-changed 端點
  - 同 T067 重試邏輯
- [x] T069 Create SAM template (lambda-bridge/template.yaml) with complete specifications
  - 定義 OrderEventsQueue（VisibilityTimeout=300, Retention=14 days, MaxReceiveCount=5, DLQ）
  - 定義 OrderEventsDLQ
  - 定義 GatewayRouterFunction 與 EventSourceMapping（BatchSize=10, MaximumConcurrency=10）
  - 定義 WebhookNotifierFunction 與 EventSourceMapping（同上）
  - 環境變數配置：GATEWAY_ROUTER_URL、WEBHOOK_NOTIFIER_URL、LOG_LEVEL、INVOCATION_TIMEOUT、HTTP_TIMEOUT
  - 輸出項：SQSQueueUrl、SQSQueueArn、DLQUrl、函式 ARN
- [x] T070 Create Lambda deployment script (scripts/deploy-lambda.sh)
  - Phase 1: 驗證工具（pnpm、wrangler、aws-cli、sam、docker）與環境變數
  - Phase 3: 執行 sam validate、sam build、sam deploy
  - 擷取部署輸出（Queue URL）並打印驗證結果

**Checkpoint**: Lambda Bridge 實作完成，SQS 可觸發 Workers 處理事件

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

### Health Check & Deployment

- [x] T071 [P] Add health check endpoint (GET /health) to all HTTP Workers
  - Implemented in: workers/order-ingress, workers/upstream-callback, workers/mock-provider
  - Check items: Worker status, PostgreSQL connection, SQS connectivity
  - Response: {"status":"ok/error", "service":"...", "timestamp":"..."} with 200/503 codes
  - Response time requirement: < 2 seconds
- [x] T072 Create Workers deployment script (scripts/deploy-workers.sh)
  - Phase 2: 構建 (pnpm install, type-check, test, build)
  - Phase 4: 部署 Workers (wrangler deploy per worker with env file)
  - Phase 5: 驗證部署 (Health checks, DB test, SQS test, Lambda EventSourceMapping, E2E)
  - 包含故障排查與回滾程序
- [x] T073 [P] Add comprehensive deployment documentation (included in spec.md)
  - 已於 spec.md Deployment Documentation Specification 章節完整定義
  - 包含 5 階段部署流程、bash 腳本範本、驗證檢查清單、故障排查、回滾程序

### Configuration & Documentation

- [x] T074 [P] Configure environment variables in all wrangler.toml files
  - 所有 Workers 設定: DATABASE_URL, SQS_QUEUE_URL, AWS credentials, WEBHOOK_SECRET, 等
  - Staging vs Production 環境分離
- [x] T075 [P] Add observability stubs in shared/observability/metrics.ts
  - Counter stubs: orders_created_total, orders_completed_total, webhook_attempts_total, webhook_failures_total, dead_letters_total
  - 標記為 "TODO" 供後續完整實作
- [x] T076 [P] Create README.md with complete project documentation
  - 章節: 專案概述、技術棧、專案結構、快速啟動（6 步）、部署、API 文檔、監控、架構圖
  - 包含 curl 範例、docker-compose 啟動、測試命令、troubleshooting
  - 參考 spec.md 的 README Architecture Specification 章節

### Testing & Validation

- [x] T077 [P] Update quickstart.md with actual commands and verified paths
  - 驗證所有命令在本機可執行
  - 檢查所有路徑是否正確
- [x] T078 Run full E2E validation per quickstart.md workflow
  - 完整執行快速啟動步驟
  - 驗證所有 4 個 User Stories 可完全運作
  - 紀錄所有 log 輸出供驗證

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
| Phase 6: US4 | 11 | 2 |
| Phase 7: Lambda Bridge | 5 | 2 |
| Phase 8: Polish | 8 | 5 |
| **Total** | **80** | **34** |

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
