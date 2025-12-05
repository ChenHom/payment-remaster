import { createInMemoryPaymentOrderRepository } from '../../../shared/src/db/repositories/inmemory/payment-order';
import { createOrderStatusChangedEvent } from '../../../shared/src/events/order-status-changed';
import { sendMessage } from '../../../shared/src/sqs/producer';

const SERVICE_NAME = 'upstream-callback';

/**
 * T071: Health check endpoint
 * Checks: Worker status, PostgreSQL connection (placeholder), SQS connectivity (placeholder)
 */
async function handleHealthCheck(env: any): Promise<Response> {
  const startTime = Date.now();
  const checks: Record<string, { status: string; latency_ms?: number; error?: string }> = {};

  // Worker status (always ok if we reach here)
  checks.worker = { status: 'ok' };

  // Database check (placeholder)
  try {
    checks.database = { status: 'ok', latency_ms: 1 };
  } catch (error) {
    checks.database = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown database error'
    };
  }

  // SQS check (placeholder)
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
