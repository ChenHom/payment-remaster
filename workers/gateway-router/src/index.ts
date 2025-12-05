import fetch from 'node-fetch';
import { createInMemoryPaymentOrderRepository } from '../../../shared/src/db/repositories/inmemory/payment-order';

const queueProcessing = async (body: any, env: any = process.env) => {
  // body is expected to be the OrderCreated event
  const repo = createInMemoryPaymentOrderRepository();
  const orderId = body.payload.order_id;
  // update status to PROCESSING (cas)
  await repo.updateStatusIfMatch(orderId, 'PENDING' as any, 'PROCESSING' as any);

  // call mock provider
  try {
    await fetch(env.MOCK_PROVIDER_URL + '/mock/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, amount: body.payload.amount, currency: body.payload.currency, callback_url: env.MOCK_PROVIDER_URL })
    });
  } catch (e) {
    // ignore now
  }
};

export async function handleRequest(request: Request, env: any = process.env) {
  if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
    return new Response(JSON.stringify({ status: 'OK' }), { status: 200 });
  }
  if (request.method !== 'POST') return new Response('Not Found', { status: 404 });
  const body = await request.json();
  // assume body is event or raw message if via lambda bridge
  await queueProcessing(body, env);
  return new Response('OK');
}

export default { fetch: handleRequest };
