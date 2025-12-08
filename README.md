# Payment Remaster

[![Deploy Staging](https://github.com/ChenHom/payment-remaster/actions/workflows/deploy-staging.yaml/badge.svg)](https://github.com/ChenHom/payment-remaster/actions/workflows/deploy-staging.yaml)
[![Deploy Production](https://github.com/ChenHom/payment-remaster/actions/workflows/deploy-production.yaml/badge.svg)](https://github.com/ChenHom/payment-remaster/actions/workflows/deploy-production.yaml)

最小代收交易流實作 - 使用 Cloudflare Workers、PostgreSQL 和 AWS SQS 建構的事件驅動支付系統。

## 專案概述

本專案實作一個最小可運作的代收交易流程，包含：
- 商戶透過 API 發起代收交易請求
- 系統將交易轉發至上游處理
- 接收上游回調並更新訂單狀態
- 透過 Webhook 通知商戶交易結果
- 失敗通知進入死信佇列供人工處理

### 架構圖

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Payment Remaster                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐    ┌───────────────┐    ┌─────────────────┐                   │
│  │ Merchant │───▶│ order-ingress │───▶│   PostgreSQL    │                   │
│  └──────────┘    └───────┬───────┘    └─────────────────┘                   │
│                          │                     ▲                             │
│                          ▼                     │                             │
│                  ┌───────────────┐             │                             │
│                  │    AWS SQS    │             │                             │
│                  │ OrderCreated  │             │                             │
│                  └───────┬───────┘             │                             │
│                          │                     │                             │
│                          ▼                     │                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      Lambda Bridge                                    │   │
│  │  ┌─────────────────────┐    ┌─────────────────────────┐              │   │
│  │  │ gateway-router-     │    │ webhook-notifier-       │              │   │
│  │  │ trigger             │    │ trigger                 │              │   │
│  │  └──────────┬──────────┘    └──────────┬──────────────┘              │   │
│  └─────────────│───────────────────────────│────────────────────────────┘   │
│                │                           │                                 │
│                ▼                           ▼                                 │
│       ┌───────────────┐           ┌─────────────────────┐                   │
│       │gateway-router │           │merchant-webhook-    │                   │
│       │   Worker      │           │Notifier Worker      │──▶ Merchant       │
│       └───────┬───────┘           └─────────────────────┘    Webhook        │
│               │                                                              │
│               ▼                                                              │
│       ┌───────────────┐    ┌───────────────────┐                            │
│       │mock-provider  │───▶│upstream-callback  │                            │
│       │   Worker      │    │   Worker          │                            │
│       └───────────────┘    └───────────────────┘                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 技術棧

| 層級 | 技術 |
|------|------|
| Runtime | Cloudflare Workers (Edge) |
| Language | TypeScript 5.x |
| HTTP Framework | Hono |
| Database | PostgreSQL (via Hyperdrive) |
| Message Queue | AWS SQS (Free Tier) |
| Lambda Bridge | AWS SAM / Lambda |
| Testing | Vitest |
| Package Manager | pnpm (Monorepo) |

## 專案結構

```
payment-remaster/
├── workers/                    # Cloudflare Workers
│   ├── order-ingress/         # HTTP: 接收商戶下單
│   ├── gateway-router/        # SQS Consumer: 呼叫上游
│   ├── upstream-callback/     # HTTP: 接收上游回調
│   ├── merchant-webhook-notifier/  # SQS Consumer: 通知商戶
│   └── mock-provider/         # HTTP: 模擬上游服務
├── shared/                     # 共用模組
│   └── src/
│       ├── db/                # 資料庫連線與 Repository
│       ├── sqs/               # SQS 客戶端與消費者
│       ├── events/            # 事件定義
│       ├── domain/            # 領域邏輯
│       ├── http/              # HTTP 工具
│       └── observability/     # 監控指標
├── lambda-bridge/              # AWS Lambda 橋接
│   ├── src/
│   │   ├── gateway-router-trigger.ts
│   │   └── webhook-notifier-trigger.ts
│   └── template.yaml          # SAM 模板
├── tests/                      # 測試
│   ├── unit/
│   ├── integration/
│   └── contract/
├── specs/                      # 規格文件
│   └── 001-minimal-payment-flow/
├── scripts/                    # 部署腳本
│   ├── deploy-workers.sh
│   ├── deploy-lambda.sh
│   └── e2e.sh
└── docker-compose.yml          # 本機開發環境
```

## 快速啟動

### 前置需求

- Node.js 18+
- pnpm 8+
- Docker & Docker Compose
- AWS CLI (用於 Lambda 部署)
- Wrangler CLI (用於 Workers 部署)

### 步驟 1: 啟動本機服務

```bash
# 啟動 PostgreSQL 和 LocalStack (SQS)
docker-compose up -d

# 確認服務狀態
docker-compose ps
```

### 步驟 2: 安裝依賴

```bash
pnpm install
```

### 步驟 3: 執行資料庫遷移

```bash
# 連線到 PostgreSQL 執行遷移
docker exec -i payment-postgres psql -U postgres -d payment < shared/src/db/migrations/001_initial_schema.sql
```

### 步驟 4: 啟動 Workers (開發模式)

```bash
# 開啟多個終端機，分別啟動各 Worker
pnpm --filter order-ingress dev
pnpm --filter gateway-router dev
pnpm --filter upstream-callback dev
pnpm --filter merchant-webhook-notifier dev
pnpm --filter mock-provider dev
```

### 步驟 5: 執行測試

```bash
# 執行所有測試
pnpm vitest run

# 執行特定測試
pnpm vitest run tests/unit
pnpm vitest run tests/integration
pnpm vitest run tests/contract
```

### 步驟 6: 建立測試訂單

```bash
# 建立一筆訂單
curl -X POST http://localhost:8787/api/merchant/orders \
  -H "Content-Type: application/json" \
  -H "X-API-Key: TEST_MERCHANT_KEY" \
  -d '{
    "merchant_order_no": "MO-001",
    "amount": 100.00,
    "currency": "TWD",
    "description": "Test order"
  }'
```

## API 文檔

### POST /api/merchant/orders

建立代收交易訂單。

**Request Headers:**
- `X-API-Key`: 商戶 API 金鑰 (必填)
- `Content-Type`: application/json

**Request Body:**
```json
{
  "merchant_order_no": "MO-001",
  "amount": 100.00,
  "currency": "TWD",
  "description": "訂單說明"
}
```

**Response (201 Created):**
```json
{
  "order_id": "uuid-v4",
  "status": "PENDING",
  "created_at": "2025-12-05T10:00:00.000Z"
}
```

### GET /health

健康檢查端點。

**Response (200 OK):**
```json
{
  "status": "ok",
  "service": "order-ingress",
  "timestamp": "2025-12-05T10:00:00.000Z",
  "checks": {
    "worker": { "status": "ok" },
    "database": { "status": "ok", "latency_ms": 5 },
    "sqs": { "status": "ok" }
  }
}
```

## 部署

### 部署 Cloudflare Workers

```bash
# 設定 Cloudflare 憑證
wrangler login

# 部署到 staging
./scripts/deploy-workers.sh staging

# 部署到 production
./scripts/deploy-workers.sh production
```

### 部署 Lambda Bridge

```bash
# 設定環境變數
export GATEWAY_ROUTER_URL="https://gateway-router.your-workers.dev"
export WEBHOOK_NOTIFIER_URL="https://webhook-notifier.your-workers.dev"

# 部署到 staging
./scripts/deploy-lambda.sh staging

# 部署到 production
./scripts/deploy-lambda.sh production
```

## 監控

### 指標 (Metrics)

| 指標名稱 | 類型 | 說明 |
|----------|------|------|
| `orders_created_total` | Counter | 建立的訂單總數 |
| `orders_completed_total` | Counter | 完成的訂單總數 |
| `webhook_attempts_total` | Counter | Webhook 通知嘗試次數 |
| `webhook_failures_total` | Counter | Webhook 通知失敗次數 |
| `dead_letters_total` | Counter | 死信記錄總數 |

### 日誌欄位

每個請求都會記錄以下欄位：
- `trace_id`: 追蹤 ID
- `order_id`: 訂單 ID
- `merchant_id`: 商戶 ID
- Handler 名稱

## Troubleshooting

### 常見問題

**Q: 訂單狀態一直是 PENDING？**
A: 確認 SQS 佇列和 Lambda Bridge 正常運作。檢查 CloudWatch 日誌。

**Q: Webhook 通知失敗？**
A: 查看 `dead_letter_records` 表格確認失敗原因。檢查商戶端點是否可達。

**Q: 本機開發 Workers 無法連線資料庫？**
A: 確認 Docker Compose 服務正常運作，PostgreSQL 端口 5432 可連線。

### 查看死信記錄

```sql
SELECT * FROM dead_letter_records
WHERE order_id = 'your-order-id'
ORDER BY last_failed_at DESC;
```

## 開發指南

### 新增 Worker

1. 建立 `workers/your-worker/` 目錄
2. 複製現有 Worker 的 `package.json` 和 `wrangler.toml`
3. 實作 `src/index.ts`
4. 更新 `pnpm-workspace.yaml`

### 執行測試

```bash
# 單元測試
pnpm vitest run tests/unit

# 整合測試
pnpm vitest run tests/integration

# 契約測試
pnpm vitest run tests/contract

# 監看模式
pnpm vitest
```

## CI/CD 流程

本專案使用 GitHub Actions 進行自動化部署。

### 環境與機密 (Environments & Secrets)

您必須在 GitHub 設定兩個環境：`staging` (暫存環境) 和 `production` (生產環境)。

**必要儲存庫機密 (Repository Secrets)**：
- `AWS_ACCESS_KEY_ID`: AWS 存取金鑰 ID
- `AWS_SECRET_ACCESS_KEY`: AWS 私密存取金鑰
- `CLOUDFLARE_API_TOKEN`: Cloudflare API Token (需有 Workers 權限)
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare 帳戶 ID
- `AWS_REGION`: AWS 區域 (選填，預設: ap-northeast-1)

**必要儲存庫變數 (Repository Variables)**：
- `CLOUDFLARE_SUBDOMAIN`: 您的 Cloudflare Workers 子網域 (例如 `hom`)

**必要環境機密 (Environment Secrets)** (Staging 和 Production 需分別設定)：
- `DATABASE_URL`: PostgreSQL 連線字串
- `WEBHOOK_SECRET`: Webhook 簽名密鑰
- `MOCK_CALLBACK_TOKEN`: Mock Provider 驗證 Token
- `TEST_MERCHANT_KEY`: 測試用商戶 API 金鑰

### 工作流程 (Workflows)

- **Deploy Staging**: 推送至 `main` 分支時自動觸發。
- **Deploy Production**: 透過 GitHub Actions 頁面手動觸發。需要勾選確認部署。

## License

Private - All rights reserved.