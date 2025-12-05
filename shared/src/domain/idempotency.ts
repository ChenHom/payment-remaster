export function idempotencyKeyForOrder(merchant_id: string, merchant_order_no: string) {
  return `${merchant_id}:${merchant_order_no}`;
}

export async function ensureIdempotency(lookupFn: (key: string) => Promise<any>, createFn: (key: string) => Promise<any>, key: string) {
  const existing = await lookupFn(key);
  if (existing) return existing;
  return createFn(key);
}
