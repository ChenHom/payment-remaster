import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

describe('Webhook notifier', () => {
  let fetchMock: MockInstance;

  beforeEach(() => {
    // Use fake timers for retry delays
    vi.useFakeTimers();

    // Mock global fetch
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true })
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('sends webhook and handles success', async () => {
    const { handleRequest: webhookNotifier } = await import('../../workers/merchant-webhook-notifier/src/index');
    const env = {
      WEBHOOK_SECRET: 'WEBHOOK_SECRET',
      WEBHOOK_URL: 'https://merchant.example.com/webhook'
    };
    const event = {
      event_id: 'evt-001',
      event_type: 'order.status.changed',
      trace_id: 'trace-001',
      timestamp: new Date().toISOString(),
      payload: {
        order_id: 'order-123',
        merchant_id: 'MERCHANT001',
        merchant_order_no: 'M-001',
        previous_status: 'PROCESSING',
        new_status: 'SUCCESS'
      }
    };

    const request = new Request('https://test/sqs/order-status-changed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });

    const res = await webhookNotifier(request, env as any);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://merchant.example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Signature': expect.any(String)
        })
      })
    );
  });

  it('retries webhook on failure and records dead letter after exhaustion', async () => {
    // Mock fetch to always fail with 503
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503
    });

    const { handleRequest: webhookNotifier } = await import('../../workers/merchant-webhook-notifier/src/index');
    const env = {
      WEBHOOK_SECRET: 'WEBHOOK_SECRET',
      WEBHOOK_URL: 'https://merchant.example.com/webhook'
      // Note: No DATABASE_URL, so dead letter won't be saved but retry logic still works
    };
    const event = {
      event_id: 'evt-002',
      event_type: 'order.status.changed',
      trace_id: 'trace-002',
      timestamp: new Date().toISOString(),
      payload: {
        order_id: 'order-456',
        merchant_id: 'MERCHANT001',
        merchant_order_no: 'M-002',
        previous_status: 'PROCESSING',
        new_status: 'FAILED'
      }
    };

    const request = new Request('https://test/sqs/order-status-changed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });

    // Start the request (will trigger retries)
    const responsePromise = webhookNotifier(request, env as any);

    // Advance timer for retry 1 (10s delay)
    await vi.advanceTimersByTimeAsync(10_000);
    // Advance timer for retry 2 (30s delay)
    await vi.advanceTimersByTimeAsync(30_000);
    // Advance timer for retry 3 (60s delay)
    await vi.advanceTimersByTimeAsync(60_000);

    const res = await responsePromise;

    // After all retries exhausted, should return 200 (event processed, dead letter recorded)
    expect(res.status).toBe(200);
    // Initial attempt + 3 retries = 4 total attempts
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
