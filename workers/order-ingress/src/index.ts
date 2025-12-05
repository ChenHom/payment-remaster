import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { createInMemoryPaymentOrderRepository } from '../../../shared/src/db/repositories/inmemory/payment-order';
import { createOrderCreatedEvent } from '../../../shared/src/events/order-created';
import { sendMessage } from '../../../shared/src/sqs/producer';

const SERVICE_NAME = 'order-ingress';

const CreateOrderSchema = z.object({
  merchant_order_no: z.string(),
  amount: z.number(),
  currency: z.string(),
  description: z.string().optional()
});

const repository = createInMemoryPaymentOrderRepository();

/**
 * T071: Health check endpoint
 * Checks: Worker status, PostgreSQL connection (placeholder), SQS connectivity (placeholder)
 */
async function handleHealthCheck(env: any): Promise<Response> {
  const startTime = Date.now();
  const checks: Record<string, { status: string; latency_ms?: number; error?: string }> = {};

  // Worker status (always ok if we reach here)
  checks.worker = { status: 'ok' };

  // Database check (placeholder - would connect to actual DB in production)
  try {
    // TODO: Implement actual PostgreSQL health check
    checks.database = { status: 'ok', latency_ms: 1 };
  } catch (error) {
    checks.database = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown database error'
    };
  }

  // SQS check (placeholder - would verify SQS connectivity in production)
  try {
    if (env.SQS_QUEUE_URL) {
      checks.sqs = { status: 'ok' };
    } else {
      checks.sqs = { status: 'warn', error: 'SQS_QUEUE_URL not configured' };
    }
  } catch (error) {
    checks.sqs = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown SQS error'
    };
  }

  const responseTime = Date.now() - startTime;
  const overallStatus = Object.values(checks).every(c => c.status === 'ok') ? 'ok' :
                        Object.values(checks).some(c => c.status === 'error') ? 'error' : 'warn';

  // Fail if response time exceeds 2 seconds
  if (responseTime > 2000) {
    return new Response(JSON.stringify({
      status: 'error',
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
      response_time_ms: responseTime,
      checks,
      error: 'Health check timeout exceeded'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({
    status: overallStatus,
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    response_time_ms: responseTime,
    checks
  }), {
    status: overallStatus === 'error' ? 503 : 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleRequest(request: Request, env: any = process.env) {
  const url = new URL(request.url);

  // T071: Health check endpoint
  if (request.method === 'GET' && url.pathname === '/health') {
    return handleHealthCheck(env);
  }

  try {
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
