-- Migration: organisation schema foundation
-- Phase 9: org-db-foundation
-- Applied to: Cloud Supabase staging (ahlthosftngdcryltapu)
-- DO NOT add explicit BEGIN/COMMIT — Supabase CLI wraps in its own transaction.

-- ==================================================
-- SECTION 1: NEW TABLES
-- ==================================================

create table if not exists public.organizations (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  slug                     text not null unique,
  clickup_list_ids         jsonb not null default '[]'::jsonb,
  nextcloud_client_root    text,
  support_task_id          text,
  clickup_chat_channel_id  text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table public.organizations enable row level security;

-- Reuse existing set_updated_at() — installed in Phase 6 migration (20260406000000_create_agent_jobs.sql)
-- Do NOT redefine it.
create trigger organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create table if not exists public.org_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  role             text not null check (role in ('admin', 'member', 'viewer')),
  created_at       timestamptz not null default now(),
  unique (organization_id, profile_id)
);

alter table public.org_members enable row level security;

-- Note: Phase 9 defines no client-facing read policies on organizations or org_members.
-- Edge Functions that read these tables in Phase 10 will use the service role key.

-- ==================================================
-- SECTION 2: SQL HELPER FUNCTIONS
-- ==================================================

-- user_org_ids(): returns all organization_id values for the authenticated user.
-- Returns empty set (not exception) when auth.uid() is NULL.
-- SECURITY DEFINER + SET search_path = '' hardens against search_path injection.
-- Called via (SELECT public.user_org_ids()) in RLS to trigger Postgres initPlan caching.
create or replace function public.user_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select om.organization_id
  from public.org_members om
  where om.profile_id = auth.uid()
    and auth.uid() is not null;
$$;

revoke execute on function public.user_org_ids() from public;
grant execute on function public.user_org_ids() to authenticated, anon, service_role;

