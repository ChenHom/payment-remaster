import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Order full flow', async () => {
  beforeEach(() => {
    // Mock node-fetch
    vi.doMock('node-fetch', () => ({
      default: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true })
      })
    }));

    // Mock SQS producer
    vi.doMock('../../shared/src/sqs/producer', () => ({
      sendMessage: vi.fn().mockResolvedValue({})
    }));
  });

  afterEach(() => {
    vi.doUnmock('node-fetch');
    vi.doUnmock('../../shared/src/sqs/producer');
    vi.resetModules();
  });

  it('creates, routes, and updates to final state', async () => {
    const { handleRequest: orderIngress } = await import('../../workers/order-ingress/src/index');
    const { handleRequest: gatewayRouter } = await import('../../workers/gateway-router/src/index');
    const { handleRequest: upstreamCallback } = await import('../../workers/upstream-callback/src/index');
    const { createInMemoryPaymentOrderRepository } = await import('../../shared/src/db/repositories/inmemory/payment-order');

    const env = { TEST_MERCHANT_KEY: 'TEST_MERCHANT_KEY', SQS_QUEUE_URL: 'dummy', MOCK_PROVIDER_URL: 'http://localhost:3000', MOCK_CALLBACK_TOKEN: 'MOCK_CALLBACK_TOKEN' };

    const req = new Request('https://localhost/api/merchant/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': 'TEST_MERCHANT_KEY' }, body: JSON.stringify({ merchant_order_no: 'MO-10', amount: 100, currency: 'TWD' }) });
    const res = await orderIngress(req, env as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    const order_id = body.order_id;

    // simulate SQS invoking gateway-router with OrderCreated event
    const event = { payload: { order_id, merchant_id: 'MERCHANT001', amount: 100, currency: 'TWD', initial_status: 'PENDING' } };
    await gatewayRouter(new Request('https://localhost/queue', { method: 'POST', headers: {}, body: JSON.stringify(event) }), env as any);

    // mock provider receives and will call callback; simulate direct callback
    const callbackReq = new Request('https://localhost/api/payment/callback/mock-provider', { method: 'POST', headers: { 'X-Callback-Token': 'MOCK_CALLBACK_TOKEN', 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id, result: 'SUCCESS', upstream_txn_id: 'up-1' }) });
    const cbRes = await upstreamCallback(callbackReq, env as any);
    expect(cbRes.status).toBe(200);

    // check order status
    const repo = createInMemoryPaymentOrderRepository();
    const order = await repo.findById(order_id);
    expect(order?.status === 'SUCCESS' || order?.status === 'FAILED').toBe(true);
  });
});
