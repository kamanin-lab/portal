---
phase: 05-data-unification-polish
plan: 03
subsystem: api
tags: [nextcloud, webdav, clickup-webhook, edge-functions, deno, slugify]

# Dependency graph
requires:
  - phase: 05-00
    provides: Nextcloud slugify shared utility (_shared/slugify.ts)
provides:
  - Auto-creation of Nextcloud task folder on ClickUp taskCreated webhook event
  - createNextcloudFolder helper with recursive MKCOL and graceful failure
affects: [projects-module, nextcloud-files, step-files-tab]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Best-effort side-effect pattern: non-fatal async operation in webhook handler with try/catch isolation"
    - "Recursive MKCOL for WebDAV directory creation (create each path segment)"
    - "fetchWithTimeout reuse for all outbound HTTP in webhook"

key-files:
  created: []
  modified:
    - supabase/functions/clickup-webhook/index.ts

key-decisions:
  - "createNextcloudFolder failure is intentionally non-fatal — webhook must always return 200 to ClickUp"
  - "Recursive MKCOL stops on first failure to avoid orphaned subdirectory creation"
  - "5s timeout on MKCOL calls to prevent webhook blocking"

patterns-established:
  - "Non-fatal side-effect pattern: wrap in try/catch, log error, never break primary response"

requirements-completed: [DATA-02]

# Metrics
duration: 15min
completed: 2026-03-30
---

# Phase 05 Plan 03: Nextcloud Auto-Folder on taskCreated Summary

**WebDAV MKCOL auto-folder creation in clickup-webhook on taskCreated using shared slugify path construction**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-30T00:00:00Z
- **Completed:** 2026-03-30T00:15:00Z
- **Tasks:** 1 of 2 (Task 2 is human-verify checkpoint)
- **Files modified:** 1

## Accomplishments
- Added `import { slugify, buildChapterFolder }` from `_shared/slugify.ts` to clickup-webhook
- Implemented `createNextcloudFolder` helper with recursive MKCOL (creates each path segment) and 5s timeout
- Inserted mkdir call in `taskCreated` branch after `project_task_cache` upsert — fetches `project_config.nextcloud_root_path` and `chapter_config.sort_order/title` to build path `{root}/{chapterFolder}/{slugifiedTaskName}`
- Failure is non-fatal: caught in try/catch, logged as error, webhook always returns 200

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Nextcloud mkdir to clickup-webhook taskCreated branch** - `6f8a070` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `supabase/functions/clickup-webhook/index.ts` - Added slugify import, createNextcloudFolder helper, mkdir call in taskCreated branch

## Decisions Made
- `createNextcloudFolder` failure is intentionally non-fatal — ClickUp must always receive 200 from webhooks
- Recursive MKCOL stops on first failure to prevent orphaned child directories without parents
- 5-second timeout on MKCOL calls (vs 10s default for API calls) to keep webhook latency bounded
- `fetchWithTimeout` reused for MKCOL calls (already in file) — no new fetch utility needed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**External service requires manual configuration.**

The `clickup-webhook` Edge Function now calls Nextcloud WebDAV and requires these env vars available in its runtime:

| Var | Source |
|-----|--------|
| `NEXTCLOUD_URL` | Copy from `nextcloud-files` Edge Function env in Coolify |
| `NEXTCLOUD_USER` | Copy from `nextcloud-files` Edge Function env in Coolify |
| `NEXTCLOUD_PASS` | Copy from `nextcloud-files` Edge Function env in Coolify |

**Steps:**
1. Open Coolify dashboard
2. Navigate to Supabase service -> Environment Variables
3. Verify NEXTCLOUD_URL, NEXTCLOUD_USER, NEXTCLOUD_PASS are either global (available to all Edge Functions) or add them to the clickup-webhook function's env
4. If vars are missing: copy values from the nextcloud-files function's env config
5. Redeploy Edge Functions if env vars were added
6. Create a test task in the ClickUp test folder and verify the Nextcloud folder appears

Note: If env vars are missing at runtime, the function logs a warning and gracefully skips folder creation — no webhook errors will occur.

## Next Phase Readiness
- Task 2 is a human-verify checkpoint requiring Coolify env var confirmation and live test
- After env vars confirmed, folder auto-creation is fully operational
- StepFilesTab will find files immediately after task creation (no more "Noch keine Dateien" for newly created tasks)

---
*Phase: 05-data-unification-polish*
*Completed: 2026-03-30*
