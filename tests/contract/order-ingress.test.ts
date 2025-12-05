import { describe, it, expect } from 'vitest';
import { handleRequest } from '../../workers/order-ingress/src/index';

describe('Order Ingress Contract', () => {
  it('creates an order and returns 201', async () => {
    const request = new Request('https://localhost/api/merchant/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'TEST_MERCHANT_KEY' },
      body: JSON.stringify({ merchant_order_no: 'MO-1', amount: 100, currency: 'TWD' })
    });
    const res = await handleRequest(request, { TEST_MERCHANT_KEY: 'TEST_MERCHANT_KEY' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.order_id).toBeDefined();
    expect(body.status).toBe('PENDING');
  });
});
