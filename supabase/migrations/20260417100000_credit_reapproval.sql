-- Credit re-approval: track the last client-approved credit amount on the task
-- so the UI can show re-approval state ("von 5 auf 10 Credits angepasst")
-- while reading only from task_cache (CLAUDE.md Rule #1).

ALTER TABLE task_cache
  ADD COLUMN IF NOT EXISTS approved_credits numeric;

COMMENT ON COLUMN task_cache.approved_credits IS
  'Last credits amount the client approved via approve_credits action. NULL = never approved. Differs from task_cache.credits (current ClickUp estimate).';

-- Backfill: for existing approved tasks, copy the approved amount from
-- credit_transactions so the UI treats them as already-approved (prevents
-- "false re-approval" flag after deploy on historical tasks).
-- task_cache has one row per (clickup_id, profile_id); each gets the same
-- approved_credits value from the single task_deduction row for that task.
UPDATE task_cache tc
SET approved_credits = ct.credits_at_approval
FROM (
  SELECT task_id, -amount AS credits_at_approval
  FROM credit_transactions
  WHERE type = 'task_deduction'
) ct
WHERE tc.clickup_id = ct.task_id;

-- RPC for atomic UPSERT targeting the partial unique index
-- credit_transactions_task_deduction_unique ON (task_id, type) WHERE type = 'task_deduction'.
-- The Supabase JS SDK .upsert() cannot pass the WHERE clause required to
-- target a partial unique index as ON CONFLICT arbiter, so we use a
-- SECURITY DEFINER function callable only by service_role.
CREATE OR REPLACE FUNCTION upsert_task_deduction(
  p_profile_id uuid,
  p_organization_id uuid,
  p_amount numeric,
  p_task_id text,
  p_task_name text,
  p_description text
) RETURNS credit_transactions AS $$
  INSERT INTO credit_transactions (profile_id, organization_id, amount, type, task_id, task_name, description)
  VALUES (p_profile_id, p_organization_id, p_amount, 'task_deduction', p_task_id, p_task_name, p_description)
  ON CONFLICT (task_id, type) WHERE (type = 'task_deduction')
  DO UPDATE SET
    amount = EXCLUDED.amount,
    description = EXCLUDED.description,
    task_name = EXCLUDED.task_name,
    organization_id = EXCLUDED.organization_id
  RETURNING *;
$$ LANGUAGE SQL SECURITY DEFINER;

REVOKE ALL ON FUNCTION upsert_task_deduction FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_task_deduction TO service_role;

COMMENT ON FUNCTION upsert_task_deduction IS
  'Atomic UPSERT for task credit deductions. Uses partial unique index credit_transactions_task_deduction_unique as ON CONFLICT arbiter. Called by update-task-status edge function on approve_credits / re-approval. service_role only.';
