-- Agregar campos de garantía y crédito a accounts y cards
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS guarantee_balance_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS credit_limit_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS credit_used_cents INTEGER NOT NULL DEFAULT 0;
