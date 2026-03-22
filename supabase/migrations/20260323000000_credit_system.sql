-- Credit System Phase 1 (applied 2026-03-23)
-- Documents schema already applied to the live database.

-- Add credits column to task_cache
ALTER TABLE task_cache ADD COLUMN IF NOT EXISTS credits numeric;

-- Credit packages: defines monthly credit allocations per client
CREATE TABLE IF NOT EXISTS credit_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  package_name text NOT NULL,
  credits_per_month numeric NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  started_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Credit transactions: ledger of all credit movements (top-ups, deductions, adjustments)
CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  type text NOT NULL,
  task_id text,
  task_name text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: users can only see their own packages
ALTER TABLE credit_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own packages" ON credit_packages
  FOR SELECT USING (profile_id = auth.uid());

-- RLS: users can only see their own transactions
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own transactions" ON credit_transactions
  FOR SELECT USING (profile_id = auth.uid());

-- Enable Realtime for credit_transactions so balance updates instantly
ALTER PUBLICATION supabase_realtime ADD TABLE credit_transactions;
ALTER TABLE credit_transactions REPLICA IDENTITY FULL;
