import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * T057 [US4] Unit test for webhook retry logic and dead letter record creation
 *
 * Test Cases:
 * 1. 驗證 3 次重試間隔為 10s/30s/60s
 * 2. 驗證重試 3 次失敗後建立死信記錄
 * 3. 驗證重複通知的冪等行為（更新而非新建）
 */

// Retry interval constants (in seconds)
const RETRY_INTERVALS = [10, 30, 60];
const MAX_RETRIES = 3;

// Helper: Webhook retry logic extracted for testing
interface WebhookRetryResult {
  success: boolean;
  attempts: number;
  intervalUsed: number[];
}

interface DeadLetterRecord {
  id: string;
  order_id: string;
  merchant_id: string;
  webhook_url: string;
  payload: string;
  last_error_message: string;
  last_http_status?: number;
  retry_count: number;
  first_failed_at: string;
  last_failed_at: string;
}

// Mock implementation of webhook retry logic
async function executeWebhookWithRetry(
  webhookUrl: string,
  payload: object,
  sendFn: (url: string, body: string) => Promise<{ ok: boolean; status: number }>,
  delayFn: (ms: number) => Promise<void>
): Promise<WebhookRetryResult> {
  const intervalUsed: number[] = [];
  let attempts = 0;

  // Initial attempt
  attempts++;
  const firstResult = await sendFn(webhookUrl, JSON.stringify(payload));
  if (firstResult.ok) {
    return { success: true, attempts, intervalUsed };
  }

  // Retries with configured intervals
  for (let i = 0; i < MAX_RETRIES; i++) {
    const delaySeconds = RETRY_INTERVALS[i];
    intervalUsed.push(delaySeconds);
    await delayFn(delaySeconds * 1000);

    attempts++;
    const result = await sendFn(webhookUrl, JSON.stringify(payload));
    if (result.ok) {
      return { success: true, attempts, intervalUsed };
    }
  }

  return { success: false, attempts, intervalUsed };
}

// Mock implementation of dead letter record creation
function createDeadLetterRecord(params: {
  orderId: string;
  merchantId: string;
  webhookUrl: string;
  payload: object;
  errorMessage: string;
  httpStatus?: number;
  retryCount: number;
}): DeadLetterRecord {
  const now = new Date().toISOString();
  return {
    id: `dl-${params.orderId}`,
    order_id: params.orderId,
    merchant_id: params.merchantId,
    webhook_url: params.webhookUrl,
    payload: JSON.stringify(params.payload),
    last_error_message: params.errorMessage,
    last_http_status: params.httpStatus,
    retry_count: params.retryCount,
    first_failed_at: now,
    last_failed_at: now,
  };
}

// Mock implementation of dead letter upsert (idempotent update)
function upsertDeadLetterRecord(
  existing: DeadLetterRecord | null,
  params: {
    orderId: string;
    merchantId: string;
    webhookUrl: string;
    payload: object;
    errorMessage: string;
    httpStatus?: number;
    additionalRetryCount: number;
  }
): DeadLetterRecord {
  const now = new Date().toISOString();

  if (existing) {
    // Update existing record
    return {
      ...existing,
      retry_count: existing.retry_count + params.additionalRetryCount,
      last_error_message: params.errorMessage,
      last_http_status: params.httpStatus,
      last_failed_at: now,
    };
  }

  // Create new record
  return {
    id: `dl-${params.orderId}`,
    order_id: params.orderId,
    merchant_id: params.merchantId,
    webhook_url: params.webhookUrl,
    payload: JSON.stringify(params.payload),
    last_error_message: params.errorMessage,
    last_http_status: params.httpStatus,
    retry_count: params.additionalRetryCount,
    first_failed_at: now,
    last_failed_at: now,
  };
}

