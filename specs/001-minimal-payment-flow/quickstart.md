# Quickstart: 最小代收交易流

**Feature**: `001-minimal-payment-flow` | **Date**: 2025-12-05

本文件提供快速開始指南，包含環境設定、本機開發與部署步驟。

---

## 前置需求

### 必要工具

| 工具 | 版本 | 說明 |
|------|------|------|
| Node.js | >= 20.x | JavaScript 運行時 |
| pnpm | >= 8.x | 套件管理器 |
| Wrangler | >= 3.x | Cloudflare Workers CLI |
| Docker | >= 24.x | 本機容器環境 |
| AWS CLI | >= 2.x | AWS 命令列工具 |

### 帳號需求

- Cloudflare 帳號（Workers 部署）
- AWS 帳號（SQS Free Tier）
- PostgreSQL 資料庫（Neon / Supabase / 自建）

---

## 專案初始化

### 1. 複製專案

```bash
git clone <repository-url>
cd payment-remaster
git checkout 001-minimal-payment-flow
```

### 2. 安裝依賴

```bash
pnpm install
```

### 3. 建立環境設定

```bash
# 複製環境變數範本
cp .dev.vars.example .dev.vars
```

編輯 `.dev.vars`：

```env
# PostgreSQL（Hyperdrive 或直連）
DATABASE_URL=postgresql://user:password@host:5432/payment

# AWS SQS
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=ap-northeast-1
SQS_ORDER_EVENTS_URL=https://sqs.ap-northeast-1.amazonaws.com/123456789/order-events

# 應用程式設定
WEBHOOK_SECRET=your-webhook-secret
TEST_MERCHANT_KEY=TEST_MERCHANT_KEY
MOCK_CALLBACK_TOKEN=MOCK_CALLBACK_TOKEN
MOCK_PROVIDER_URL=http://localhost:8790
```

---

## 本機開發

### 1. 啟動 Docker 服務

```bash
# 啟動 PostgreSQL + LocalStack（模擬 SQS）
docker-compose up -d
```

`docker-compose.yml` 參考：

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: payment
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    volumes:
      - postgres_data:/var/lib/postgresql/data

  localstack:
    image: localstack/localstack
    ports:
      - "4566:4566"
    environment:
      SERVICES: sqs
      DEBUG: 1
    volumes:
      - localstack_data:/var/lib/localstack

volumes:
  postgres_data:
  localstack_data:
```

### 2. 執行資料庫 Migration

```bash
# 使用 psql 或你偏好的工具
psql postgresql://dev:dev@localhost:5432/payment < shared/db/migrations/001_initial_schema.sql
```

### 3. 建立本機 SQS 佇列

```bash
# 使用 LocalStack
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name order-events
```

### 4. 啟動 Workers

開啟多個終端機，分別啟動各 Worker：

```bash
# Terminal 1: order-ingress
cd workers/order-ingress && pnpm dev

# Terminal 2: upstream-callback
cd workers/upstream-callback && pnpm dev

# Terminal 3: mock-provider
cd workers/mock-provider && pnpm dev

# Terminal 4: gateway-router（需搭配 Lambda 橋接或輪詢模式）
cd workers/gateway-router && pnpm dev

# Terminal 5: merchant-webhook-notifier
cd workers/merchant-webhook-notifier && pnpm dev
```

---

## 測試流程

### 1. 建立一筆訂單

```bash
curl -X POST http://localhost:8787/api/merchant/orders \
  -H 'X-API-Key: TEST_MERCHANT_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "merchant_order_no": "M-001",
    "amount": 100,
    "currency": "TWD"
  }'
```

預期回應：

```json
{
  "order_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PENDING",
  "created_at": "2025-12-05T10:00:00Z"
}
```

### 2. 驗證訂單狀態

```bash
# 查詢 PostgreSQL
psql postgresql://dev:dev@localhost:5432/payment \
  -c "SELECT id, status, created_at FROM payment_orders ORDER BY created_at DESC LIMIT 5;"
```

### 3. 手動觸發上游回調（測試用）

```bash
curl -X POST http://localhost:8789/api/payment/callback/mock-provider \
  -H 'X-Callback-Token: MOCK_CALLBACK_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "order_id": "<上一步取得的 order_id>",
    "result": "SUCCESS",
    "upstream_txn_id": "MOCK-TXN-001"
  }'
