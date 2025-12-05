import fetch from 'node-fetch';

export async function handleRequest(request: Request, env: any = process.env) {
  if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
    return new Response(JSON.stringify({ status: 'OK' }), { status: 200 });
  }
  if (request.method !== 'POST') return new Response('Not Found', { status: 404 });
  try {
    const body = await request.json();
    // Simulate delayed callback
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
