-- Backfill credit_transactions.organization_id for orphaned rows written by code
-- paths that pre-date or bypassed the Phase 9-13 org migration
-- (notably update-task-status accept_recommendation and pre-Phase-13 credit-topup).
--
-- Orphans are invisible to get_org_credit_balance(p_org_id), which sums only
-- rows where organization_id IS NOT NULL. MBM saw an inflated balance because
-- of this. Resolution derives org from org_members (unique per profile —
-- verified: zero multi-org profiles at time of writing).

UPDATE public.credit_transactions ct
SET organization_id = om.organization_id
FROM public.org_members om
WHERE ct.profile_id = om.profile_id
  AND ct.organization_id IS NULL;

-- Any residual orphan means a profile without org_members — block the
-- NOT NULL below by failing loudly rather than silently accepting bad state.
DO $$
DECLARE
  residual bigint;
BEGIN
  SELECT COUNT(*) INTO residual FROM public.credit_transactions WHERE organization_id IS NULL;
  IF residual > 0 THEN
    RAISE EXCEPTION 'credit_transactions still has % orphaned rows after backfill — investigate before migrating', residual;
  END IF;
END $$;

ALTER TABLE public.credit_transactions
  ALTER COLUMN organization_id SET NOT NULL;

COMMENT ON COLUMN public.credit_transactions.organization_id IS
  'Org this transaction belongs to. Made NOT NULL on 2026-04-20 to prevent orphans that would be invisible to get_org_credit_balance().';