```

### 4. 驗證最終狀態

```bash
psql postgresql://dev:dev@localhost:5432/payment \
  -c "SELECT id, status, upstream_txn_id FROM payment_orders WHERE id = '<order_id>';"
```

---

## 執行測試

### 單元測試

```bash
pnpm test:unit
```

### 整合測試

```bash
# 確保 Docker 服務運行中
pnpm test:integration
```

### 合約測試

```bash
pnpm test:contract
```

### 全部測試

```bash
pnpm test
```

---

## 部署流程

### 1. 設定 Cloudflare

```bash
# 登入 Cloudflare
wrangler login

# 建立 Hyperdrive 設定（連接 PostgreSQL）
wrangler hyperdrive create payment-db \
  --connection-string="postgresql://user:password@host:5432/payment"
```

### 2. 設定 Secrets

```bash
# 為每個 Worker 設定 secrets
wrangler secret put AWS_ACCESS_KEY_ID --name order-ingress
wrangler secret put AWS_SECRET_ACCESS_KEY --name order-ingress
wrangler secret put WEBHOOK_SECRET --name order-ingress
# ... 其他 secrets
```

### 3. 部署 Workers

```bash
# 部署全部 Workers
pnpm deploy:all

# 或個別部署
cd workers/order-ingress && wrangler deploy
cd workers/upstream-callback && wrangler deploy
cd workers/mock-provider && wrangler deploy
```

### 4. 設定 AWS SQS

```bash
# 建立 SQS 佇列
aws sqs create-queue --queue-name order-events --region ap-northeast-1

# 建立死信佇列
aws sqs create-queue --queue-name order-events-dlq --region ap-northeast-1

# 設定主佇列的 DLQ
aws sqs set-queue-attributes \
  --queue-url <主佇列 URL> \
  --attributes '{
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"<DLQ ARN>\",\"maxReceiveCount\":\"5\"}"
  }'
```

### 5. 部署 Lambda 橋接

```bash
# 使用 AWS SAM 或 Serverless Framework 部署
cd lambda-bridge && sam deploy
```

---

## 監控與除錯

### 查看 Workers 日誌

```bash
wrangler tail order-ingress
```

### 查看死信記錄

```sql
-- Webhook 死信
SELECT * FROM dead_letter_records ORDER BY last_failed_at DESC LIMIT 10;

-- 事件死信
SELECT * FROM event_dead_letters ORDER BY failed_at DESC LIMIT 10;
```

### 查看 SQS 佇列狀態

```bash
aws sqs get-queue-attributes \
  --queue-url <佇列 URL> \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible
```

---

## 常見問題

### Q: Workers 無法連接 PostgreSQL？

**A**: 確認 Hyperdrive 設定正確，且資料庫允許 Cloudflare IP 連線。

```bash
# 檢查 Hyperdrive 狀態
wrangler hyperdrive get <hyperdrive-id>
```

### Q: SQS 訊息未被消費？

**A**: 確認 Lambda 橋接已部署且正確設定 Workers URL。

```bash
# 檢查 Lambda 日誌
aws logs tail /aws/lambda/sqs-to-workers-bridge --follow
```

### Q: 本機 LocalStack SQS 無法使用？

**A**: 確認 LocalStack 容器正常運行。

```bash
docker logs localstack
aws --endpoint-url=http://localhost:4566 sqs list-queues
```

---

## 目錄結構

```
payment-remaster/
├── workers/
│   ├── order-ingress/
│   ├── gateway-router/
│   ├── upstream-callback/
│   ├── merchant-webhook-notifier/
│   └── mock-provider/
├── shared/
│   ├── db/
│   ├── sqs/
│   ├── events/
│   ├── domain/
│   ├── http/
│   └── config/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── contract/
├── specs/
│   └── 001-minimal-payment-flow/
├── docker-compose.yml
├── package.json
└── pnpm-workspace.yaml
```

---

## 下一步

1. 完成所有 Workers 實作
2. 撰寫完整測試案例
3. 設定 CI/CD pipeline
4. 部署至 staging 環境驗證
