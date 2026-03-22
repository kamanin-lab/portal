# Credit System — Design Spec

> Date: 2026-03-23
> Status: Approved by user
> Scope: Phase 1 — manual credit assignment, display in portal, balance tracking

---

## Product Model

### What Credits Are
- 1 Credit = 100€ (not shown to client)
- Unit of task complexity, not tied to hours
- Minimum step: 0.5 Credits
- Free numbers with 0.5 step, range 0.5 — 20
- Client sees Credits only, never the € value

### Subscription Packages

| Package | Credits/Month | Price |
|---------|--------------|-------|
| Small | 10 | 1.000€ |
| Medium | 25 | 2.500€ |
| Large | 50 | 5.000€ |

- Monthly subscription — client pays every month
- Credits **accumulate** — unused credits roll over
- Balance can go **negative** — no blocking
- Tasks created freely regardless of balance

### Scope
- Credits apply to **Tickets only** (workspace tasks)
- Projects are billed separately (fixed price) — no credits
- Phase 1: manual assignment via ClickUp custom field
- Phase 2 (future): AI auto-estimation

---

## Technical Design

### ClickUp: Custom Field

Create `Credits` custom field:
- Type: **Number** (allows decimals: 0.5, 1.5, etc.)
- Scope: Space or Folder level (visible on all task lists)
- Who fills: Developer / Yuri (Phase 1)

Field ID will be stored as constant in Edge Function (like `PORTAL_CTA_FIELD_ID`).

### Database Changes

```sql
-- Credits on individual tasks
ALTER TABLE task_cache ADD COLUMN credits numeric;

-- Credit packages and balance tracking
CREATE TABLE credit_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  package_name text NOT NULL,           -- 'small', 'medium', 'large'
  credits_per_month numeric NOT NULL,   -- 10, 25, 50
  is_active boolean NOT NULL DEFAULT true,
  started_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Monthly credit transactions (additions + deductions)
CREATE TABLE credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL,              -- positive = addition, negative = deduction
  type text NOT NULL,                   -- 'monthly_topup', 'task_deduction', 'manual_adjustment'
  task_id text,                         -- clickup_id reference (for task_deduction)
  task_name text,                       -- snapshot of task name at deduction time
  description text,                     -- human-readable note
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE credit_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own packages" ON credit_packages
  FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY "Users see own transactions" ON credit_transactions
  FOR SELECT USING (profile_id = auth.uid());
```

### Balance Calculation

Balance is computed, not stored:
```sql
SELECT COALESCE(SUM(amount), 0) AS balance
FROM credit_transactions
WHERE profile_id = :userId;
```

This is simpler and more reliable than maintaining a `used_credits` counter. Every credit movement is a transaction row.

### Webhook: Credits Sync

**IMPORTANT:** ClickUp `taskUpdated` webhook does NOT send `custom_fields` array. It sends changes via `history_items[0].data`:

```json
{
  "event": "taskUpdated",
  "history_items": [{
    "field": "custom_field",
    "data": {
      "field": { "id": "CREDITS_FIELD_ID", "name": "Credits" },
      "value": 3,
      "old_value": null
    }
  }]
}
```

When webhook fires `taskUpdated` with `history_items[0].field === 'custom_field'`:
1. Check if `data.field.id === CLICKUP_CREDITS_FIELD_ID` (match by ID, not name)
2. Extract `new_value = data.value`, `old_value = data.old_value`
3. Update `task_cache.credits = new_value`
4. Insert `credit_transactions` row:
   - `amount: -(new_value - (old_value || 0))` (negative = deduction, positive = refund)
   - `type: 'task_deduction'`
   - `task_id`, `task_name` from the task

**Decrement/clear behavior:**
- Credits reduced (5 → 3): `amount = -(3-5) = +2` → refund transaction (intentional, documented)
- Credits cleared (3 → null/0): `amount = -(0-3) = +3` → full refund transaction
- This is correct behavior — if a developer corrects an overestimate, the client gets credits back

**Idempotency:**
- Before inserting, check: `WHERE task_id = :taskId AND amount = :amount AND created_at > now() - interval '60 seconds'`
- If match found → skip (duplicate webhook delivery)

**Note:** `taskUpdated` for tickets is NOT currently handled in the webhook. A new handler branch must be added in the ticket path for custom field changes.

### Monthly Top-up

A scheduled Edge Function (or manual trigger for Phase 1):
- Query `credit_packages` where `is_active = true`
- For each: insert `credit_transactions` row with `type: 'monthly_topup'`, `amount: credits_per_month`
- Run on 1st of each month

