# Research: 最小代收交易流

**Feature**: `001-minimal-payment-flow` | **Date**: 2025-12-05

本文件記錄 Phase 0 研究結果，解決 Technical Context 中的未釐清項目與技術整合方案。

---

## 1. Cloudflare Workers + PostgreSQL 整合

### 研究問題

Cloudflare Workers 如何連接外部 PostgreSQL 資料庫？

### 決策

使用 **Cloudflare Hyperdrive** 連接外部 PostgreSQL。

### 理由

- Hyperdrive 提供連線池管理，解決 Workers 短生命週期的連線問題
- 支援標準 PostgreSQL 協定，可使用 `node-postgres` 或 `postgres` 套件
- 自動處理連線重用與 TLS 加密
- Cloudflare 官方支援，文件完整

### 替代方案

| 方案 | 優點 | 缺點 | 採用 |
|------|------|------|------|
| Hyperdrive | 原生支援、連線池管理 | 需 Cloudflare 付費方案 | ✅ |
| Neon Serverless Driver | HTTP 協定、無連線限制 | 綁定 Neon 服務 | 備選 |
| Supabase Pooler | 支援 Supabase 生態 | 綁定 Supabase | 不採用 |
| 直接連線 | 無額外依賴 | 連線數限制、冷啟動慢 | 不採用 |

### 實作細節

**wrangler.toml 設定**：

```toml
[[hyperdrive]]
binding = "DB_PAYMENT"
id = "<hyperdrive-config-id>"
```

**連線程式碼**：

```typescript
import { Client } from 'pg';

export async function getDbClient(env: Env): Promise<Client> {
  const client = new Client(env.DB_PAYMENT.connectionString);
  await client.connect();
  return client;
}
```

---

## 2. Cloudflare Workers + AWS SQS 整合

### 研究問題

Cloudflare Workers 如何與 AWS SQS 整合？Workers 無法直接作為 SQS Consumer，該如何處理？

### 決策

採用 **Lambda 橋接模式**：SQS → Lambda → Workers HTTP endpoint。

### 理由

- SQS 原生支援 Lambda 觸發，延遲最低（毫秒級）
- Lambda 呼叫 Workers HTTP endpoint 簡單直接
- 保留 Workers 作為主要運算平台，Lambda 僅作轉發
- AWS SQS Free Tier 每月 100 萬次請求免費

### 替代方案

| 方案 | 優點 | 缺點 | 採用 |
|------|------|------|------|
| Lambda 橋接 | 延遲低、原生支援 | 需維護兩個平台 | ✅ |
| Cron 輪詢 | 純 Workers 實作 | 延遲高（最快 1 分鐘）、消耗資源 | 不採用 |
| SNS HTTP 訂閱 | 即時推送 | 需額外設定 SNS、複雜度增加 | 備選 |

### 架構圖

```
[Producer Worker] --> [AWS SQS Queue] --> [AWS Lambda] --> [Consumer Worker HTTP]
```

### 實作細節

**Producer（發送訊息）**：

```typescript
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const sqsClient = new SQSClient({
  region: 'ap-northeast-1',
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

await sqsClient.send(new SendMessageCommand({
  QueueUrl: env.SQS_ORDER_EVENTS_URL,
  MessageBody: JSON.stringify(event),
  MessageGroupId: event.order_id, // FIFO 佇列用
}));
```

**Lambda 橋接函式**：

```typescript
// AWS Lambda handler
export async function handler(event: SQSEvent): Promise<void> {
  for (const record of event.Records) {
    const body = JSON.parse(record.body);
    const workerUrl = process.env.WORKER_CONSUMER_URL!;

    await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: record.body,
    });
  }
}
```

**Consumer Worker（HTTP endpoint）**：

```typescript
// gateway-router worker
app.post('/internal/events/order-created', async (c) => {
  const event = await c.req.json<OrderCreatedEvent>();
  // 處理事件...
  return c.json({ status: 'PROCESSED' });
});
```

---

## 3. PostgreSQL Schema 設計

### 研究問題

如何將 spec 中的 D1 Schema 轉換為 PostgreSQL？

### 決策

使用 PostgreSQL 原生類型，並加入適當的 CHECK 約束。

### 類型對應

| D1 類型 | PostgreSQL 類型 | 說明 |
|---------|-----------------|------|
| TEXT | VARCHAR(255) / TEXT | 短字串用 VARCHAR，長文本用 TEXT |
| NUMERIC | DECIMAL(18,4) | 金額使用固定精度 |
| TEXT (datetime) | TIMESTAMPTZ | 時間戳記 |
| INTEGER | INTEGER | 整數 |

### Schema 調整重點

1. **主鍵**：使用 `UUID` 類型（PostgreSQL 原生支援）
2. **時間**：使用 `TIMESTAMPTZ` 自動處理時區
3. **狀態欄位**：加入 `CHECK` 約束限制有效值
4. **索引**：依據查詢模式建立適當索引

