---
name: db-migrate
description: >
  Create and apply database migrations to staging and production.
  Use when adding columns, tables, RLS policies, or indexes.
  Covers the full lifecycle: write SQL → test on staging → apply to production.
---

# Database Migration

## When to Use

- Adding a new column or table
- Modifying RLS policies
- Adding indexes
- Dropping columns or tables (careful!)
- Updating constraints or defaults

## Step 1 — Write the Migration

Create the SQL file:
```bash
# Convention: supabase/migrations/YYYYMMDDHHMMSS_description.sql
# Example:
touch supabase/migrations/20260414120000_add_last_seen_to_profiles.sql
```

**SQL template:**
```sql
-- Migration: add_last_seen_to_profiles
-- Date: 2026-04-14
-- Reason: track user activity for digest scheduling

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- RLS: column is readable by owner only
-- (existing RLS on profiles covers this — no additional policy needed)

-- Index: for efficient querying by recency
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at
  ON public.profiles (last_seen_at DESC)
  WHERE last_seen_at IS NOT NULL;

COMMENT ON COLUMN public.profiles.last_seen_at IS
  'Last time the user was active in the portal. Updated on login and page load.';
```

### Rules for PORTAL migrations:
- Always use `IF NOT EXISTS` / `IF EXISTS` for idempotency
- RLS on new tables is MANDATORY — add `ENABLE ROW LEVEL SECURITY`
- Add column comments for documentation
- Never modify `raw_data` columns directly (managed by webhook)

## Step 2 — Sync Staging Schema (if needed)

If staging is behind production:
```bash
npx tsx scripts/sync-staging-schema.ts
```

## Step 3 — Apply to Staging

```bash
supabase link --project-ref ahlthosftngdcryltapu
supabase db push
```

Verify in Supabase Studio (staging) that the migration applied correctly.

## Step 4 — Test on Staging

- Deploy code that uses the new column to staging
- Verify the feature works end-to-end
- Check that existing data is not affected
- Run `npm run test` to catch any type errors

## Step 5 — Apply to Production

Production uses self-hosted Supabase. Apply via SQL editor or CLI:

```bash
# Option A: via Supabase CLI linked to prod
supabase link --project-ref <prod-project-ref>
supabase db push

# Option B: manual via Supabase Studio SQL editor (safer for destructive ops)
# SSH to Coolify, open Supabase Studio, run the migration manually
```

## Step 6 — Update DATABASE_SCHEMA.md

After migration is applied to production:
```bash
# Update docs/system-context/DATABASE_SCHEMA.md
# Add the new column/table with: name, type, nullable, description, RLS rule
```

## Step 7 — Update TypeScript Types

Regenerate Supabase types after schema change:
```bash
# For staging:
npx supabase gen types typescript --project-id ahlthosftngdcryltapu > src/shared/types/database.ts

# For production:
npx supabase gen types typescript --project-id <prod-ref> > src/shared/types/database.ts
```

## Gotchas

- **RLS is mandatory** on all new tables — forgetting this exposes client data
- **Column additions are safe** for concurrent traffic; column drops are NOT
- **For drops:** add the column to `SELECT *` exclusion lists first, deploy, then drop
- **`raw_data` jsonb** columns in `task_cache` are write-controlled by webhooks — don't add columns that conflict with top-level cache columns (Rule #4 in CLAUDE.md)
- **Staging types drift:** always regenerate `database.ts` after applying to prod
