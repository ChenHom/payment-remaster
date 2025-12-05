import { describe, it, expect } from 'vitest';
import { createPgDeadLetterRepository } from '../../../shared/src/db/repositories/dead-letter';

// use stubbed client
const stubClient: any = { query: async (sql: string, params: any[]) => ({ rows: [{ id: params[0] }] }) };

describe('Dead letter repo', () => {
  it('creates dead letter record', async () => {
    const repo = createPgDeadLetterRepository(stubClient);
    const rec = await repo.create({ id: 'dl-1', order_id: 'o1', merchant_id: 'MERCHANT001', webhook_url: 'http://', payload: '{}', last_error_message: 'err', retry_count: 3, first_failed_at: new Date().toISOString(), last_failed_at: new Date().toISOString() } as any);
    expect(rec.id).toBe('dl-1');
  });
});
