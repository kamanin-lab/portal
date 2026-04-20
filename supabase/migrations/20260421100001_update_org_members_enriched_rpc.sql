-- Update RPC to include departments column from org_members.
-- Required by the Organisation TeamSection to render MemberDepartmentPicker.
-- DROP required because we're changing the RETURNS TABLE shape (adding `departments text[]`),
-- and Postgres disallows changing return type via CREATE OR REPLACE.

drop function if exists public.get_org_members_enriched(uuid);

create or replace function public.get_org_members_enriched(p_org_id uuid)
returns table (
  id uuid,
  organization_id uuid,
  profile_id uuid,
  role text,
  departments text[],
  created_at timestamptz,
  invited_email text,
  accepted_at timestamptz,
  profile_email text,
  profile_full_name text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    om.id,
    om.organization_id,
    om.profile_id,
    om.role::text,
    om.departments,
    om.created_at,
    om.invited_email,
    au.last_sign_in_at as accepted_at,
    p.email as profile_email,
    p.full_name as profile_full_name
  from public.org_members om
  left join auth.users au on au.id = om.profile_id
  left join public.profiles p on p.id = om.profile_id
  where om.organization_id = p_org_id
    and exists (
      select 1
      from public.org_members c
      where c.organization_id = p_org_id
        and c.profile_id = auth.uid()
    )
  order by om.created_at asc;
$$;
