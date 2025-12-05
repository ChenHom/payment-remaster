import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPgDeadLetterRepository } from '../../../shared/src/db/repositories/dead-letter';

/**
 * Unit tests for dead letter repository operations (T059-T063)
 */

// Mock DB Client
function createMockDBClient(mockRows: any[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows: mockRows })
  };
}

describe('DeadLetterRepository', () => {
  describe('T059: create', () => {
    it('creates a new dead letter record', async () => {
      const mockClient = createMockDBClient([{
        id: 'dl-order-123',
        order_id: 'order-123',
        merchant_id: 'MERCHANT001',
        webhook_url: 'https://example.com/webhook',
        payload: '{"order_id":"order-123"}',
        last_error_message: 'Webhook failed',
        last_http_status: 503,
        retry_count: 3,
        first_failed_at: '2025-12-05T10:00:00.000Z',
        last_failed_at: '2025-12-05T10:01:40.000Z',
        created_at: '2025-12-05T10:00:00.000Z',
        updated_at: '2025-12-05T10:00:00.000Z'
      }]);

      const repo = createPgDeadLetterRepository(mockClient as any);

      const result = await repo.create({
        order_id: 'order-123',
        merchant_id: 'MERCHANT001',
        webhook_url: 'https://example.com/webhook',
        payload: '{"order_id":"order-123"}',
        last_error_message: 'Webhook failed',
        last_http_status: 503,
        retry_count: 3
      });

      expect(result.order_id).toBe('order-123');
      expect(result.retry_count).toBe(3);
      expect(mockClient.query).toHaveBeenCalledTimes(1);
      expect(mockClient.query.mock.calls[0][0]).toContain('INSERT INTO dead_letter_records');
    });

    it('generates ID if not provided', async () => {
      const mockClient = createMockDBClient([{
        id: 'dl-order-456-1234567890',
        order_id: 'order-456'
      }]);

      const repo = createPgDeadLetterRepository(mockClient as any);

      await repo.create({
        order_id: 'order-456',
        merchant_id: 'MERCHANT001',
        webhook_url: 'https://example.com/webhook',
        payload: '{}',
        last_error_message: 'Error',
        retry_count: 1
      });

      // Should have generated an ID containing the order_id
      const callArgs = mockClient.query.mock.calls[0][1];
      expect(callArgs[0]).toContain('dl-order-456');
    });
  });

  describe('T060: upsert', () => {
    it('upserts dead letter record with ON CONFLICT', async () => {
      const mockClient = createMockDBClient([{
        id: 'dl-order-456',
        order_id: 'order-456',
        merchant_id: 'MERCHANT001',
        webhook_url: 'https://example.com/webhook',
        payload: '{"order_id":"order-456"}',
        last_error_message: 'Connection timeout',
        last_http_status: null,
        retry_count: 3,
        first_failed_at: '2025-12-05T10:00:00.000Z',
        last_failed_at: '2025-12-05T10:00:00.000Z',
        created_at: '2025-12-05T10:00:00.000Z',
        updated_at: '2025-12-05T10:00:00.000Z'
      }]);

      const repo = createPgDeadLetterRepository(mockClient as any);

      const result = await repo.upsert({
        order_id: 'order-456',
        merchant_id: 'MERCHANT001',
        webhook_url: 'https://example.com/webhook',
        payload: '{"order_id":"order-456"}',
        last_error_message: 'Connection timeout',
        additional_retry_count: 3
      });

      expect(result.order_id).toBe('order-456');
      expect(mockClient.query).toHaveBeenCalledTimes(1);
      expect(mockClient.query.mock.calls[0][0]).toContain('ON CONFLICT');
    });

    it('increments retry_count on conflict', async () => {
      const mockClient = createMockDBClient([{ retry_count: 6 }]);

      const repo = createPgDeadLetterRepository(mockClient as any);

      await repo.upsert({
        order_id: 'order-789',
        merchant_id: 'MERCHANT001',
        webhook_url: 'https://example.com/webhook',
        payload: '{}',
        last_error_message: 'Error',
        additional_retry_count: 3
      });

      const sql = mockClient.query.mock.calls[0][0];
      expect(sql).toContain('retry_count = dead_letter_records.retry_count +');
    });
  });

  describe('T062: findByOrderId', () => {
    it('finds dead letter record by order ID', async () => {
      const mockRecord = {
        id: 'dl-order-789',
        order_id: 'order-789',
        merchant_id: 'MERCHANT001',
        webhook_url: 'https://example.com/webhook',
        payload: '{"order_id":"order-789"}',
        last_error_message: 'Webhook failed',
        last_http_status: 500,
        retry_count: 3,
        first_failed_at: '2025-12-05T10:00:00.000Z',
        last_failed_at: '2025-12-05T10:01:40.000Z',
        created_at: '2025-12-05T10:00:00.000Z',
        updated_at: '2025-12-05T10:00:00.000Z'
      };

      const mockClient = createMockDBClient([mockRecord]);
      const repo = createPgDeadLetterRepository(mockClient as any);

      const result = await repo.findByOrderId('order-789');

      expect(result).toEqual(mockRecord);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE order_id'),
        ['order-789']
      );
    });

    it('returns null when no record found', async () => {
      const mockClient = createMockDBClient([]);
      const repo = createPgDeadLetterRepository(mockClient as any);

      const result = await repo.findByOrderId('nonexistent-order');

      expect(result).toBeNull();
    });
  });

  describe('T063: listRecent', () => {
    it('lists recent dead letter records', async () => {
      const mockRecords = [
        { id: 'dl-1', order_id: 'order-1', last_failed_at: '2025-12-05T10:01:00.000Z' },
        { id: 'dl-2', order_id: 'order-2', last_failed_at: '2025-12-05T10:00:00.000Z' }
      ];

      const mockClient = createMockDBClient(mockRecords);
      const repo = createPgDeadLetterRepository(mockClient as any);

      const result = await repo.listRecent(10);

      expect(result).toHaveLength(2);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY last_failed_at DESC'),
        [10]
      );
    });

    it('uses default limit of 20', async () => {
      const mockClient = createMockDBClient([]);
      const repo = createPgDeadLetterRepository(mockClient as any);

      await repo.listRecent();

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        [20]
      );
    });
  });
});
