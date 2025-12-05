# Implementation Plan: 最小代收交易流

**Branch**: `001-minimal-payment-flow` | **Date**: 2025-12-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-minimal-payment-flow/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

建立最小可運作的代收交易流，包含 5 個 Cloudflare Workers（order-ingress、gateway-router、upstream-callback、merchant-webhook-notifier、mock-provider），採用事件驅動架構串接完整流程：商戶下單 → 路由至上游 → 接收回調 → 通知商戶。使用 PostgreSQL 儲存訂單與死信記錄，AWS SQS 作為訊息佇列傳遞 OrderCreated 與 OrderStatusChanged 事件。

## Technical Context

**Language/Version**: TypeScript 5.x（Cloudflare Workers 運行時）
**Primary Dependencies**: Hono（HTTP 路由）、AWS SDK for SQS、node-postgres（via Hyperdrive 或連線池）
**Storage**: PostgreSQL（透過 Cloudflare Hyperdrive 或外部連線池存取）
**Message Queue**: AWS SQS Free Tier（標準佇列）
**Testing**: Vitest（單元/整合測試）、Miniflare（本機模擬）
**Target Platform**: Cloudflare Workers（Edge Runtime）
**Project Type**: Monorepo（多 Workers + 共用模組）
**Performance Goals**: 100 筆並行訂單 30 秒內完成（SC-004）
**Constraints**: 單次 Worker 執行 <10 秒、Webhook 通知 <3 秒 timeout、對上游呼叫 <5 秒 timeout
**Scale/Scope**: 單一商戶、單一模擬上游、4 種訂單狀態

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 狀態 | 驗證說明 |
|------|------|----------|
| I. 模組邊界清晰 | ✅ 通過 | 5 個 Workers 各自對應單一職責：訂單接收、路由、回調處理、通知、模擬上游，透過 SQS 事件溝通 |
| II. Serverless 優先 | ✅ 通過 | 全部採用 Cloudflare Workers 無狀態設計，狀態儲存於 PostgreSQL |
| III. 事件驅動架構 | ✅ 通過 | OrderCreated 與 OrderStatusChanged 事件透過 AWS SQS 傳遞，支援冪等處理與死信佇列 |
| IV. 合約先行 | ✅ 通過 | 本 plan 產出 OpenAPI 契約（contracts/），API 與事件格式已於 spec 定義 |
| V. 可觀測性 | ✅ 通過 | 定義 trace_id 追蹤、結構化日誌、指標（orders_created_total 等） |
| VI. 測試驅動 | ✅ 通過 | 定義單元測試（狀態機、冪等）、整合測試（E2E 流程）、負載測試策略 |

**Gate 結論**：所有原則通過，無需 Complexity Tracking 豁免說明。

## Project Structure

### Documentation (this feature)

```text
specs/001-minimal-payment-flow/
├── plan.md              # 本檔案（/speckit.plan 產出）
├── research.md          # Phase 0 產出：技術研究
├── data-model.md        # Phase 1 產出：資料模型
├── quickstart.md        # Phase 1 產出：快速開始指南
├── contracts/           # Phase 1 產出：OpenAPI 契約
│   └── openapi.yaml
└── tasks.md             # Phase 2 產出（/speckit.tasks 指令，本次不產出）
```

### Source Code (repository root)

```text
workers/
├── order-ingress/           # HTTP Worker：接收商戶下單
│   ├── src/
│   │   └── index.ts
│   ├── wrangler.toml
│   └── package.json
├── gateway-router/          # SQS Consumer：消費 OrderCreated，呼叫上游
│   ├── src/
│   │   └── index.ts
│   ├── wrangler.toml
│   └── package.json
├── upstream-callback/       # HTTP Worker：接收上游回調
│   ├── src/
│   │   └── index.ts
│   ├── wrangler.toml
│   └── package.json
├── merchant-webhook-notifier/  # SQS Consumer：消費 OrderStatusChanged，通知商戶
│   ├── src/
│   │   └── index.ts
│   ├── wrangler.toml
│   └── package.json
└── mock-provider/           # HTTP Worker：模擬上游服務
    ├── src/
    │   └── index.ts
    ├── wrangler.toml
    └── package.json

shared/
├── db/                      # PostgreSQL 連線與查詢
│   ├── client.ts
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── repositories/
│       ├── payment-order.ts
│       └── dead-letter.ts
├── sqs/                     # AWS SQS 發送與接收封裝
│   ├── client.ts
│   ├── producer.ts
│   └── consumer.ts
├── events/                  # 事件定義與序列化
│   ├── types.ts
│   ├── order-created.ts
│   └── order-status-changed.ts
├── domain/                  # 領域邏輯
│   ├── payment-order.ts     # 狀態機、驗證
│   └── idempotency.ts       # 冪等處理
├── http/                    # HTTP 共用工具
│   ├── errors.ts
│   ├── validation.ts
│   └── signature.ts
└── config/                  # 環境設定
    └── index.ts

tests/
├── unit/
│   ├── domain/
│   │   └── payment-order.test.ts
│   └── events/
│       └── serialization.test.ts
├── integration/
│   ├── order-flow.test.ts
│   └── webhook-retry.test.ts
└── contract/
    └── api-contract.test.ts
```

**Structure Decision**: 採用 Monorepo 結構，5 個 Workers 各自獨立部署，共用模組（db、sqs、events、domain）置於 `shared/` 目錄。此結構符合 Constitution 的模組邊界清晰原則，且便於程式碼共用與測試。

## Complexity Tracking

> **無需填寫**：Constitution Check 所有原則皆通過，無違規需豁免。

## Technology Adaptation Notes

### PostgreSQL（取代 D1）

**變更原因**：使用者指定使用 PostgreSQL 作為資料庫。

**整合方案**：
- 使用 Cloudflare Hyperdrive 連接外部 PostgreSQL（推薦）
- 或透過 Neon / Supabase 等支援 HTTP 協定的 PostgreSQL 服務
- 連線池由 Hyperdrive 管理，Workers 端使用 `node-postgres` 或 Hyperdrive SDK

**Schema 調整**：
- D1 的 `TEXT` 類型改為 PostgreSQL 的 `VARCHAR` 或 `TEXT`
- D1 的 `NUMERIC` 改為 PostgreSQL 的 `DECIMAL(18,4)`
- 時間欄位改為 PostgreSQL 的 `TIMESTAMPTZ`

### AWS SQS（取代 Cloudflare Queues）

**變更原因**：使用者指定使用 AWS SQS Free Tier。

**整合方案**：
- 使用 AWS SDK for JavaScript v3（`@aws-sdk/client-sqs`）
- Workers 透過 HTTP 呼叫 SQS API（SendMessage / ReceiveMessage）
- 由於 Cloudflare Workers 無法直接作為 SQS Consumer，需採用輪詢或 Lambda 橋接

**替代方案評估**：
1. **輪詢模式**：使用 Cron Trigger 定期輪詢 SQS
2. **Lambda 橋接**：SQS → Lambda → Workers HTTP endpoint
3. **SNS + HTTP**：SQS → SNS → Workers HTTP subscription

**建議採用**：方案 2（Lambda 橋接），因 SQS 原生支援 Lambda 觸發，再由 Lambda 呼叫 Workers HTTP endpoint，延遲最低。
