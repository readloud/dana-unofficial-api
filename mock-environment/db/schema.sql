-- Postgres-compatible schema
CREATE TABLE transfers (
  id SERIAL PRIMARY KEY,
  transfer_id VARCHAR(255) UNIQUE,
  idempotency_key VARCHAR(255),
  from_phone VARCHAR(50),
  to_phone VARCHAR(50),
  amount BIGINT,
  fee BIGINT DEFAULT 0,
  status VARCHAR(32),
  meta JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE mutations (
  id SERIAL PRIMARY KEY,
  tx_id VARCHAR(255) UNIQUE,
  date TIMESTAMP WITH TIME ZONE,
  type VARCHAR(50),
  amount BIGINT,
  balance BIGINT,
  description TEXT,
  counterparty VARCHAR(255),
  raw JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE refunds (
  id SERIAL PRIMARY KEY,
  refund_id VARCHAR(255) UNIQUE,
  original_transfer_id VARCHAR(255),
  amount BIGINT,
  status VARCHAR(32),
  meta JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE batch_payouts (
  id SERIAL PRIMARY KEY,
  batch_id VARCHAR(255) UNIQUE,
  items JSONB,
  total_amount BIGINT,
  status VARCHAR(32),
  meta JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
