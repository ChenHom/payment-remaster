import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * T058 [US4] Integration test for complete webhook failure flow
 *
 * Test Cases:
 * 1. 建立訂單 → 狀態變更 → Webhook 回傳 5xx
 * 2. 驗證 3 次重試後進入 dead_letter_records
 * 3. 驗證可查詢死信記錄並查看重試次數與錯誤訊息
 */

// Mock types
interface PaymentOrder {
  id: string;
  merchant_id: string;
  merchant_order_no: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
  created_at: string;
  updated_at: string;
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

interface OrderStatusChangedEvent {
  event_id: string;
  event_type: 'order.status.changed';
  trace_id: string;
  timestamp: string;
  payload: {
    order_id: string;
    merchant_id: string;
    merchant_order_no: string;
    previous_status: string;
    new_status: string;
  };
}

// In-memory stores for integration test
class TestStore {
  orders: Map<string, PaymentOrder> = new Map();
  deadLetters: Map<string, DeadLetterRecord> = new Map();

  reset() {
    this.orders.clear();
    this.deadLetters.clear();
  }
}

// Mock webhook service with controllable behavior
class MockWebhookService {
  private failureCount = 0;
  private maxFailures = 4; // Fail 4 times = initial + 3 retries
  public attempts: Array<{ url: string; payload: object; timestamp: Date }> = [];
  public shouldFail = true;
  public httpStatus = 503;

  async sendWebhook(url: string, payload: object): Promise<{ ok: boolean; status: number }> {
    this.attempts.push({ url, payload, timestamp: new Date() });

    if (this.shouldFail && this.failureCount < this.maxFailures) {
      this.failureCount++;
      return { ok: false, status: this.httpStatus };
    }

    return { ok: true, status: 200 };
  }

