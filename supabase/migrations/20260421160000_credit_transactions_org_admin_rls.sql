-- Org admins see all credit_transactions for orgs where they are admin.
-- Permissive policy: ORs with existing "Users see own transactions"
-- (migration 20260323000000_credit_system.sql) so non-admin members continue
-- to see only their own rows via the original policy. The original policy is
-- NOT dropped or altered by this migration — it remains as the sole mechanism
-- by which members/viewers can see their own transactions.
--
-- Correctness of access control:
--   * user_org_ids() returns setof uuid — all org_ids where profile_id = auth.uid()
--     (see migration 20260414200000_org_foundation.sql:52-63).
--   * user_org_role(org_id uuid) returns text — the role of auth.uid() in that
--     specific org, or NULL if not a member
--     (see migration 20260414200000_org_foundation.sql:70-82).
--   * The two clauses both reference the SAME row.organization_id, so they
--     bind to one org per row. A user with admin role in org A but only member
--     in org B will only see all rows for org A via this policy (rows for org B
--     still restricted to their own profile_id through the legacy policy).

create policy "Org admins see all org credit_transactions"
  on public.credit_transactions
  for select
  using (
    organization_id in (select public.user_org_ids())
    and public.user_org_role(organization_id) = 'admin'
  );
