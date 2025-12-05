import { computeSignature } from '../../../shared/src/http/signature';
import { describe, it, expect } from 'vitest';

describe('Signature', () => {
  it('computes sha256 HMAC signature', () => {
    const secret = 's3cr3t';
    const payload = 'abc';
    const sig = computeSignature(secret, payload);
    expect(typeof sig).toBe('string');
    expect(sig.length).toBeGreaterThan(0);
  });
});
