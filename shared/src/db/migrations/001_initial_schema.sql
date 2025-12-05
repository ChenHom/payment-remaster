-- PostgreSQL migration for payment_remaster

CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  merchant_order_no TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  upstream_txn_id TEXT,
  failure_code TEXT,
  failure_reason TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
  UNIQUE (merchant_id, merchant_order_no)
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_status_created_at
  ON payment_orders (status, created_at);

CREATE INDEX IF NOT EXISTS idx_payment_orders_merchant_id
  ON payment_orders (merchant_id);

CREATE TABLE IF NOT EXISTS dead_letter_records (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  merchant_id TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  payload TEXT NOT NULL,
  last_error_message TEXT NOT NULL,
  last_http_status INTEGER,
  retry_count INTEGER NOT NULL,
  first_failed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_failed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_records_order_id
  ON dead_letter_records (order_id);

CREATE INDEX IF NOT EXISTS idx_dead_letter_records_merchant_id
  ON dead_letter_records (merchant_id);

CREATE TABLE IF NOT EXISTS event_dead_letters (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  trace_id TEXT,
  payload TEXT NOT NULL,
  error_message TEXT NOT NULL,
  failed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_dead_letters_event_type
  ON event_dead_letters (event_type);

CREATE INDEX IF NOT EXISTS idx_event_dead_letters_failed_at
  ON event_dead_letters (failed_at);
