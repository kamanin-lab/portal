-- RPC: get_org_members_enriched(p_org_id)
-- Returns org_members rows enriched with profile data and an accepted_at field
-- derived from auth.users.last_sign_in_at. Used by the Organisation TeamSection
-- to reliably detect pending invites (accepted_at IS NULL = never logged in).
-- SECURITY DEFINER so the function can read auth.users on behalf of the caller.

create or replace function public.get_org_members_enriched(p_org_id uuid)
returns table (
  id uuid,
  organization_id uuid,
  profile_id uuid,
  role text,
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

comment on function public.get_org_members_enriched(uuid)
  is 'Returns org members enriched with profile info and accepted_at (from auth.users.last_sign_in_at). Caller must be a member of the org.';

-- Allow authenticated users to call this function (RPC authorization is inside the function body)
grant execute on function public.get_org_members_enriched(uuid) to authenticated;
