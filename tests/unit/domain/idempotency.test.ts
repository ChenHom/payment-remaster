import { describe, it, expect } from 'vitest';
import { idempotencyKeyForOrder, ensureIdempotency } from '../../shared/src/domain/idempotency';

describe('Idempotency utils', () => {
  it('generates key', () => {
    expect(idempotencyKeyForOrder('m1', 'order1')).toBe('m1:order1');
  });

  it('ensure idempotency returns existing', async () => {
    const k = 'm1:order1';
    const lookup = async () => ({ id: 'x' });
    const create = async () => ({ id: 'y' });
    const res = await ensureIdempotency(lookup, create, k);
    expect((res as any).id).toBe('x');
  });
});
