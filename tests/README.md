# PORTAL e2e test suite

Automated end-to-end tests for complex cross-service flows (org permissions, notifications, credits, fan-out, RLS). Replaces manual click-through in the portal UI + ClickUp.

## Safety rules (non-negotiable)

1. **Staging only.** All tests target:
   - Staging Cloud Supabase project ref `ahlthosftngdcryltapu`
   - ClickUp test lists (bounded sandbox in folder `901513727289`):
     - `901520762121` — "Test - Project" → `CLICKUP_TEST_LIST_PROJECT` (project-module tests)
     - `901520327531` — "Test - Tasks"   → `CLICKUP_TEST_LIST_TASKS` (ticket-module tests)
   - The `_shared/staging-client.ts` safety guard aborts if `STAGING_SUPABASE_URL` points anywhere else.

   **Rule:** whenever writing a new e2e test, always use one of the two test lists above — never a real client list.
2. **Never run against production.** If you need to verify prod behavior, do it manually or with read-only queries.
3. **Clean up.** Every test **must** delete what it created: ClickUp tasks/comments, Supabase rows (`notifications`, `comment_cache`, `task_cache`, `org_members`, `organizations`), auth users. Failed tests should still attempt cleanup (use `try/finally`).
4. **Dedicated test users per run.** Never reuse real Yuri or client accounts. Create fresh `e2e-*-{timestamp}@test.local` users via `supabaseAdmin.auth.admin.createUser`.

## Running

```bash
# Pre-req: .env.local must contain STAGING_* keys + CLICKUP_API_TOKEN
cd g:/01_OPUS/Projects/PORTAL

# Quick DB inspection (read-only)
npx tsx tests/e2e/_inspect-staging.ts

# Full e2e test for a feature
npx tsx tests/e2e/peer-notifications.ts
```

Each test script is self-contained. Exit code `0` = pass, non-zero = fail.

## Layout

```
tests/
  README.md                     # this file
  _shared/
    staging-client.ts           # Supabase + ClickUp helpers, safety guard, assert()
  e2e/
    _inspect-staging.ts         # read-only state dump (debugging aid)
    peer-notifications.ts       # feature: peer comment fan-out across org members
    <next-feature>.ts           # add one per complex feature
```

## Writing a new e2e test

1. Add one `.ts` file under `tests/e2e/`.
2. Import helpers from `../_shared/staging-client`.
3. Structure:
   ```ts
   async function setup(): Promise<TestContext> { /* create org + users + ClickUp task */ }
   async function cleanup(ctx: TestContext): Promise<void> { /* delete everything */ }
   async function run() {
     const ctx = await setup()
     try {
       // scenario 1
       // scenario 2
     } finally {
       await cleanup(ctx)
     }
   }
   run().catch(e => { console.error(e); process.exit(1) })
   ```
4. Use `assert(cond, msg)` for checks — fail-fast with a clear message.
5. Document the scenarios at the top of the file as a comment block.

## Shared helpers (`_shared/staging-client.ts`)

- `adminClient()` — service-role Supabase client (bypasses RLS)
- `anonClient()` — anon Supabase client (use for auth.signIn)
- `signInAs(email, password)` — returns `{ client, userId, token }`
- `callEdgeFunction(name, token, body)` — POSTs to `${STAGING_URL}/functions/v1/{name}`
- `clickupCall(path, init)` — wraps ClickUp v2 API with auth header
- `createClickupTestTask(name)` / `deleteClickupTask(id)` — sandbox lifecycle
- `assert(cond, msg)` — throws on false

## What NOT to automate

- Email inbox verification (Mailjet side). Verify the **code path** executed (DB state, edge-function logs) — trust the tail of the fan-out if inserts happened successfully.
- Visual/UX checks — out of scope for e2e tests; those go to manual or Playwright.
- RLS policy fuzzing — unless the feature specifically needs it.
