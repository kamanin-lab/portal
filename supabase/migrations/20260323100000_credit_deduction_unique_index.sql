-- BLOCKING 3 fix: Prevent double credit deductions via unique partial index.
-- Only one task_deduction per task_id is allowed.
CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_task_deduction_unique
  ON credit_transactions (task_id, type) WHERE type = 'task_deduction';
