-- Organizations: add billing and ownership columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan text DEFAULT 'free';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'inactive';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug text;

-- Transactions: add soft delete and audit columns
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS gl_name text;