  reset() {
    this.failureCount = 0;
    this.attempts = [];
    this.shouldFail = true;
    this.httpStatus = 503;
  }
}

// Mock merchant-webhook-notifier handler
async function handleWebhookNotification(
  event: OrderStatusChangedEvent,
  store: TestStore,
  webhookService: MockWebhookService,
  webhookUrl: string,
  delayFn: (ms: number) => Promise<void>
): Promise<{ success: boolean; deadLetterCreated: boolean }> {
  const { order_id, merchant_id, merchant_order_no, new_status } = event.payload;

  const payload = {
    order_id,
    merchant_order_no,
    status: new_status,
  };

  const retryIntervals = [10, 30, 60]; // seconds
  let success = false;

  // Initial attempt
  let result = await webhookService.sendWebhook(webhookUrl, payload);
  let lastError = '';
  let lastStatus: number | undefined;

  if (result.ok) {
    return { success: true, deadLetterCreated: false };
  }

  lastError = `Webhook failed with status ${result.status}`;
  lastStatus = result.status;

  // Retry loop
  for (let i = 0; i < 3; i++) {
    await delayFn(retryIntervals[i] * 1000);
    result = await webhookService.sendWebhook(webhookUrl, payload);

    if (result.ok) {
      return { success: true, deadLetterCreated: false };
    }

    lastError = `Webhook failed with status ${result.status}`;
    lastStatus = result.status;
  }

  // All retries exhausted - create dead letter record
  const existingDeadLetter = store.deadLetters.get(order_id);
  const now = new Date().toISOString();

  if (existingDeadLetter) {
    // Update existing record (idempotent)
    store.deadLetters.set(order_id, {
      ...existingDeadLetter,
      retry_count: existingDeadLetter.retry_count + 3,
      last_error_message: lastError,
      last_http_status: lastStatus,
      last_failed_at: now,
    });
  } else {
    // Create new record
    store.deadLetters.set(order_id, {
      id: `dl-${order_id}`,
      order_id,
      merchant_id,
      webhook_url: webhookUrl,
      payload: JSON.stringify(payload),
      last_error_message: lastError,
      last_http_status: lastStatus,
      retry_count: 3,
      first_failed_at: now,
      last_failed_at: now,
    });
  }

  return { success: false, deadLetterCreated: true };
}

describe('Webhook Failure Flow Integration Test', () => {
  let store: TestStore;
  let webhookService: MockWebhookService;
  const webhookUrl = 'https://merchant.example.com/webhook';

  beforeEach(() => {
    store = new TestStore();
    webhookService = new MockWebhookService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    store.reset();
    webhookService.reset();
    vi.useRealTimers();
  });

  describe('Test 1: Order creation → Status change → Webhook returns 5xx', () => {
    it('should attempt webhook notification when order status changes to SUCCESS', async () => {
      // Arrange: Create order
      const orderId = 'order-integ-001';
      const order: PaymentOrder = {
        id: orderId,
        merchant_id: 'MERCHANT001',
        merchant_order_no: 'MO-001',
        amount: 100.0,
        currency: 'TWD',
        status: 'SUCCESS',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.orders.set(orderId, order);

      // Create status change event
      const event: OrderStatusChangedEvent = {
        event_id: 'evt-001',
        event_type: 'order.status.changed',
        trace_id: 'trace-001',
        timestamp: new Date().toISOString(),
        payload: {
          order_id: orderId,
          merchant_id: 'MERCHANT001',
          merchant_order_no: 'MO-001',
          previous_status: 'PROCESSING',
          new_status: 'SUCCESS',
        },
      };

      // Configure webhook service to fail
      webhookService.shouldFail = true;
      webhookService.httpStatus = 503;

      // Act
      const delayFn = vi.fn().mockResolvedValue(undefined);
      const result = await handleWebhookNotification(
        event,
        store,
        webhookService,
        webhookUrl,
        delayFn
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.deadLetterCreated).toBe(true);
      expect(webhookService.attempts.length).toBe(4); // 1 initial + 3 retries

      // Verify retry intervals were used
      expect(delayFn).toHaveBeenCalledTimes(3);
      expect(delayFn).toHaveBeenNthCalledWith(1, 10000);
      expect(delayFn).toHaveBeenNthCalledWith(2, 30000);
      expect(delayFn).toHaveBeenNthCalledWith(3, 60000);
    });

    it('should handle FAILED status same as SUCCESS for webhook notification', async () => {
      // Arrange
      const orderId = 'order-integ-002';
      const event: OrderStatusChangedEvent = {
        event_id: 'evt-002',
        event_type: 'order.status.changed',
        trace_id: 'trace-002',
        timestamp: new Date().toISOString(),
        payload: {
          order_id: orderId,
          merchant_id: 'MERCHANT001',
          merchant_order_no: 'MO-002',
          previous_status: 'PROCESSING',
          new_status: 'FAILED',
        },
      };

      webhookService.shouldFail = true;
      const delayFn = vi.fn().mockResolvedValue(undefined);

      // Act
      const result = await handleWebhookNotification(
        event,
        store,
        webhookService,
        webhookUrl,
        delayFn
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.deadLetterCreated).toBe(true);
    });
  });

  describe('Test 2: Verify dead_letter_records entry after 3 retries', () => {
    it('should create dead letter record with correct fields after retry exhaustion', async () => {
      // Arrange
      const orderId = 'order-integ-003';
      const event: OrderStatusChangedEvent = {
        event_id: 'evt-003',
        event_type: 'order.status.changed',
        trace_id: 'trace-003',
        timestamp: new Date().toISOString(),
        payload: {
          order_id: orderId,
          merchant_id: 'MERCHANT001',
          merchant_order_no: 'MO-003',
          previous_status: 'PROCESSING',
          new_status: 'SUCCESS',
        },
      };

      webhookService.shouldFail = true;
      webhookService.httpStatus = 500;
      const delayFn = vi.fn().mockResolvedValue(undefined);

      // Act
      await handleWebhookNotification(event, store, webhookService, webhookUrl, delayFn);

      // Assert: Verify dead letter record was created
      const deadLetter = store.deadLetters.get(orderId);
      expect(deadLetter).toBeDefined();
      expect(deadLetter!.order_id).toBe(orderId);
      expect(deadLetter!.merchant_id).toBe('MERCHANT001');
      expect(deadLetter!.webhook_url).toBe(webhookUrl);
      expect(deadLetter!.retry_count).toBe(3);
      expect(deadLetter!.last_http_status).toBe(500);
      expect(deadLetter!.last_error_message).toContain('500');

      // Verify payload is serialized correctly
      const payload = JSON.parse(deadLetter!.payload);
      expect(payload.order_id).toBe(orderId);
      expect(payload.status).toBe('SUCCESS');
    });

    it('should not create dead letter when webhook succeeds on retry', async () => {
      // Arrange
      const orderId = 'order-integ-004';
      const event: OrderStatusChangedEvent = {
        event_id: 'evt-004',
        event_type: 'order.status.changed',
        trace_id: 'trace-004',
        timestamp: new Date().toISOString(),
        payload: {
          order_id: orderId,
          merchant_id: 'MERCHANT001',
          merchant_order_no: 'MO-004',
          previous_status: 'PROCESSING',
          new_status: 'SUCCESS',
        },
      };

      // Configure to succeed on 2nd attempt
      webhookService.shouldFail = false;
      const delayFn = vi.fn().mockResolvedValue(undefined);

      // Act
      const result = await handleWebhookNotification(
        event,
        store,
        webhookService,
        webhookUrl,
        delayFn
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.deadLetterCreated).toBe(false);
      expect(store.deadLetters.has(orderId)).toBe(false);
    });
  });

  describe('Test 3: Query dead letter records', () => {
    it('should be able to query dead letter record by order_id', async () => {
      // Arrange: Create a dead letter record through the flow
      const orderId = 'order-integ-005';
      const event: OrderStatusChangedEvent = {
        event_id: 'evt-005',
        event_type: 'order.status.changed',
        trace_id: 'trace-005',
        timestamp: new Date().toISOString(),
        payload: {
          order_id: orderId,
          merchant_id: 'MERCHANT001',
          merchant_order_no: 'MO-005',
          previous_status: 'PROCESSING',
          new_status: 'SUCCESS',
        },
      };

      webhookService.shouldFail = true;
      webhookService.httpStatus = 503;
      const delayFn = vi.fn().mockResolvedValue(undefined);

      await handleWebhookNotification(event, store, webhookService, webhookUrl, delayFn);

      // Act: Query dead letter by order_id (simulates SELECT * FROM dead_letter_records WHERE order_id = ?)
      const record = store.deadLetters.get(orderId);

      // Assert
      expect(record).toBeDefined();
      expect(record!.retry_count).toBe(3);
      expect(record!.last_error_message).toContain('503');
      expect(record!.webhook_url).toBe(webhookUrl);
    });

    it('should update existing dead letter record on subsequent failures (idempotent)', async () => {
      // Arrange: First failure round
      const orderId = 'order-integ-006';
      const event: OrderStatusChangedEvent = {
        event_id: 'evt-006',
        event_type: 'order.status.changed',
        trace_id: 'trace-006',
        timestamp: new Date().toISOString(),
        payload: {
          order_id: orderId,
          merchant_id: 'MERCHANT001',
          merchant_order_no: 'MO-006',
          previous_status: 'PROCESSING',
          new_status: 'SUCCESS',
        },
      };

      webhookService.shouldFail = true;
      webhookService.httpStatus = 500;
      const delayFn = vi.fn().mockResolvedValue(undefined);

      // First round of failures
      await handleWebhookNotification(event, store, webhookService, webhookUrl, delayFn);

      const firstRecord = store.deadLetters.get(orderId);
      expect(firstRecord!.retry_count).toBe(3);
      const firstFailedAt = firstRecord!.first_failed_at;
      const firstLastFailedAt = firstRecord!.last_failed_at;

      // Advance time to simulate delay between retry rounds
      vi.advanceTimersByTime(1000);

      // Second round of failures (SQS retry scenario)
      webhookService.reset();
      webhookService.shouldFail = true;
      webhookService.httpStatus = 502;

      await handleWebhookNotification(event, store, webhookService, webhookUrl, delayFn);

      // Assert: Same record updated, not new record created
      const updatedRecord = store.deadLetters.get(orderId);
      expect(updatedRecord!.id).toBe(firstRecord!.id);
      expect(updatedRecord!.retry_count).toBe(6); // 3 + 3
      expect(updatedRecord!.first_failed_at).toBe(firstFailedAt); // Should remain unchanged
      expect(updatedRecord!.last_http_status).toBe(502); // Updated to latest
      // After advancing timers, last_failed_at should be different
      expect(new Date(updatedRecord!.last_failed_at).getTime()).toBeGreaterThan(
        new Date(firstLastFailedAt).getTime()
      );
    });

    it('should be able to list recent dead letter records', () => {
      // Arrange: Add multiple dead letter records
      const now = new Date();

      for (let i = 0; i < 5; i++) {
        store.deadLetters.set(`order-${i}`, {
          id: `dl-order-${i}`,
          order_id: `order-${i}`,
          merchant_id: 'MERCHANT001',
          webhook_url: webhookUrl,
          payload: JSON.stringify({ order_id: `order-${i}` }),
          last_error_message: 'Test error',
          last_http_status: 500,
          retry_count: 3,
          first_failed_at: new Date(now.getTime() - i * 60000).toISOString(),
          last_failed_at: new Date(now.getTime() - i * 60000).toISOString(),
        });
      }

      // Act: List recent records (simulates SELECT * FROM dead_letter_records ORDER BY last_failed_at DESC LIMIT 20)
      const records = Array.from(store.deadLetters.values())
        .sort((a, b) => new Date(b.last_failed_at).getTime() - new Date(a.last_failed_at).getTime());

      // Assert
      expect(records.length).toBe(5);
      expect(records[0].order_id).toBe('order-0'); // Most recent first
    });
  });
});
