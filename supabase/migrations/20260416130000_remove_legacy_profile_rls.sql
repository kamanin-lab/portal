-- =============================================================================
-- Phase 13: Remove legacy profile_id-based RLS policies and columns
-- =============================================================================
-- Milestone: v2.0 Organisation
-- Phase: 13-org-onboarding-cleanup
--
-- What this migration does:
--   1. Drops legacy profile_id = auth.uid() RLS policies from credit_packages
--      and client_workspaces (org-scoped policies added in Phase 9 replace them)
--   2. Drops profile_id FK columns from credit_packages and client_workspaces
--      (organization_id NOT NULL is the new access axis)
--   3. Drops org-config columns from profiles that were moved to organizations in Phase 9
--
-- Prerequisites (must be true before this migration runs):
--   - Plans 13-01 (frontend) and 13-02 (Edge Functions) deployed to this environment
--   - All users have org_members rows (verified by Phase 9 migration gate)
--
-- Safety: All DROP statements use IF EXISTS — migration is idempotent.
-- credit_transactions.profile_id is intentionally NOT dropped (audit trail).
-- =============================================================================


-- =============================================================================
-- Section 1: Assert org policies exist before dropping profile_id policies
-- =============================================================================
-- Abort if the replacement org policies are missing — this prevents accidentally
-- leaving tables without any RLS policy.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credit_packages'
      AND (policyname ILIKE '%org%' OR policyname ILIKE '%organisation%' OR policyname ILIKE '%organization%')
  ) THEN
    RAISE EXCEPTION 'Org policy missing from credit_packages — aborting migration. Ensure Phase 9 migration has been applied.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_workspaces'
      AND (policyname ILIKE '%org%' OR policyname ILIKE '%organisation%' OR policyname ILIKE '%organization%')
  ) THEN
    RAISE EXCEPTION 'Org policy missing from client_workspaces — aborting migration. Ensure Phase 9 migration has been applied.';
  END IF;
END $$;


-- =============================================================================
-- Section 2: Drop legacy profile_id-based RLS policies
-- =============================================================================
-- These policies were created in 20260323000000_credit_system.sql.
-- The org-scoped replacement policies (added in Phase 9) already cover all rows.
-- Using IF EXISTS on all known name variants — exact name depends on environment.

-- credit_packages
DROP POLICY IF EXISTS "Users see own packages" ON public.credit_packages;
DROP POLICY IF EXISTS "credit_packages_profile_id_policy" ON public.credit_packages;
DROP POLICY IF EXISTS "Users can view own credit_packages" ON public.credit_packages;
DROP POLICY IF EXISTS "credit_packages_select_own" ON public.credit_packages;

-- client_workspaces
DROP POLICY IF EXISTS "Users see own workspaces" ON public.client_workspaces;
DROP POLICY IF EXISTS "client_workspaces_profile_id_policy" ON public.client_workspaces;
DROP POLICY IF EXISTS "Users can view own workspaces" ON public.client_workspaces;
DROP POLICY IF EXISTS "client_workspaces_select_own" ON public.client_workspaces;
DROP POLICY IF EXISTS "Users see their workspaces" ON public.client_workspaces;


-- =============================================================================
-- Section 3: Drop profile_id FK columns from credit_packages and client_workspaces
-- =============================================================================
-- CASCADE drops the FK constraint automatically (no data loss — FK pointed TO profiles).
-- credit_transactions.profile_id is NOT included here — retained for audit trail.

ALTER TABLE public.credit_packages
  DROP COLUMN IF EXISTS profile_id CASCADE;

ALTER TABLE public.client_workspaces
  DROP COLUMN IF EXISTS profile_id CASCADE;


-- =============================================================================
-- Section 4: Drop org-config columns from profiles
-- =============================================================================
-- These columns were migrated to organizations in Phase 9 (ORG-DB-06 data migration).
-- All Edge Function fallback reads were removed in Plan 13-02.
-- All frontend reads were removed in Plan 13-01.
--
-- Drop any triggers that reference these columns before dropping the columns.

DROP TRIGGER IF EXISTS on_profile_list_change ON public.profiles;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS clickup_list_ids;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS nextcloud_client_root;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS support_task_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS clickup_chat_channel_id;


-- =============================================================================
-- Section 5: Verification gate
-- =============================================================================
-- Fail the migration if any profile_id = auth.uid() policies still remain on
-- the target tables (would indicate an unknown policy name variant was missed).

DO $$
DECLARE
  policy_count integer;
BEGIN
  SELECT count(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('credit_packages', 'client_workspaces')
    AND (qual ILIKE '%profile_id%' OR with_check ILIKE '%profile_id%');

  IF policy_count > 0 THEN
    RAISE EXCEPTION 'Verification failed: % profile_id-based policies still active on credit_packages or client_workspaces. Check pg_policies for remaining policy names.', policy_count;
  END IF;
END $$;
