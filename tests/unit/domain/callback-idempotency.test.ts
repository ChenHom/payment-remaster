import { describe, it, expect } from 'vitest';
import { createInMemoryPaymentOrderRepository } from '../../../shared/src/db/repositories/inmemory/payment-order';
import { v4 as uuidv4 } from 'uuid';

describe('Callback idempotency', () => {
  it('does not change terminal state', async () => {
    const repo = createInMemoryPaymentOrderRepository();
    const id = uuidv4();
    await repo.createOrReturn({ id, merchant_id: 'MERCHANT001', merchant_order_no: 'MO-222', amount: 50, currency: 'TWD', status: 'PROCESSING', created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any);
    // first, update to SUCCESS
    const updated = await repo.updateStatusIfMatch(id, 'PROCESSING' as any, 'SUCCESS' as any);
    expect(updated?.status).toBe('SUCCESS');
    // now, attempt to update from PROCESSING to FAILED - should not be permitted because current is SUCCESS
    const updated2 = await repo.updateStatusIfMatch(id, 'PROCESSING' as any, 'FAILED' as any);
    expect(updated2).toBeNull();
  });
});
