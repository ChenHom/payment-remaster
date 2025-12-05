import { describe, it, expect } from 'vitest';
import { createInMemoryPaymentOrderRepository } from '../../../shared/src/db/repositories/inmemory/payment-order';
import { v4 as uuidv4 } from 'uuid';

describe('InMemory PaymentOrderRepository', () => {
  it('creates order and finds by id', async () => {
    const repo = createInMemoryPaymentOrderRepository();
    const id = uuidv4();
    const order = await repo.createOrReturn({ id, merchant_id: 'MERCHANT001', merchant_order_no: 'MO-1', amount: 100, currency: 'TWD', status: 'PENDING', created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any);
    expect(order.id).toBe(id);
    const found = await repo.findById(id);
    expect(found?.merchant_id).toBe('MERCHANT001');
  });
});