---

## 4. SQS FIFO vs Standard Queue

### 研究問題

應該使用 FIFO 還是 Standard Queue？

### 決策

使用 **Standard Queue**。

### 理由

- 本階段不需嚴格順序保證
- Standard Queue 吞吐量更高
- 成本較低
- 冪等設計已確保重複處理安全

### FIFO 適用場景（未來擴充）

- 需要嚴格訂單順序的業務場景
- 單一訂單多次狀態更新需依序處理

---

## 5. 錯誤處理與死信佇列

### 研究問題

如何處理 SQS 消費失敗？如何設定死信佇列？

### 決策

使用 **SQS Dead Letter Queue (DLQ)** + **資料庫死信記錄**。

### 實作方式

1. **SQS DLQ 設定**：
   - 主佇列失敗 5 次後移至 DLQ
   - DLQ 訊息保留 14 天

2. **Lambda 橋接錯誤處理**：
   - Workers 回傳非 2xx → Lambda 拋出錯誤 → SQS 重試
   - 重試次數耗盡 → 進入 SQS DLQ

3. **資料庫死信記錄**：
   - Webhook 通知失敗記錄至 `dead_letter_records` 表
   - 事件處理失敗記錄至 `event_dead_letters` 表

---

## 6. 環境變數與 Secrets 管理

### 研究問題

如何安全管理 AWS 憑證與其他敏感資訊？

### 決策

使用 **Cloudflare Workers Secrets**。

### 環境變數清單

| 變數名稱 | 類型 | 說明 |
|----------|------|------|
| `AWS_ACCESS_KEY_ID` | Secret | AWS 存取金鑰 |
| `AWS_SECRET_ACCESS_KEY` | Secret | AWS 秘密金鑰 |
| `AWS_REGION` | Env | AWS 區域（ap-northeast-1） |
| `SQS_ORDER_EVENTS_URL` | Env | SQS 佇列 URL |
| `WEBHOOK_SECRET` | Secret | Webhook 簽名密鑰 |
| `TEST_MERCHANT_KEY` | Secret | 商戶 API 金鑰 |
| `MOCK_CALLBACK_TOKEN` | Secret | 回調驗證 Token |
| `MOCK_PROVIDER_URL` | Env | 模擬上游 URL |

---

## 7. 本機開發環境

### 研究問題

如何在本機模擬完整環境進行開發？

### 決策

使用 **Miniflare** + **Docker Compose**（PostgreSQL + LocalStack）。

### 開發堆疊

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: payment
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev

  localstack:
    image: localstack/localstack
    ports: ["4566:4566"]
    environment:
      SERVICES: sqs
```

### Miniflare 設定

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'miniflare',
    environmentOptions: {
      bindings: {
        // 模擬 Hyperdrive
        DB_PAYMENT: { connectionString: 'postgresql://dev:dev@localhost:5432/payment' },
      },
    },
  },
});
```

---

## 8. AWS SQS Free Tier 限制

### 研究問題

AWS SQS Free Tier 的限制是什麼？是否足夠使用？

### 調查結果

| 項目 | Free Tier 額度 |
|------|---------------|
| 請求數 | 每月 100 萬次 |
| 資料傳輸 | 出站 1GB（含在 AWS Free Tier） |

### 評估

以每筆訂單需要 2 次 SQS 操作（發送 + 接收）計算：
- 每月可處理 50 萬筆訂單
- 對於練習專案綽綽有餘

---

## 9. Hono vs Itty Router

### 研究問題

HTTP 路由框架選擇？

### 決策

使用 **Hono**。

### 理由

- 完整的 TypeScript 支援
- 內建中介軟體（驗證、錯誤處理）
- Cloudflare Workers 原生支援
- 活躍社群與持續維護

### 替代方案

| 框架 | 優點 | 缺點 | 採用 |
|------|------|------|------|
| Hono | 功能完整、TypeScript 優先 | 較 itty-router 大 | ✅ |
| itty-router | 極輕量（<1KB） | 功能較少 | 不採用 |
| 原生 fetch | 無依賴 | 重複造輪子 | 不採用 |

---

## 總結

| 技術項目 | 決策 | 備註 |
|----------|------|------|
| 資料庫連線 | Cloudflare Hyperdrive | 原生支援 PostgreSQL |
| 訊息佇列整合 | Lambda 橋接模式 | SQS → Lambda → Workers |
| 佇列類型 | Standard Queue | 本階段不需 FIFO |
| HTTP 路由 | Hono | TypeScript 優先 |
| 本機開發 | Miniflare + Docker Compose | 模擬完整環境 |
| Secrets 管理 | Cloudflare Workers Secrets | 安全儲存敏感資訊 |
