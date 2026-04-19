---
name: rotate-secret
description: >
  Rotate or update a shared Edge Function secret (CRON_SECRET, MAILJET_*,
  ANTHROPIC_API_KEY, OPENROUTER_API_KEY, etc.) across all environments.
  Use when a secret needs to change, leaks, or when a secret is shared
  between Coolify + staging Supabase + GitHub Actions and has drifted
  out of sync.
---

# Rotate an Edge Function Secret

> Most incidents with scheduled workflows (`send-reminders`, `send-weekly-summary`)
> that suddenly 401 are caused by an out-of-sync `CRON_SECRET` across
> Coolify, staging Supabase, and GitHub Actions. This skill is the
> canonical fix.

## The #1 gotcha

**`docker restart` does NOT re-read env file changes.**

If you edit `/data/coolify/services/<id>/.env` on the prod server and then
`docker restart supabase-edge-functions-...`, the container keeps its
**baked-in** env vars. The `.env` edit is ignored.

**Correct production command:**

```bash
cd /data/coolify/services/ngkk4c4gsc0kw8wccw0cc04s
docker compose up -d --no-deps --force-recreate supabase-edge-functions
```

`--no-deps` means other services (DB, Kong, Auth, Storage, etc.) are NOT
restarted. Zero downtime for the rest of the stack. `--force-recreate`
destroys + recreates the edge-runtime container so docker-compose re-reads
the `.env` file.

## Where secrets live

| Environment | Storage | Update command |
|---|---|---|
| **Prod Edge Functions** | `/data/coolify/services/ngkk4c4gsc0kw8wccw0cc04s/.env` | SSH edit + `docker compose up -d --force-recreate supabase-edge-functions` |
| **Staging Edge Functions** | Cloud Supabase (project `ahlthosftngdcryltapu`) | `supabase secrets set KEY="value" --project-ref ahlthosftngdcryltapu` |
| **GitHub Actions secrets** | Repo-level, used by cron workflows | `gh secret set KEY --body "value"` |

## Three-point sync — which secrets need all three?

| Secret | Coolify (prod EF) | Staging Supabase | GitHub Actions | Notes |
|---|---|---|---|---|
| `CRON_SECRET` | ✓ | ✓ | ✓ | GH Actions cron sends it to prod EF and staging EF alike |
| `SUPABASE_FUNCTIONS_URL` | — | — | ✓ | GH-only — points to prod URL |
| `SUPABASE_ACCESS_TOKEN` | — | — | ✓ | GH-only — used by staging EF deploy workflow |
| `STAGING_PROJECT_REF` | — | — | ✓ | GH-only |
| `MAILJET_API_KEY` / `MAILJET_API_SECRET` | ✓ | ✓ | — | Used by EF only; prod + staging separately |
| `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY` | ✓ | ✓ | — | Same — EF only, no GH usage |
| `CLICKUP_API_TOKEN`, `CLICKUP_WEBHOOK_SECRET` | ✓ | ✓ | — | EF only |
| `NEXTCLOUD_PASS`, `NEXTCLOUD_USER` | ✓ | ✓ | — | EF only |

**Rule of thumb:** if a GitHub Actions workflow uses the secret (via
`${{ secrets.X }}`), it must be in GH. If an Edge Function reads it via
`Deno.env.get("X")`, it must be in Coolify (prod) AND staging Supabase.
Overlap = three-point sync.

## Procedure — rotating a three-point secret (e.g. CRON_SECRET)

**Prereqs in `.env.local`:**
- `STAGING_PROJECT_REF`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_SERVER_HOST`, SSH access to Coolify
- `gh` authenticated

```bash
# 1. Generate a new value
NEW_SECRET=$(openssl rand -hex 32)
echo "$NEW_SECRET" > /tmp/rotate.txt    # stash locally, delete at end

# 2. Update prod Coolify .env + recreate container
ssh -o StrictHostKeyChecking=no root@91.99.172.34 "
  cp /data/coolify/services/ngkk4c4gsc0kw8wccw0cc04s/.env \
     /data/coolify/services/ngkk4c4gsc0kw8wccw0cc04s/.env.bak-\$(date +%s)
  sed -i 's|^CRON_SECRET=.*|CRON_SECRET=$NEW_SECRET|' \
     /data/coolify/services/ngkk4c4gsc0kw8wccw0cc04s/.env
  cd /data/coolify/services/ngkk4c4gsc0kw8wccw0cc04s
  docker compose up -d --no-deps --force-recreate supabase-edge-functions
"

# 3. Update staging Supabase
supabase secrets set CRON_SECRET="$NEW_SECRET" --project-ref "$STAGING_PROJECT_REF"

# 4. Update GitHub repo secret
gh secret set CRON_SECRET --body "$NEW_SECRET"
```

## Verify — three checks

```bash
# A. Container has the NEW value (not just the file)
ssh root@91.99.172.34 "docker inspect supabase-edge-functions-ngkk4c4gsc0kw8wccw0cc04s \
  --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^CRON_SECRET='" \
  | head -c 28

# B. EF accepts the new secret — expect HTTP 200
NEW=$(cat /tmp/rotate.txt)
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://supabase.kamanin.at/functions/v1/send-reminders" \
  -H "Authorization: Bearer $NEW"

# C. Re-run the most recent failed workflow
gh run list --workflow=send-reminders.yml --limit 1
gh run rerun <run-id>
```

Only when all three are green is the rotation complete. Delete `/tmp/rotate.txt`.

## Updating a single secret (not a rotation) — e.g. a new ANTHROPIC key

Same procedure, but skip the places it doesn't exist:

```bash
# Production (Coolify-only)
ssh root@91.99.172.34 "
  sed -i 's|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$NEW_VALUE|' \
     /data/coolify/services/ngkk4c4gsc0kw8wccw0cc04s/.env
  cd /data/coolify/services/ngkk4c4gsc0kw8wccw0cc04s
  docker compose up -d --no-deps --force-recreate supabase-edge-functions
"

# Staging
supabase secrets set ANTHROPIC_API_KEY="$NEW_VALUE" --project-ref "$STAGING_PROJECT_REF"
```

No GitHub Actions step — GH doesn't hold this secret.

## Common mistakes

1. **`docker restart` after editing `.env`** — container keeps the old value until re-created. Always use `docker compose up -d --force-recreate`.
2. **Updating only GH secret for a rotation** — cron workflow sends the new value to prod EF which still has the old one → 401. Always include the Coolify step.
3. **Using Coolify UI + expecting it to auto-restart the container** — Coolify's "Redeploy" button does work (it runs `compose up -d`), but it restarts the *entire* stack. Prefer targeted `--no-deps` recreation via SSH for quick iterations.
4. **Forgetting staging** — if `CRON_SECRET` drifts only on staging, `send-weekly-summary-staging` (future) or any staging-triggered cron will 401. Keep all three in sync on every rotation.
5. **Not verifying the container env after recreation** — the `.env` file has the new value but the container might not, if compose didn't see a spec change. Use `docker inspect` (check A above) to confirm the running container picked it up.

## Related

- **After-incident memory:** `C:/Users/upan/.claude/projects/g--01-OPUS-Projects-PORTAL/memory/project_coolify_env_rotation.md`
- **Deployment guide:** `.claude/skills/deploy-production/SKILL.md` — Step 4 has an inline reminder about the force-recreate command
- **Edge Function setup:** `.claude/skills/edge-function/SKILL.md` — Step 3 covers adding new secrets