-- user_org_role(org_id): returns the role text for the current user in the given org,
-- or NULL if not a member.
create or replace function public.user_org_role(org_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select om.role
  from public.org_members om
  where om.organization_id = org_id
    and om.profile_id = auth.uid()
  limit 1;
$$;

revoke execute on function public.user_org_role(uuid) from public;
grant execute on function public.user_org_role(uuid) to authenticated, anon, service_role;

-- ==================================================
-- SECTION 3: FK COLUMNS (nullable — added before data migration)
-- ==================================================

alter table public.credit_packages     add column if not exists organization_id uuid references public.organizations(id);
alter table public.client_workspaces   add column if not exists organization_id uuid references public.organizations(id);
alter table public.profiles            add column if not exists organization_id uuid references public.organizations(id);
alter table public.credit_transactions add column if not exists organization_id uuid references public.organizations(id);

-- ==================================================
-- SECTION 4: DATA MIGRATION
-- ==================================================
-- For each profile:
--   1. Derive org slug from email domain (strip TLD)
--   2. Insert one organizations row (copy clickup_list_ids etc. from profile)
--   3. Insert one org_members row with role = 'admin'
--   4. Back-fill organization_id on profiles, credit_packages, client_workspaces, credit_transactions

do $$
declare
  p                record;
  new_org_id       uuid;
  org_slug         text;
begin
  for p in
    select id,
           email,
           company_name,
           clickup_list_ids,
           nextcloud_client_root,
           support_task_id,
           clickup_chat_channel_id
    from public.profiles
  loop

    -- Derive slug: email domain minus TLD
    -- e.g. nadin@mbm-moebel.de  → split '@' → 'mbm-moebel.de'
    --                            → regexp_replace strip last '.xxx' → 'mbm-moebel'
    org_slug := lower(regexp_replace(split_part(p.email, '@', 2), '\.[^.]+$', ''));

    -- Create organisation row
    insert into public.organizations (
      name,
      slug,
      clickup_list_ids,
      nextcloud_client_root,
      support_task_id,
      clickup_chat_channel_id
    )
    values (
      coalesce(p.company_name, split_part(p.email, '@', 1)),
      org_slug,
      coalesce(p.clickup_list_ids, '[]'::jsonb),
      p.nextcloud_client_root,
      p.support_task_id,
      p.clickup_chat_channel_id
    )
    returning id into new_org_id;

    -- Link profile as org admin
    insert into public.org_members (organization_id, profile_id, role)
    values (new_org_id, p.id, 'admin');

    -- Back-fill FK on profiles
    update public.profiles
    set organization_id = new_org_id
    where id = p.id;

    -- Back-fill FK on credit_packages
    update public.credit_packages
    set organization_id = new_org_id
    where profile_id = p.id;

    -- Back-fill FK on client_workspaces
    update public.client_workspaces
    set organization_id = new_org_id
    where profile_id = p.id;

    -- Back-fill FK on credit_transactions
    update public.credit_transactions
    set organization_id = new_org_id
    where profile_id = p.id;

  end loop;
end;
$$;

-- ==================================================
-- SECTION 5: NOT NULL CONSTRAINTS
-- ==================================================
-- Safe to apply now — all rows have been back-filled by section 4.
-- profiles.organization_id stays nullable (backward safety per CONTEXT.md).
-- credit_transactions.organization_id stays nullable (audit trail per CONTEXT.md).

alter table public.credit_packages   alter column organization_id set not null;
alter table public.client_workspaces alter column organization_id set not null;

-- ==================================================
-- SECTION 6: DUAL-MODE RLS POLICIES
-- ==================================================
-- Adds new org-scoped PERMISSIVE policies alongside existing profile_id policies.
-- PostgreSQL ORs all PERMISSIVE policies — a row is visible if ANY policy matches.
-- DO NOT drop or modify existing profile_id policies (Phase 13 concern).
-- The (SELECT public.user_org_ids()) wrapper triggers Postgres initPlan caching.

create policy "Users see org credit_packages"
  on public.credit_packages
  for select
  using (organization_id in (select public.user_org_ids()));

create policy "Users see org client_workspaces"
  on public.client_workspaces
  for select
  using (organization_id in (select public.user_org_ids()));

-- ==================================================
-- SECTION 7: EXTEND notifications_type_check
-- ==================================================
-- PostgreSQL does not support ALTER CONSTRAINT for CHECK constraints.
-- Must DROP + re-ADD in the same transaction. No window with missing constraint.

alter table public.notifications drop constraint notifications_type_check;

alter table public.notifications add constraint notifications_type_check
  check (type in (
    'team_reply',
    'status_change',
    'step_ready',
    'project_reply',
    'project_update',
    'new_recommendation',
    'member_invited',
    'member_removed'
  ));

-- ==================================================
-- SECTION 8: MIGRATION GATE
-- ==================================================
-- Asserts data integrity after migration.
-- If any assertion fails, RAISE EXCEPTION rolls back the entire transaction.

do $$
declare
  org_member_count  integer;
  profile_count     integer;
  null_list_count   integer;
begin
  select count(*) into org_member_count from public.org_members;
  select count(*) into profile_count    from public.profiles;
  select count(*) into null_list_count
    from public.organizations
    where clickup_list_ids is null;

  if org_member_count != profile_count then
    raise exception 'Migration gate failed: org_members count (%) != profiles count (%)',
      org_member_count, profile_count;
  end if;

  if null_list_count > 0 then
    raise exception 'Migration gate failed: % organizations have NULL clickup_list_ids',
      null_list_count;
  end if;
end;
$$;

-- ==================================================
-- SECTION 9: PERFORMANCE INDEXES
-- ==================================================
-- Required for efficient RLS policy evaluation on credit_packages and client_workspaces.
-- Without these, every RLS check scans all org_members rows.

create index if not exists org_members_profile_id_idx on public.org_members(profile_id);
create index if not exists org_members_org_id_idx     on public.org_members(organization_id);
