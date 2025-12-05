import { describe, it, expect } from 'vitest';
import { isTransitionAllowed, OrderStatus } from '../../../shared/src/domain/payment-order';

describe('Order state transitions', () => {
  it('PENDING -> PROCESSING allowed', () => {
    expect(isTransitionAllowed(OrderStatus.PENDING, OrderStatus.PROCESSING)).toBe(true);
  });

  it('PROCESSING -> SUCCESS allowed', () => {
    expect(isTransitionAllowed(OrderStatus.PROCESSING, OrderStatus.SUCCESS)).toBe(true);
  });

  it('PROCESSING -> FAILED allowed', () => {
    expect(isTransitionAllowed(OrderStatus.PROCESSING, OrderStatus.FAILED)).toBe(true);
  });

  it('PENDING -> SUCCESS not allowed', () => {
    expect(isTransitionAllowed(OrderStatus.PENDING, OrderStatus.SUCCESS)).toBe(false);
  });

  it('SUCCESS -> any not allowed', () => {
    expect(isTransitionAllowed(OrderStatus.SUCCESS, OrderStatus.PROCESSING)).toBe(false);
    expect(isTransitionAllowed(OrderStatus.SUCCESS, OrderStatus.FAILED)).toBe(false);
  });
});
