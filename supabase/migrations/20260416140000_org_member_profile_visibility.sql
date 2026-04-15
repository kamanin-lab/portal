-- Migration: org-member profile visibility
-- Phase 14 fix: allow org members to read basic profile info of fellow org members
-- Problem: profiles RLS blocked joining profiles for other org_members rows,
--          causing email/full_name to return null for invited (pending) members.

-- =======================================================================
-- RLS: profiles — org members can read profiles of fellow org members
-- =======================================================================
-- Uses user_org_ids() (SECURITY DEFINER, stable, cached by Postgres initPlan)
-- to find all profiles that share at least one organization with the current user.
-- Only exposes rows — column-level filtering is not possible via RLS; the query
-- in useOrgMembers already selects only (id, email, full_name).

drop policy if exists "org members can read fellow member profiles" on public.profiles;
create policy "org members can read fellow member profiles"
  on public.profiles for select
  to authenticated
  using (
    id in (
      select om.profile_id
      from public.org_members om
      where om.organization_id in (select public.user_org_ids())
    )
  );
