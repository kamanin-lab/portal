---
name: deploy-staging
description: >
  Deploy changes to staging environment (staging.portal.kamanin.at).
  Covers frontend (Vercel auto-deploy via git push) and Edge Functions (CI via GitHub Actions).
  Use before any staging verification or client demo.
---

# Deploy to Staging

## Pre-flight Checklist

Before pushing, verify:
- [ ] Currently on `staging` branch (`git branch --show-current`)
- [ ] No uncommitted sensitive files (`.env`, credentials)
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Tests pass: `npm run test`
- [ ] Build succeeds: `npm run build`

## Step 1 — Stage and Push

```bash
git status                          # confirm branch = staging, review changed files
git add <specific files>            # NEVER git add -A blindly
git commit -m "feat/fix: description"
git push origin staging
```

## Step 2 — Verify Frontend Deploy

- Vercel auto-deploys `staging` → `staging.portal.kamanin.at`
- Check Vercel dashboard or wait ~60s then:
  ```bash
  curl -I https://staging.portal.kamanin.at | head -5
  # Expect: HTTP/2 200
  ```

## Step 3 — Verify Edge Functions (if changed)

If `supabase/functions/**` was modified:
- GitHub Actions CI runs `.github/workflows/deploy-edge-functions-staging.yml` automatically
- Check Actions tab on GitHub for CI status
- Functions deploy to Cloud Supabase project `ahlthosftngdcryltapu`
- Smoke test: trigger the changed function endpoint from staging UI

## Step 4 — Smoke Test

1. Login at `https://staging.portal.kamanin.at` with test account
2. Check that the changed feature works end-to-end
3. Verify no console errors in browser DevTools
4. Check Supabase logs if Edge Functions were changed

## Gotchas

- **vercel.json on staging** does NOT have `/auth/v1/*` proxy — Cloud Supabase handles CORS natively
- **Edge Functions** on staging use Cloud Supabase secrets, NOT production secrets
- If secrets changed on prod, run `npx tsx scripts/sync-staging-secrets.ts` first
- **Never push directly to `main`** from here — staging must be validated first

## Staging Credentials

- URL: https://staging.portal.kamanin.at
- Backend: Cloud Supabase `ahlthosftngdcryltapu` (eu-central-1)
- Test credentials: see memory reference `reference_test_credentials.md`
