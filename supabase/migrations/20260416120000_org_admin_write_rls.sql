-- Phase 12 — org-admin-page
-- Admin RLS write policies for org_members: admin-read-all, admin-update, admin-delete
-- Enables direct Supabase client CRUD on org_members for admin users.
-- Relies on public.user_org_role(p_org_id uuid) from Phase 9 (20260414200000_org_foundation.sql)

-- =======================================================================
-- RLS: org_members — admins can SELECT all rows in their organization
-- =======================================================================
drop policy if exists "admins can read all org members" on public.org_members;
create policy "admins can read all org members"
  on public.org_members for select
  to authenticated
  using (
    public.user_org_role(organization_id) = 'admin'
  );

-- =======================================================================
-- RLS: org_members — admins can UPDATE role on rows in their organization
-- =======================================================================
drop policy if exists "admins can update org members" on public.org_members;
create policy "admins can update org members"
  on public.org_members for update
  to authenticated
  using (
    public.user_org_role(organization_id) = 'admin'
  )
  with check (
    public.user_org_role(organization_id) = 'admin'
  );

-- =======================================================================
-- RLS: org_members — admins can DELETE rows in their organization
-- =======================================================================
drop policy if exists "admins can delete org members" on public.org_members;
create policy "admins can delete org members"
  on public.org_members for delete
  to authenticated
  using (
    public.user_org_role(organization_id) = 'admin'
  );
