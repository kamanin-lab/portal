-- ROLLBACK: 20260414200000_org_foundation
-- Phase 9: org-db-foundation
--
-- WARNING: Manual use only. This will destroy ALL org data and cannot be undone.
-- Do NOT run via supabase db push — this is NOT a tracked migration.
-- Do NOT apply unless supabase db push failed and you need to fully undo Phase 9.
--
-- Apply manually via:
--   psql "your-connection-string" -f 20260414200000_org_foundation_rollback.sql
-- or via the Supabase SQL Editor (Dashboard → SQL Editor → paste and run).
--
-- Run in this order — dependency chain is respected.

-- ==================================================
-- 1. Drop new org-scoped RLS policies
-- ==================================================

drop policy if exists "Users see org credit_packages"  on public.credit_packages;
drop policy if exists "Users see org client_workspaces" on public.client_workspaces;

-- ==================================================
-- 2. Revert notifications_type_check to pre-Phase-9 values
-- ==================================================

alter table public.notifications drop constraint if exists notifications_type_check;

alter table public.notifications add constraint notifications_type_check
  check (type in (
    'team_reply',
    'status_change',
    'step_ready',
    'project_reply',
    'project_update',
    'new_recommendation'
  ));

-- ==================================================
-- 3. Drop NOT NULL constraints on organization_id columns
-- ==================================================

alter table public.credit_packages   alter column organization_id drop not null;
alter table public.client_workspaces alter column organization_id drop not null;

-- ==================================================
-- 4. Drop FK columns (drops data — irreversible)
-- ==================================================

alter table public.profiles            drop column if exists organization_id;
alter table public.credit_packages     drop column if exists organization_id;
alter table public.client_workspaces   drop column if exists organization_id;
alter table public.credit_transactions drop column if exists organization_id;

-- ==================================================
-- 5. Drop helper functions
-- ==================================================

drop function if exists public.user_org_ids();
drop function if exists public.user_org_role(uuid);

-- ==================================================
-- 6. Drop new tables (CASCADE drops FK constraints automatically)
-- ==================================================

drop table if exists public.org_members   cascade;
drop table if exists public.organizations cascade;
