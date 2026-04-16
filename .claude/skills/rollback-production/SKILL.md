---
name: rollback-production
description: >
  Safe rollback of production (portal.kamanin.at) after a bad deploy.
  Use immediately when production is broken after a push to main.
  Creates a revert commit — never destroys git history.
---

# Production Rollback

> **Production is broken. Clients are affected. Act fast but safely.**

## Step 1 — Assess the Damage

```bash
# What just went live?
git log --oneline origin/main -5

# When did it break? (Vercel deploy history)
# Check: https://vercel.com/dashboard → portal.kamanin.at → Deployments
```

Determine: is the problem in frontend code, Edge Functions, or database?

## Step 2 — Choose Rollback Strategy

### Option A: Revert last commit (most common)

```bash
git revert HEAD --no-edit
git push origin main
# Vercel redeploys immediately (~90s)
```

### Option B: Revert multiple commits

```bash
# Find the last known good commit
git log --oneline origin/main -20

# Revert a range (oldest first in the range)
git revert <oldest-bad-hash>..<newest-bad-hash> --no-edit
git push origin main
```

### Option C: Restore from stable tag

```bash
git tag --list                          # find latest stable tag (e.g. v1.2-stable)
git checkout v1.2-stable -b rollback-branch
git push origin rollback-branch:main --force  # ONLY as last resort — confirm with Yuri
```

Option C requires Yuri's explicit approval before force-push.

## Step 3 — Verify Rollback

```bash
# Wait 60-90s for Vercel to redeploy
curl -I https://portal.kamanin.at | head -3
# Expect: HTTP/2 200

# Login and test the broken flow
# Verify the issue is resolved
```

## Step 4 — Edge Function Rollback (if needed)

If Edge Functions are broken (not frontend), the volume mount auto-reverts when `main` reverts.
If functions still broken after 2 min, SSH to Coolify and restart the functions service.

## Step 5 — Notify Yuri

```
❌ Problem: [what broke]
🔄 Rollback: [which commit reverted]
✅ Status: [current state — fixed or still investigating]
⏭️ Next: [plan to fix properly on staging first]
```

## Step 6 — Fix Properly on Staging

Never redeploy the same code that broke production.
Fix it on `staging` first → validate → then promote to `main` again.

## Gotchas

- **Never `git reset --hard` on main** — destroys history, confuses Vercel
- **Force-push to main is a last resort** — requires Yuri approval
- **Database migrations don't auto-rollback** — if the bug was a migration, write a compensating migration
- **Stable tags are your safety net** — tag stable states: `git tag v1.x-stable && git push --tags`
- **Edge Functions lag by 2 min** after main push — wait before declaring them broken
