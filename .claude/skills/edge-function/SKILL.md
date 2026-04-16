---
name: edge-function
description: >
  Develop, test, and deploy Supabase Edge Functions for the PORTAL.
  Use when creating a new function or modifying an existing one.
  Covers local dev, routing via main/index.ts, staging deploy, and production deploy.
---

# Edge Function Development

## Architecture

All Edge Functions are routed through a single entry point:
- **Router:** `supabase/functions/main/index.ts` — dispatches via `EdgeRuntime.userWorkers.create()`
- **Shared utils:** `supabase/functions/_shared/` (cors.ts, logger.ts, utils.ts, emailCopy.ts)
- **Deploy:** staging → CI (GitHub Actions); production → volume mount on Coolify

## Step 1 — Create or Modify the Function

### New function:
```bash
mkdir supabase/functions/my-function/
touch supabase/functions/my-function/index.ts
```

**Template:**
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { logger } from "../_shared/logger.ts"

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    logger.info("my-function called", { body })

    // TODO: implement

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    logger.error("my-function error", { error })
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
```

## Step 2 — Add Route to Main Router

Edit `supabase/functions/main/index.ts`:
```typescript
// Add to the route dispatch block
if (url.pathname === "/my-function") {
  worker = await EdgeRuntime.userWorkers.create({
    servicePath: `${functionsDir}/my-function`,
  })
}
```

## Step 3 — Add Secrets (if needed)

```bash
# Staging (Cloud Supabase):
supabase secrets set MY_SECRET=value --project-ref ahlthosftngdcryltapu

# Production (add to Coolify env vars):
# SSH to server → Coolify UI → Edge Function service → Environment
```

## Step 4 — Test Locally (optional)

```bash
supabase start
supabase functions serve my-function --env-file .env.local
# Test:
curl -X POST http://localhost:54321/functions/v1/my-function \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

## Step 5 — Deploy to Staging

```bash
git add supabase/functions/my-function/ supabase/functions/main/index.ts
git commit -m "feat(edge): add my-function"
git push origin staging
# CI automatically runs deploy-edge-functions-staging.yml
```

Verify in Supabase Studio (staging) → Edge Functions → check logs.

## Step 6 — Test on Staging

From staging frontend or curl:
```bash
curl -X POST https://staging.portal.kamanin.at/functions/v1/my-function \
  -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

## Step 7 — Deploy to Production

Production auto-deploys via volume mount when `main` is updated:
```bash
git checkout main
git merge staging
git push origin main
```

The Coolify volume mount picks up the changes. If needed, restart the functions service via SSH.

## Gotchas

- **All ClickUp API calls MUST go through Edge Functions** — never expose the ClickUp token to the browser
- **CORS headers** are mandatory — always import and use `corsHeaders` from `_shared/cors.ts`
- **OPTIONS preflight** must return 200 with corsHeaders (already in template)
- **No JWT verification on some functions** — check if `--no-verify-jwt` was used during deploy
- **Deno imports** use URL imports, not npm — check `deno.land/std` version compatibility
- **Logger is structured** — use `logger.info/error` not `console.log` for production logs
- **`_shared/` is not a function** — never deploy it alone; it's imported by other functions
