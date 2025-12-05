import { PaymentOrder, PaymentOrderRepository } from '../payment-order';

const orders: Record<string, PaymentOrder> = {};

export function createInMemoryPaymentOrderRepository(): PaymentOrderRepository {
  return {
    async createOrReturn(order) {
      const key = `${order.merchant_id}:${order.merchant_order_no}`;
      const existing = Object.values(orders).find(o => o.merchant_id === order.merchant_id && o.merchant_order_no === order.merchant_order_no);
      if (existing) return existing;
      const now = new Date().toISOString();
      const po: PaymentOrder = {
        id: order.id as string,
        merchant_id: order.merchant_id as string,
        merchant_order_no: order.merchant_order_no as string,
        amount: order.amount as any,
        currency: order.currency as any,
        status: order.status as any,
        created_at: now,
        updated_at: now
      } as PaymentOrder;
      orders[po.id] = po;
      return po;
    },
    async updateStatusIfMatch(orderId, from, to, extra) {
      const found = orders[orderId];
      if (!found) return null;
      if (found.status !== from) return null;
      found.status = to;
      if (extra?.upstream_txn_id) found.upstream_txn_id = extra.upstream_txn_id;
      if (extra?.failure_code) found.failure_code = extra.failure_code;
      if (extra?.failure_reason) found.failure_reason = extra.failure_reason;
      found.updated_at = new Date().toISOString();
      return found;
    },
    async findById(orderId) {
      return orders[orderId] ?? null;
    }
  };
}
