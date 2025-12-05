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

export interface CreateDeadLetterInput {
  id?: string;
  order_id: string;
  merchant_id: string;
  webhook_url: string;
  payload: string;
  last_error_message: string;
  last_http_status?: number;
  retry_count: number;
}

export interface UpsertDeadLetterInput {
  order_id: string;
  merchant_id: string;
  webhook_url: string;
  payload: string;
  last_error_message: string;
  last_http_status?: number;
  additional_retry_count: number;
}

export interface DeadLetterRepository {
  /** T059: Create a new dead letter record */
  create(record: CreateDeadLetterInput): Promise<DeadLetterRecord>;

  /** T060: Upsert for idempotent dead letter updates */
  upsert(input: UpsertDeadLetterInput): Promise<DeadLetterRecord>;

  /** T062: Find dead letter record by order ID */
  findByOrderId(orderId: string): Promise<DeadLetterRecord | null>;

  /** T063: List recent dead letter records for manual review */
  listRecent(limit?: number): Promise<DeadLetterRecord[]>;
}

export function createPgDeadLetterRepository(client: DBClient): DeadLetterRepository {
  return {
    /**
     * T059: Create a new dead letter record
     */
    async create(record) {
      const now = new Date().toISOString();
      const id = record.id || `dl-${record.order_id}-${Date.now()}`;
      const sql = `
        INSERT INTO dead_letter_records
          (id, order_id, merchant_id, webhook_url, payload, last_error_message, last_http_status, retry_count, first_failed_at, last_failed_at, created_at, updated_at)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `;
      const params = [
        id,
        record.order_id,
        record.merchant_id,
        record.webhook_url,
        record.payload,
        record.last_error_message,
        record.last_http_status ?? null,
        record.retry_count,
        now,
        now,
        now,
        now
      ];
      const res = await client.query(sql, params);
      return res.rows[0];
    },

    /**
     * T060: Upsert for idempotent dead letter updates
     * If a record exists for the order_id, update it; otherwise create new
     */
    async upsert(input) {
      const now = new Date().toISOString();
      const id = `dl-${input.order_id}-${Date.now()}`;

      // Use INSERT ... ON CONFLICT for atomic upsert
      const sql = `
        INSERT INTO dead_letter_records
          (id, order_id, merchant_id, webhook_url, payload, last_error_message, last_http_status, retry_count, first_failed_at, last_failed_at, created_at, updated_at)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (order_id) DO UPDATE SET
          last_error_message = EXCLUDED.last_error_message,
          last_http_status = EXCLUDED.last_http_status,
          retry_count = dead_letter_records.retry_count + $8,
          last_failed_at = EXCLUDED.last_failed_at,
          updated_at = EXCLUDED.updated_at
        RETURNING *
      `;
      const params = [
        id,
        input.order_id,
        input.merchant_id,
        input.webhook_url,
        input.payload,
        input.last_error_message,
        input.last_http_status ?? null,
        input.additional_retry_count,
        now, // first_failed_at (only used on INSERT)
        now, // last_failed_at
        now, // created_at (only used on INSERT)
        now  // updated_at
      ];
      const res = await client.query(sql, params);
      return res.rows[0];
    },

    /**
     * T062: Find dead letter record by order ID
     */
    async findByOrderId(orderId) {
      const res = await client.query(
        'SELECT * FROM dead_letter_records WHERE order_id = $1 ORDER BY last_failed_at DESC LIMIT 1',
        [orderId]
      );
      return res.rows[0] ?? null;
    },

    /**
     * T063: List recent dead letter records for manual review
     */
    async listRecent(limit = 20) {
      const res = await client.query(
        'SELECT * FROM dead_letter_records ORDER BY last_failed_at DESC LIMIT $1',
        [limit]
      );
      return res.rows;
    }
  };
}
