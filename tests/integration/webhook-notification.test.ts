import { describe, it, expect } from 'vitest';
import { handleRequest as webhookNotifier } from '../../workers/merchant-webhook-notifier/src/index';

describe('Webhook notifier', () => {
  it('sends webhook and handles success', async () => {
    const env = { WEBHOOK_SECRET: 'WEBHOOK_SECRET', WEBHOOK_URL: 'https://merchant.example.com/webhook' };
    const event = { payload: { order_id: 'some', merchant_id: 'MERCHANT001', old_status: 'PROCESSING', new_status: 'SUCCESS' } };
    const res = await webhookNotifier(new Request('https://test/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event) }), env as any);
    expect(res.status).toBe(200);
  });
});