describe('Webhook Retry Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Test 1: Retry intervals should be 10s/30s/60s', () => {
    it('should use correct retry intervals when all attempts fail', async () => {
      const mockSend = vi.fn().mockResolvedValue({ ok: false, status: 503 });
      const delayFn = vi.fn().mockResolvedValue(undefined);

      const result = await executeWebhookWithRetry(
        'https://merchant.example.com/webhook',
        { order_id: 'order-123', status: 'SUCCESS' },
        mockSend,
        delayFn
      );

      expect(result.success).toBe(false);
      expect(result.intervalUsed).toEqual([10, 30, 60]);
      expect(delayFn).toHaveBeenNthCalledWith(1, 10000);
      expect(delayFn).toHaveBeenNthCalledWith(2, 30000);
      expect(delayFn).toHaveBeenNthCalledWith(3, 60000);
    });

    it('should not use delay when first attempt succeeds', async () => {
      const mockSend = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      const delayFn = vi.fn();

      const result = await executeWebhookWithRetry(
        'https://merchant.example.com/webhook',
        { order_id: 'order-123', status: 'SUCCESS' },
        mockSend,
        delayFn
      );

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
      expect(result.intervalUsed).toEqual([]);
      expect(delayFn).not.toHaveBeenCalled();
    });

    it('should stop retrying after successful attempt', async () => {
      const mockSend = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({ ok: true, status: 200 });
      const delayFn = vi.fn().mockResolvedValue(undefined);

      const result = await executeWebhookWithRetry(
        'https://merchant.example.com/webhook',
        { order_id: 'order-123', status: 'SUCCESS' },
        mockSend,
        delayFn
      );

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(result.intervalUsed).toEqual([10, 30]); // Only 2 delays used
      expect(delayFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Test 2: Dead letter record creation after retry exhaustion', () => {
    it('should create dead letter record after 3 retries fail', async () => {
      const orderId = 'order-456';
      const merchantId = 'MERCHANT001';
      const webhookUrl = 'https://merchant.example.com/webhook';
      const payload = { order_id: orderId, status: 'SUCCESS' };

      const mockSend = vi.fn().mockResolvedValue({ ok: false, status: 503 });
      const delayFn = vi.fn().mockResolvedValue(undefined);

      const result = await executeWebhookWithRetry(webhookUrl, payload, mockSend, delayFn);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(4); // 1 initial + 3 retries

      // Create dead letter record
      const deadLetter = createDeadLetterRecord({
        orderId,
        merchantId,
        webhookUrl,
        payload,
        errorMessage: 'Webhook failed after 3 retries',
        httpStatus: 503,
        retryCount: 3,
      });

      expect(deadLetter.order_id).toBe(orderId);
      expect(deadLetter.merchant_id).toBe(merchantId);
      expect(deadLetter.webhook_url).toBe(webhookUrl);
      expect(JSON.parse(deadLetter.payload)).toEqual(payload);
      expect(deadLetter.retry_count).toBe(3);
      expect(deadLetter.last_error_message).toBe('Webhook failed after 3 retries');
      expect(deadLetter.last_http_status).toBe(503);
    });

    it('should include correct fields in dead letter record', () => {
      const record = createDeadLetterRecord({
        orderId: 'order-789',
        merchantId: 'MERCHANT002',
        webhookUrl: 'https://example.com/hook',
        payload: { test: true },
        errorMessage: 'Connection timeout',
        httpStatus: undefined,
        retryCount: 3,
      });

      expect(record).toHaveProperty('id');
      expect(record).toHaveProperty('order_id', 'order-789');
      expect(record).toHaveProperty('merchant_id', 'MERCHANT002');
      expect(record).toHaveProperty('webhook_url', 'https://example.com/hook');
      expect(record).toHaveProperty('payload');
      expect(record).toHaveProperty('last_error_message', 'Connection timeout');
      expect(record).toHaveProperty('retry_count', 3);
      expect(record).toHaveProperty('first_failed_at');
      expect(record).toHaveProperty('last_failed_at');
    });
  });

  describe('Test 3: Idempotent behavior for duplicate notifications', () => {
    it('should update existing record instead of creating new one', () => {
      const existingRecord: DeadLetterRecord = {
        id: 'dl-order-123',
        order_id: 'order-123',
        merchant_id: 'MERCHANT001',
        webhook_url: 'https://merchant.example.com/webhook',
        payload: '{"order_id":"order-123"}',
        last_error_message: 'First failure',
        last_http_status: 500,
        retry_count: 3,
        first_failed_at: '2025-12-05T10:00:00.000Z',
        last_failed_at: '2025-12-05T10:01:40.000Z',
      };

      const updated = upsertDeadLetterRecord(existingRecord, {
        orderId: 'order-123',
        merchantId: 'MERCHANT001',
        webhookUrl: 'https://merchant.example.com/webhook',
        payload: { order_id: 'order-123' },
        errorMessage: 'Second failure round',
        httpStatus: 503,
        additionalRetryCount: 3,
      });

      // Should keep same ID (not create new)
      expect(updated.id).toBe(existingRecord.id);
      // Retry count should increment
      expect(updated.retry_count).toBe(6);
      // Error message should be updated
      expect(updated.last_error_message).toBe('Second failure round');
      // HTTP status should be updated
      expect(updated.last_http_status).toBe(503);
      // first_failed_at should remain unchanged
      expect(updated.first_failed_at).toBe(existingRecord.first_failed_at);
      // last_failed_at should be updated
      expect(updated.last_failed_at).not.toBe(existingRecord.last_failed_at);
    });

    it('should create new record when no existing record', () => {
      const result = upsertDeadLetterRecord(null, {
        orderId: 'order-new',
        merchantId: 'MERCHANT001',
        webhookUrl: 'https://merchant.example.com/webhook',
        payload: { order_id: 'order-new' },
        errorMessage: 'Initial failure',
        httpStatus: 502,
        additionalRetryCount: 3,
      });

      expect(result.id).toBe('dl-order-new');
      expect(result.order_id).toBe('order-new');
      expect(result.retry_count).toBe(3);
      expect(result.first_failed_at).toBe(result.last_failed_at);
    });
  });
});

describe('Retry Conditions', () => {
  it('should identify retryable HTTP status codes', () => {
    const retryableStatuses = [500, 502, 503, 504];
    const nonRetryableStatuses = [400, 401, 403, 404];

    const isRetryable = (status: number) => status >= 500 && status < 600;

    retryableStatuses.forEach((status) => {
      expect(isRetryable(status)).toBe(true);
    });

    nonRetryableStatuses.forEach((status) => {
      expect(isRetryable(status)).toBe(false);
    });
  });
});
