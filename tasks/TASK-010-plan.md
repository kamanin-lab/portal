# TASK-010: Credit System Phase 1 — Implementation Plan

## Spec: `docs/superpowers/specs/2026-03-23-credit-system-design.md` (rev.2)

## 5 Work Items

### Item 1: Database Migration (Supervisor via SQL)

```sql
ALTER TABLE task_cache ADD COLUMN IF NOT EXISTS credits numeric;

CREATE TABLE IF NOT EXISTS credit_packages (...);
CREATE TABLE IF NOT EXISTS credit_transactions (...);
-- RLS + policies
-- Seed MBM: medium package, 25 credits/month
```

### Item 2: Webhook — handle `taskUpdated` for credits

**File:** `supabase/functions/clickup-webhook/index.ts`
- In the ticket handler path (after `taskStatusUpdated`), add branch for `taskUpdated`
- Check `historyItem.field === 'custom_field'` AND `data.field.id === CREDITS_FIELD_ID`
- Extract `data.value` (new) and `data.old_value` (old)
- Update `task_cache.credits`
- Insert `credit_transactions` row with idempotency check
- Store `CLICKUP_CREDITS_FIELD_ID` in environment (Coolify)

**Also modify:**
- `supabase/functions/fetch-clickup-tasks/index.ts` — extract Credits from `custom_fields` during full sync
- `supabase/functions/fetch-single-task/index.ts` — extract Credits and write to `task_cache.credits`

### Item 3: TypeScript types + transforms

**Files:**
- `src/modules/tickets/types/tasks.ts` — add `credits?: number | null` to `CachedTask` and `ClickUpTask`
- `src/modules/tickets/lib/transforms.ts` — promote `cached.credits` in `transformCachedTask`

### Item 4: Frontend — useCredits hook + CreditBadge + CreditBalance

**Create:**
- `src/modules/tickets/hooks/useCredits.ts` — fetch balance (SUM of transactions), package info, Realtime subscription on `credit_transactions`
- `src/modules/tickets/components/CreditBadge.tsx` — small `⚡ 3.5` badge, only shows when credits > 0
- `src/modules/tickets/components/CreditBalance.tsx` — balance display: `⚡ 12.5 Credits verfügbar · Medium · 25/Monat`, color coded

**Modify:**
- `src/modules/tickets/components/TaskCard.tsx` — add CreditBadge in meta row
- `src/modules/tickets/components/TaskDetail.tsx` — add credits line in metadata
- `src/shared/components/layout/SidebarUtilities.tsx` — add CreditBalance (expanded: full text, collapsed: ⚡ icon only)
- `src/modules/tickets/pages/TicketsPage.tsx` — add CreditBalance strip at top

### Item 5: Credit top-up Edge Function

**Create:** `supabase/functions/credit-topup/index.ts`
- Accept no params (or optional `month` override)
- Query `credit_packages WHERE is_active = true`
- For each: check if `monthly_topup` already exists this month → skip if yes
- Insert `credit_transactions` row: `type: 'monthly_topup', amount: credits_per_month`
- Protected by service role key only

## Commit Structure

| # | Content |
|---|---------|
| 1 | DB migration (SQL) + seed MBM package |
| 2 | Webhook credits handler + fetch-clickup-tasks + fetch-single-task |
| 3 | Types + transforms + useCredits hook |
| 4 | CreditBadge + CreditBalance + UI integration |
| 5 | credit-topup Edge Function |

## Verification
- Set Credits=3.5 on a task in ClickUp → appears in portal TaskCard + TaskDetail
- Sidebar shows balance
- TicketsPage shows balance header
- `npm run build` passes
