import { createInMemoryPaymentOrderRepository } from '../../../shared/src/db/repositories/inmemory/payment-order';
import { createOrderStatusChangedEvent } from '../../../shared/src/events/order-status-changed';
import { sendMessage } from '../../../shared/src/sqs/producer';

export async function handleRequest(request: Request, env: any = process.env) {
  if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
    return new Response(JSON.stringify({ status: 'OK' }), { status: 200 });
  }
  if (request.method !== 'POST') return new Response('Not Found', { status: 404 });
  try {
    const body = await request.json();
    const token = request.headers.get('x-callback-token') || '';
    if (token !== (env.MOCK_CALLBACK_TOKEN || 'MOCK_CALLBACK_TOKEN')) {
      return new Response(JSON.stringify({ error: 'invalid token' }), { status: 401 });
    }
    const repo = createInMemoryPaymentOrderRepository();
    const orderId = body.order_id;
    const result = body.result;
    let updated = null;
    if (result === 'SUCCESS') {
      updated = await repo.updateStatusIfMatch(orderId, 'PROCESSING' as any, 'SUCCESS' as any, { upstream_txn_id: body.upstream_txn_id });
    } else {
      updated = await repo.updateStatusIfMatch(orderId, 'PROCESSING' as any, 'FAILED' as any, { failure_code: body.failure_code || 'UPSTREAM_FAILED', failure_reason: body.failure_message || 'Upstream failed' });
    }
    if (updated && env.SQS_QUEUE_URL) {
      const event = createOrderStatusChangedEvent({ order_id: updated.id, merchant_id: updated.merchant_id, old_status: 'PROCESSING', new_status: updated.status });
      await sendMessage(env.SQS_QUEUE_URL, event, env);
    }
    return new Response(JSON.stringify({ status: 'RECEIVED' }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

export default { fetch: handleRequest };
