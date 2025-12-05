import fetch from 'node-fetch';

export async function handler(event: any, context: any) {
  const workerEndpoint = process.env.WEBHOOK_NOTIFIER_URL;
  for (const record of event.Records || []) {
    const body = JSON.parse(record.body);
    try {
      await fetch(workerEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) {
      // log
    }
  }
  return { statusCode: 200 };
}

export default { handler };
