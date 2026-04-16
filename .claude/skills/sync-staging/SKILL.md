---
name: sync-staging
description: >
  Sync staging environment from production — schema dump + apply, secrets push.
  Use before any staging work that depends on current prod schema or secrets.
  Prevents "works on staging, breaks on prod" divergence.
---

# Sync Staging from Production

## When to Use

- Before developing a feature that touches DB schema
- When production secrets have rotated
- When staging is behaving differently than production
- Monthly maintenance to keep environments in sync

## Step 1 — Sync Schema (Prod → Staging)

```bash
# Dump production schema (SSH to Coolify → pg_dump)
npx tsx scripts/sync-staging-schema.ts --dump-only

# Review the dump (optional sanity check)
# It saves to a temp file — check for unexpected changes

# Apply to staging Cloud Supabase
npx tsx scripts/sync-staging-schema.ts --apply-only
```

**If both steps needed:**
```bash
npx tsx scripts/sync-staging-schema.ts
```

### What this does:
- SSH to Coolify server → `pg_dump` production public schema
- Applies to Cloud Supabase staging (`ahlthosftngdcryltapu`) via Management API
- 2-pass retry logic handles foreign key ordering

### If apply fails:
- Check the error — usually a constraint order issue
- Re-run `--apply-only` (idempotent for most operations)
- For destructive changes: manually apply the specific migration via Supabase dashboard

## Step 2 — Secrets: What to Copy vs. What to Override

> **STOP before syncing secrets.** Production and staging have environment-specific secrets
> that must NOT be overwritten with each other's values. Blindly copying all secrets will
> break webhooks and external integrations in both directions.

### Secrets taxonomy

| Secret | Prod value | Staging value | Safe to sync? |
|--------|-----------|---------------|---------------|
| `CLICKUP_API_TOKEN` | prod token | same or test token | ✅ copy from prod |
| `SUPABASE_SERVICE_ROLE_KEY` | prod key | staging key | ❌ NEVER copy — different project |
| `SUPABASE_URL` | prod URL | staging URL | ❌ NEVER copy — different project |
| `CLICKUP_WEBHOOK_SECRET` | prod webhook secret | **staging webhook secret** | ❌ NEVER copy — different webhook |
| `MAILJET_API_KEY` / `SECRET` | prod keys | same or test keys | ⚠️ copy only if using same Mailjet account |
| `NEXTCLOUD_*` | prod Nextcloud | same (usually shared) | ✅ copy from prod |
| `CRON_SECRET` | prod value | regenerated for staging | ⚠️ script regenerates automatically |
| `JWT_SECRET` | prod value | regenerated for staging | ⚠️ script regenerates automatically |

### Why webhook secrets must differ

ClickUp sends webhooks to a specific endpoint URL. Staging and production have **separate ClickUp webhooks** registered pointing to different URLs:
- Production: `https://portal.kamanin.at/functions/v1/clickup-webhook`
- Staging: `https://staging.portal.kamanin.at/functions/v1/clickup-webhook` (or not registered)

If you copy the production `CLICKUP_WEBHOOK_SECRET` to staging AND staging has a registered webhook — the secret validates but events are duplicated. If staging has no webhook registered, the secret is harmless but still wrong to copy.

**Rule:** `CLICKUP_WEBHOOK_SECRET` on staging must match the secret used when registering the staging webhook — not the production one.

### Run the sync script (it handles the known cases)

```bash
npx tsx scripts/sync-staging-secrets.ts
```

The script:
- SSH to Coolify → reads 15 Edge Function secrets from docker inspect
- Filters to allowed list (excludes Supabase URL, keys, Coolify internals)
- **Regenerates** `JWT_SECRET` and `CRON_SECRET` for staging (does NOT copy from prod)
- Pushes via Supabase Management API
- Disables `verify_jwt` on all staging functions

### After sync — verify these manually

```bash
# Check that SUPABASE_URL and SERVICE_ROLE_KEY are staging values, not prod
# In Supabase Studio (staging) → Settings → Edge Functions → check env vars
```

Expected staging values:
- `SUPABASE_URL` → `https://ahlthosftngdcryltapu.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` → staging key (from `docs/staging-env-reference.txt`)

If these got overwritten with prod values: staging functions will write to the production database. Fix immediately.

### If SSH fails
- Check SSH credentials in memory `project_ssh_server.md`
- Fallback: manually copy safe secrets via Supabase dashboard → Settings → Edge Functions
- Do NOT copy `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLICKUP_WEBHOOK_SECRET` manually

## Step 3 — Push New Migrations (if any)

If there are new migrations to apply:
```bash
supabase link --project-ref ahlthosftngdcryltapu
supabase db push
```

## Step 4 — Verify

```bash
# Quick smoke test — staging functions should respond
curl -s https://staging.portal.kamanin.at/api/health || echo "No health endpoint"

# Login to staging and verify auth works
# Open https://staging.portal.kamanin.at in browser
```

## Gotchas

- Schema sync does NOT sync data — only structure
- `sync-staging-schema.ts` uses `pg_dump` public schema only (no auth schema)
- If secrets sync fails midway, staging functions may have partial config — re-run to fix
- Cloud Supabase free tier has connection limits — don't leave many connections open
