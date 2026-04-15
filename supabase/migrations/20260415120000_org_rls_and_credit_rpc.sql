-- Phase 11 — org-frontend-auth
-- RLS policies enabling client-side reads of own org_members row and own organizations row
-- + get_org_credit_balance(p_org_id uuid) RPC for org-scoped credit balance

-- =======================================================================
-- RLS: org_members — members can read their own membership row
-- =======================================================================
alter table public.org_members enable row level security;

drop policy if exists "members can read own membership" on public.org_members;
create policy "members can read own membership"
  on public.org_members for select
  to authenticated
  using (profile_id = auth.uid());

-- =======================================================================
-- RLS: organizations — members can read the orgs they belong to
-- =======================================================================
alter table public.organizations enable row level security;

drop policy if exists "members can read own organization" on public.organizations;
create policy "members can read own organization"
  on public.organizations for select
  to authenticated
  using (
    id in (
      select organization_id
      from public.org_members
      where profile_id = auth.uid()
    )
  );

-- =======================================================================
-- Function: get_org_credit_balance(p_org_id uuid) returns numeric
-- Sums credit_transactions.amount for all rows belonging to the given org.
-- Mirrors pattern of user_org_ids() in 20260414200000_org_foundation.sql
-- =======================================================================
create or replace function public.get_org_credit_balance(p_org_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(ct.amount), 0)
  from public.credit_transactions ct
  where ct.organization_id = p_org_id;
$$;

revoke execute on function public.get_org_credit_balance(uuid) from public;
grant execute on function public.get_org_credit_balance(uuid) to authenticated, anon, service_role;
