import fetch from 'node-fetch';

const SERVICE_NAME = 'mock-provider';

/**
 * T071: Health check endpoint
 */
async function handleHealthCheck(): Promise<Response> {
  const startTime = Date.now();
  const checks: Record<string, { status: string }> = {};

  // Worker status (always ok if we reach here)
  checks.worker = { status: 'ok' };

  const responseTime = Date.now() - startTime;

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
    status: 'ok',
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    response_time_ms: responseTime,
    checks
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleRequest(request: Request, env: any = process.env) {
  const url = new URL(request.url);

  // T071: Health check endpoint
  if (request.method === 'GET' && url.pathname === '/health') {
    return handleHealthCheck();
  }

  if (request.method !== 'POST') return new Response('Not Found', { status: 404 });

  try {
    const body = await request.json();
    // Simulate delayed callback (3-10 seconds)
    const delay = Math.floor(Math.random() * 7) + 3;
    setTimeout(async () => {
      try {
        if (env.MOCK_CALLBACK_TOKEN && env.MOCK_PROVIDER_URL) {
          await fetch(env.MOCK_PROVIDER_URL + '/api/payment/callback/mock-provider', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Callback-Token': env.MOCK_CALLBACK_TOKEN },
            body: JSON.stringify({
              order_id: body.order_id,
              result: body.amount % 2 === 0 ? 'SUCCESS' : 'FAILED',
              upstream_txn_id: 'up-' + body.order_id
            })
          });
        }
      } catch (err) {
        // ignore
      }
    }, delay * 1000);
    return new Response(JSON.stringify({ status: 'ACCEPTED' }), { status: 202 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

export default { fetch: handleRequest };