Phase 1: triggered manually by Yuri via a simple Edge Function call.
Phase 2: automated via Supabase cron or external scheduler.

---

## Portal UI Changes

### 1. Sidebar: Credit Balance

In `SidebarUtilities` (bottom of sidebar), add a credit balance indicator:
```
──────────────
⚡ 12.5 Credits
Medium · 25/Monat
──────────────
Konto | Hilfe
```

- Shows current balance (computed from transactions)
- Package name + monthly amount
- Updates in real-time via Supabase Realtime on `credit_transactions`

### 2. Tickets Page: Balance Header

At the top of the tickets/tasks page, show:
```
┌──────────────────────────────────────────────┐
│ ⚡ 12.5 Credits verfügbar · Medium · 25/Monat │
└──────────────────────────────────────────────┘
```

Compact strip, not a large card. Below the page title, above the task list.

### 3. TaskCard: Credits Badge

On each task card in the list, show credits if assigned:
```
[TaskCard]
  SEO Audit durchführen
  In Bearbeitung · ⚡ 3            ← credits badge
  Fällig: 28. Mär.
```

Small badge next to status, only shows when `credits > 0`.

### 4. TaskDetailSheet: Credits Section

In the task detail side sheet, show credits prominently:
```
Status: In Bearbeitung
Priorität: Normal
Credits: ⚡ 3.5
```

Part of the task metadata section. Read-only for client.

### 5. Color Coding for Balance

| Balance State | Visual |
|---|---|
| > 50% of monthly | Green text |
| 20-50% of monthly | Amber text |
| < 20% or negative | Red text |

---

## Data Flow

```
Developer sets Credits in ClickUp (Custom Field)
    │
    ▼ ClickUp webhook → clickup-webhook Edge Function
    │
    ├─► task_cache.credits updated
    │
    └─► credit_transactions row inserted (task_deduction)
    │
    ▼ Supabase Realtime → UI updates
    │
    ├─► Sidebar balance refreshes
    ├─► TaskCard badge appears
    └─► TaskDetail shows credits
```

---

## Files to Create/Modify

### New Files
- `src/modules/tickets/hooks/useCredits.ts` — fetch balance, package, transactions
- `src/modules/tickets/components/CreditBalance.tsx` — balance display (sidebar + page header)
- `src/modules/tickets/components/CreditBadge.tsx` — small badge for task cards

### Modified Files
- `supabase/functions/clickup-webhook/index.ts` — add `taskUpdated` handler for ticket path, parse Credits via `history_items[0].data`, insert transaction
- `supabase/functions/fetch-clickup-tasks/index.ts` — extract Credits from `custom_fields` during full sync
- `supabase/functions/fetch-single-task/index.ts` — extract Credits and write to `task_cache.credits`
- `src/modules/tickets/types/tasks.ts` — add `credits?: number | null` to `CachedTask` and `ClickUpTask`
- `src/modules/tickets/lib/transforms.ts` — promote `cached.credits` in `transformCachedTask`
- `src/modules/tickets/components/TaskCard.tsx` — add CreditBadge
- `src/modules/tickets/components/TaskDetail.tsx` — add credits in metadata
- `src/shared/components/layout/SidebarUtilities.tsx` — add CreditBalance (handle collapsed state: show ⚡ icon only)
- `src/modules/tickets/pages/TicketsPage.tsx` — add balance header
- `src/shared/styles/tokens.css` — add credit-related tokens if needed

### Edge Functions
- `supabase/functions/clickup-webhook/index.ts` — credits extraction + transaction
- `supabase/functions/fetch-clickup-tasks/index.ts` — credits in full sync
- `supabase/functions/fetch-single-task/index.ts` — credits in single fetch
- `supabase/functions/credit-topup/index.ts` (new) — monthly top-up with idempotency check

---

## What's NOT in Scope (Phase 1)
- AI credit estimation
- Credit history page for client
- Monthly reports / invoicing
- Package upgrade/downgrade through portal
- Notification when balance is low (email)

## Success Criteria
- [ ] ClickUp custom field `Credits` created
- [ ] Credits visible on TaskCard (badge)
- [ ] Credits visible in TaskDetailSheet
- [ ] Balance shown in sidebar
- [ ] Balance shown at top of tickets page
- [ ] Balance computed from credit_transactions table
- [ ] Webhook updates task_cache.credits + inserts transaction
- [ ] MBM test: set credits on a task → appears in portal
- [ ] Negative balance allowed, no blocking
