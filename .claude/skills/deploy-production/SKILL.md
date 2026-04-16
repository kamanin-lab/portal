---
name: deploy-production
description: >
  Promote validated staging changes to production (portal.kamanin.at).
  HIGH RISK — auto-deploys immediately on push to main. Always requires explicit user approval.
  Covers both frontend (Vercel) and Edge Functions (volume mount to Coolify).
---

# Deploy to Production

> **STOP. This deploys to live clients.** Confirm with Yuri before proceeding.

## Pre-conditions (ALL must be true)

- [ ] Changes validated on `staging.portal.kamanin.at`
- [ ] QA agent has signed off
- [ ] Post-code review passed (OpenRouter, 0 blocking issues)
- [ ] **Yuri has explicitly approved** ("go ahead", "deploy", etc.)
- [ ] No active client sessions expected (check time — avoid peak hours 09:00–18:00 CET)

## Step 1 — Merge Staging → Main

```bash
git checkout main
git pull origin main                 # sync first
git merge staging                    # fast-forward if possible
git log --oneline -5                 # review commits about to go live
```

## Step 2 — Final Review Before Push

```bash
git diff origin/main HEAD            # see exactly what will be pushed
```

Review: does every change belong here? Any debug code, console.logs, test credentials?

## Step 3 — Push

```bash
git push origin main
```

Vercel deploys immediately. Expect ~60–90s for frontend to go live.

## Step 4 — Verify Edge Functions (if changed)

Production Edge Functions deploy **automatically via GitHub Actions** on push to `main`.

Workflow: `.github/workflows/deploy-edge-functions.yml`
- Triggers on: push to `main` with changes under `supabase/functions/**`
- Detects changed functions (or full deploy if `_shared/` or `main/` changed)
- Copies files via `tar+ssh` to Coolify volume mount on the production server
- Also supports manual trigger via `workflow_dispatch` in GitHub UI

**Do NOT use `scp` or manual SSH to deploy functions** — push to `main` is the correct path.

Staging uses a separate workflow (`.github/workflows/deploy-edge-functions-staging.yml`) that deploys to Cloud Supabase via Supabase CLI on push to `staging`.

If GitHub Actions fails and you need emergency manual deploy:
```bash
# SSH to Coolify server (see memory project_ssh_server.md)
scp -i ~/.ssh/id_ed25519 -P 22 supabase/functions/<fn>/index.ts \
  root@91.99.172.34:/data/coolify/services/ngkk4c4gsc0kw8wccw0cc04s/volumes/functions/<fn>/index.ts
# Edge Functions read files on each request — no container restart needed
# (unless env vars changed — then: docker compose up -d --force-recreate supabase-edge-functions)
```

## Step 5 — Smoke Test Production

1. Open `https://portal.kamanin.at` in incognito
2. Test the specific flow that was changed
3. Check Supabase production logs for errors
4. Verify no alerts from monitoring

## Step 6 — Rollback if Needed

If production is broken immediately after deploy:

```bash
git revert HEAD                      # creates a revert commit
git push origin main                 # redeploys immediately
# OR for multiple commits:
git revert <oldest-bad-commit>..<newest-bad-commit>
git push origin main
```

**Never** use `git reset --hard` on main — it destroys history.

## Notify Yuri

After successful deploy:
```
🚀 Deployed to portal.kamanin.at — [brief description of what changed]
```

## Gotchas

- `main` branch `vercel.json` HAS `/auth/v1/*` proxy — needed for self-hosted Supabase
- Production backend is self-hosted on Coolify — different URL from staging
- Tag stable states: `git tag v1.x-stable && git push --tags`
