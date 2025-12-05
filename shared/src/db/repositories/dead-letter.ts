import { DBClient } from '../client';

export type DeadLetterRecord = {
  id: string;
  order_id: string;
  merchant_id: string;
  webhook_url: string;
  payload: string;
  last_error_message: string;
  last_http_status?: number;
  retry_count: number;
  first_failed_at: string;
  last_failed_at: string;
  created_at: string;
  updated_at: string;
};

export interface DeadLetterRepository {
  create(record: Partial<DeadLetterRecord>): Promise<DeadLetterRecord>;
  findByOrderId(orderId: string): Promise<DeadLetterRecord | null>;
  listRecent(limit?: number): Promise<DeadLetterRecord[]>;
}

export function createPgDeadLetterRepository(client: DBClient): DeadLetterRepository {
  return {
    async create(record) {
      const now = new Date().toISOString();
      const sql = `INSERT INTO dead_letter_records (id, order_id, merchant_id, webhook_url, payload, last_error_message, last_http_status, retry_count, first_failed_at, last_failed_at, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`;
      const params = [
        record.id,
        record.order_id,
        record.merchant_id,
        record.webhook_url,
        record.payload,
        record.last_error_message,
        record.last_http_status || null,
        record.retry_count || 0,
        record.first_failed_at || now,
        record.last_failed_at || now,
        now,
        now
      ];
      const res = await client.query(sql, params);
      return res.rows[0];
    },
    async findByOrderId(orderId) {
      const res = await client.query('SELECT * FROM dead_letter_records WHERE order_id=$1 ORDER BY last_failed_at DESC LIMIT 1', [orderId]);
      return res.rows[0] ?? null;
    },
    async listRecent(limit = 20) {
      const res = await client.query('SELECT * FROM dead_letter_records ORDER BY last_failed_at DESC LIMIT $1', [limit]);
      return res.rows;
    }
  };
}
