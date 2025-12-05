import { DBClient } from '../client';
import { OrderStatus } from '../../domain/payment-order';

export type PaymentOrder = {
  id: string;
  merchant_id: string;
  merchant_order_no: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  upstream_txn_id?: string;
  failure_code?: string;
  failure_reason?: string;
  description?: string;
  created_at: string;
  updated_at: string;
};

export interface PaymentOrderRepository {
  createOrReturn(order: Partial<PaymentOrder>): Promise<PaymentOrder>;
  updateStatusIfMatch(orderId: string, from: OrderStatus, to: OrderStatus, extra?: Partial<PaymentOrder>): Promise<PaymentOrder | null>;
  findById(orderId: string): Promise<PaymentOrder | null>;
}

export function createPgPaymentOrderRepository(client: DBClient): PaymentOrderRepository {
  return {
    async createOrReturn(order) {
      const now = new Date().toISOString();
      const sql = `INSERT INTO payment_orders (id, merchant_id, merchant_order_no, amount, currency, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (merchant_id, merchant_order_no) DO UPDATE SET updated_at=EXCLUDED.updated_at RETURNING *`;
      const params = [order.id, order.merchant_id, order.merchant_order_no, order.amount, order.currency, order.status ?? 'PENDING', now, now];
      const res = await client.query(sql, params);
      return res.rows[0];
    },
    async updateStatusIfMatch(orderId, from, to, extra = {}) {
      const now = new Date().toISOString();
      const setClause = [] as string[];
      const params = [] as any[];
      let idx = 1;
      setClause.push(`status = $${idx++}`);
      params.push(to);
      setClause.push(`updated_at = $${idx++}`);
      params.push(now);
      if (extra.upstream_txn_id) {
        setClause.push(`upstream_txn_id = $${idx++}`);
        params.push(extra.upstream_txn_id);
      }
      if (extra.failure_code) {
        setClause.push(`failure_code = $${idx++}`);
        params.push(extra.failure_code);
      }
      if (extra.failure_reason) {
        setClause.push(`failure_reason = $${idx++}`);
        params.push(extra.failure_reason);
      }
      params.push(orderId);
      params.push(from);
      const sql = `UPDATE payment_orders SET ${setClause.join(', ')} WHERE id = $${idx++} AND status = $${idx} RETURNING *`;
      const res = await client.query(sql, params);
      return res.rows[0] ?? null;
    },
    async findById(orderId) {
      const res = await client.query('SELECT * FROM payment_orders WHERE id=$1', [orderId]);
      return res.rows[0] ?? null;
    }
  };
}
