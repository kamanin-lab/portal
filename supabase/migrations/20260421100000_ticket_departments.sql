-- Migration: Department-based ticket visibility (Fachbereich)
-- Adds department columns to organizations, org_members, and task_cache.
-- Creates visibility predicate function, RLS policy, and convenience view.

-- 1. New columns
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS clickup_department_field_id TEXT,
  ADD COLUMN IF NOT EXISTS departments_cache JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN organizations.clickup_department_field_id IS 'ClickUp custom field ID for "Fachbereich" (labels type). Auto-detected by fetch-clickup-tasks.';
COMMENT ON COLUMN organizations.departments_cache IS 'Cached options array from ClickUp labels field: [{id, name, color}]. Refreshed on each sync.';

ALTER TABLE org_members
  ADD COLUMN IF NOT EXISTS departments TEXT[] DEFAULT '{}';

COMMENT ON COLUMN org_members.departments IS 'Array of ClickUp department option UUIDs assigned to this member. Empty = sees all tickets (legacy fallback).';

ALTER TABLE task_cache
  ADD COLUMN IF NOT EXISTS departments TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_task_cache_departments ON task_cache USING GIN (departments);

COMMENT ON COLUMN task_cache.departments IS 'Array of ClickUp department option UUIDs from Fachbereich labels field. Empty = visible to all (untagged).';

-- 2. Visibility predicate function
-- Single source of truth: used by RLS policy AND server-side fan-out helper.
-- Note: p_task_creator_id is TEXT because task_cache.created_by_user_id is TEXT,
-- not UUID (legacy column type). Compared to p_user_id cast to TEXT.
CREATE OR REPLACE FUNCTION can_user_see_task(
  p_user_id UUID,
  p_task_departments TEXT[],
  p_task_creator_id TEXT
) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members om
    WHERE om.profile_id = p_user_id
      AND (
        om.role = 'admin'
        OR COALESCE(array_length(om.departments, 1), 0) = 0   -- legacy fallback: no depts = see all
        OR COALESCE(array_length(p_task_departments, 1), 0) = 0  -- untagged task = public
        OR p_task_departments && om.departments               -- array overlap
        OR p_task_creator_id = p_user_id::TEXT                -- creator override
      )
  );
$$;

COMMENT ON FUNCTION can_user_see_task IS 'Department-based visibility predicate. Returns true if the user should see a task based on department overlap, admin role, legacy fallback, untagged status, or creator override.';

-- 3. Fan-out helper: returns visible member profile_ids for a given org+task
CREATE OR REPLACE FUNCTION get_visible_member_profile_ids(
  p_org_id UUID,
  p_task_departments TEXT[],
  p_task_creator_id TEXT
) RETURNS TABLE(profile_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT om.profile_id FROM org_members om
  WHERE om.organization_id = p_org_id
    AND om.role != 'viewer'
    AND can_user_see_task(om.profile_id, p_task_departments, p_task_creator_id);
$$;

COMMENT ON FUNCTION get_visible_member_profile_ids IS 'Returns non-viewer org member profile_ids who can see a task with given departments. Used for email/bell fan-out.';

-- 4. Update RLS policy on task_cache
-- Drop old policy (may not exist — IF EXISTS handles that)
DROP POLICY IF EXISTS "task_cache_select_own" ON task_cache;
DROP POLICY IF EXISTS "task_cache_select_visible" ON task_cache;

-- New policy: enforces department visibility at row level
CREATE POLICY "task_cache_select_visible" ON task_cache
  FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    AND is_visible = true
    AND can_user_see_task(auth.uid(), departments, created_by_user_id)
  );

-- 5. Convenience view
-- security_invoker=true ensures the view runs under caller's RLS context.
-- Requires PG 15+. The DO block checks version and creates accordingly.
DO $$
DECLARE
  pg_major integer;
BEGIN
  SELECT (regexp_matches(version(), 'PostgreSQL (\d+)'))[1]::integer INTO pg_major;

  IF pg_major >= 15 THEN
    EXECUTE 'CREATE OR REPLACE VIEW visible_task_cache WITH (security_invoker = true) AS SELECT * FROM task_cache';
  ELSE
    -- PG < 15: create view without security_invoker.
    -- Security boundary is the RLS policy on task_cache, not the view.
    EXECUTE 'CREATE OR REPLACE VIEW visible_task_cache AS SELECT * FROM task_cache';
    RAISE NOTICE 'PG version % < 15: visible_task_cache created without security_invoker. RLS on task_cache still enforces visibility.', pg_major;
  END IF;
END $$;

GRANT SELECT ON visible_task_cache TO authenticated;
