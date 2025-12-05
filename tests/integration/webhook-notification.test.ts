import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Webhook notifier', () => {
  beforeEach(() => {
    // Mock node-fetch
    vi.doMock('node-fetch', () => ({
      default: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true })
      })
    }));
  });

  afterEach(() => {
    vi.doUnmock('node-fetch');
    vi.resetModules();
  });

  it('sends webhook and handles success', async () => {
    const { handleRequest: webhookNotifier } = await import('../../workers/merchant-webhook-notifier/src/index');
    const env = { WEBHOOK_SECRET: 'WEBHOOK_SECRET', WEBHOOK_URL: 'https://merchant.example.com/webhook' };
    const event = { payload: { order_id: 'some', merchant_id: 'MERCHANT001', old_status: 'PROCESSING', new_status: 'SUCCESS' } };
    const res = await webhookNotifier(new Request('https://test/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event) }), env as any);
    expect(res.status).toBe(200);
  });
});
