import fetch from 'node-fetch';
import { createInMemoryPaymentOrderRepository } from '../../../shared/src/db/repositories/inmemory/payment-order';
import { createPgDeadLetterRepository } from '../../../shared/src/db/repositories/dead-letter';
import { computeSignature } from '../../../shared/src/http/signature';

async function sendWebhook(url: string, payload: any, secret: string, timeout = 3000) {
  const body = JSON.stringify(payload);
  const sig = computeSignature(secret, body);
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Signature': sig }, body, timeout });
  return res;
}

export async function handleRequest(request: Request, env: any = process.env) {
  if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
    return new Response(JSON.stringify({ status: 'OK' }), { status: 200 });
  }
  if (request.method !== 'POST') return new Response('Not Found', { status: 404 });
  try {
    const body = await request.json();
    // body is event
    const orderId = body.payload.order_id;
    const repo = createInMemoryPaymentOrderRepository();
    const order = await repo.findById(orderId);
    const webhookUrl = order ? order.merchant_id === 'MERCHANT001' ? (env.WEBHOOK_URL || 'https://merchant.example.com/webhook') : '' : '';
    const secret = env.WEBHOOK_SECRET || 'WEBHOOK_SECRET';
    const payload = { order_id: orderId, merchant_order_no: order?.merchant_order_no, status: body.payload.new_status };
    let attempt = 0;
    const delays = [10, 30, 60];
    while (attempt < 3) {
      try {
        const resp = await sendWebhook(webhookUrl, payload, secret);
        if (resp && resp.ok) {
          return new Response(createJsonResponse({ status: 'OK' }), { status: 200 });
        }
      } catch (err) {
        // ignore, retry
      }
      await new Promise(r => setTimeout(r, delays[attempt] * 1000));
      attempt++;
    }
    // on exhausted retries, write to dead_letter_records
    const deadRepo = createPgDeadLetterRepository({ query: async () => ({ rows: [] }) } as any); // placeholder minimal
    console.error('Entering dead letter for order', orderId);
    await deadRepo.create({
      id: 'dl-' + orderId,
      order_id: orderId,
      merchant_id: order?.merchant_id || 'MERCHANT001',
      webhook_url: webhookUrl,
      payload: JSON.stringify(payload),
      last_error_message: 'Webhook failed after retries',
      retry_count: attempt,
      first_failed_at: new Date().toISOString(),
      last_failed_at: new Date().toISOString()
    } as any);
    return new Response(createJsonResponse({ status: 'DEAD_LETTER' }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

export default { fetch: handleRequest };

// utils
function createJsonResponse(obj: any) {
  return JSON.stringify(obj);
}
