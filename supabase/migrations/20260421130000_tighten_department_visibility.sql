-- Tighten department visibility: untagged tasks are no longer public for scoped members.
-- Member with non-empty departments now sees ONLY overlap + creator override.
-- Empty departments still means "see all" (legacy fallback, zero regression).
--
-- Real-world trigger: MBM assigned Marvin Pape to departments=[SEO], but he saw
-- all 113 tickets because none were tagged Fachbereich yet. Untagged-as-public
-- fallback defeated the scope. Rule now strict: scoped member must have overlap.
--
-- Also adds org_members to supabase_realtime publication so useOrg can subscribe
-- to own-row changes and invalidate the tasks query when admin re-scopes a member.

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
        OR p_task_departments && om.departments               -- array overlap
        OR p_task_creator_id = p_user_id::TEXT                -- creator override
      )
  );
$$;

COMMENT ON FUNCTION can_user_see_task IS 'Department-based visibility predicate. Admin sees all; member with empty departments sees all (legacy); member with non-empty departments sees only overlap or tasks they created. Untagged tasks are NOT public for scoped members (tightened 2026-04-21).';

-- Ensure org_members publication so Realtime can broadcast UPDATE events to the owning user.
-- Idempotent: ALTER PUBLICATION ADD TABLE errors if already there, so guard via DO block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'org_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE org_members;
  END IF;
END $$;
