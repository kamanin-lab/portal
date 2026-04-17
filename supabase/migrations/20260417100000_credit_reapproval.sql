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
