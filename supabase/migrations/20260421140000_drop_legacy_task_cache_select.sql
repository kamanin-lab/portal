-- Drop legacy RLS policy `task_cache_select` that lingered from pre-departments era.
-- Original migration 20260421100000 dropped `task_cache_select_own` but the actual
-- policy on prod was named `task_cache_select` (no _own suffix).
-- Because multiple PERMISSIVE SELECT policies are OR-combined, the legacy policy
-- (profile_id = auth.uid()) kept granting access and bypassed the department filter.
--
-- After this, only `task_cache_select_visible` remains for SELECT, which includes
-- the can_user_see_task() department check.

DROP POLICY IF EXISTS "task_cache_select" ON task_cache;
DROP POLICY IF EXISTS "task_cache_select_own" ON task_cache;

-- Leave task_cache_insert / _update / _delete untouched (they cover WRITES, not reads).
