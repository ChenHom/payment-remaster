import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { createInMemoryPaymentOrderRepository } from '../../../shared/src/db/repositories/inmemory/payment-order';
import { createOrderCreatedEvent } from '../../../shared/src/events/order-created';
import { sendMessage } from '../../../shared/src/sqs/producer';

const CreateOrderSchema = z.object({
  merchant_order_no: z.string(),
  amount: z.number(),
  currency: z.string(),
  description: z.string().optional()
});

const repository = createInMemoryPaymentOrderRepository();

export async function handleRequest(request: Request, env: any = process.env) {
  try {
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
      return new Response(JSON.stringify({ status: 'OK' }), { status: 200 });
    }
    if (request.method !== 'POST') {
      return new Response('Not Found', { status: 404 });
    }
    const apiKey = request.headers.get('x-api-key');
    if (!apiKey || apiKey !== (env.TEST_MERCHANT_KEY || 'TEST_MERCHANT_KEY')) {
      return new Response(JSON.stringify({ error: 'INVALID_API_KEY' }), { status: 401 });
    }
    const body = await request.json();
    const parsed = CreateOrderSchema.parse(body);
    const orderId = uuidv4();
    const now = new Date().toISOString();

    const order = await repository.createOrReturn({
      id: orderId,
      merchant_id: 'MERCHANT001',
      merchant_order_no: parsed.merchant_order_no,
      amount: parsed.amount,
      currency: parsed.currency,
      status: 'PENDING',
      created_at: now,
      updated_at: now
    } as any);

    // Publish OrderCreated event
    const event = createOrderCreatedEvent({
      order_id: order.id,
      merchant_id: order.merchant_id,
      amount: order.amount,
      currency: order.currency,
      initial_status: 'PENDING'
    });
    if (env.SQS_QUEUE_URL) {
      await sendMessage(env.SQS_QUEUE_URL, event, env);
    }

    const status = order.status === 'PENDING' ? 201 : 200;
    return new Response(JSON.stringify({ order_id: order.id, status: order.status, created_at: order.created_at }), { status });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

export default { fetch: handleRequest };
