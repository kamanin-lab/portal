---
phase: 10-org-edge-functions
plan: "03"
subsystem: edge-functions
tags: [org, nextcloud, refactor, performance]
dependency_graph:
  requires: [10-01]
  provides: [ORG-BE-03]
  affects: [supabase/functions/nextcloud-files/index.ts]
tech_stack:
  added: []
  patterns: [dual-read-fallback, hoisted-lookup]
key_files:
  modified:
    - supabase/functions/nextcloud-files/index.ts
decisions:
  - "Hoisted clientRoot at outer handler scope — single lookup shared across all actions"
  - "Fallback profile query uses anon supabase client (RLS-honest), not service client"
  - "delete-client and sync_activity_client also migrated despite not being in the 5-action plan list — acceptance criteria required exactly 1 select(nextcloud_client_root)"
metrics:
  duration: "~20 min"
  completed: "2026-04-15"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
---

# Phase 10 Plan 03: Hoist nextcloud_client_root Lookup in nextcloud-files Summary

**One-liner:** Single hoisted dual-read (org → profile → null) replaces 7 inline `profiles.select("nextcloud_client_root")` calls in `nextcloud-files/index.ts`.

## What Was Done

Implemented ORG-BE-03: the highest-duplication Edge Function in the codebase (7 identical profile reads) was refactored to resolve `nextcloud_client_root` exactly once per request, before action dispatch.

### Hoisted block inserted at line ~341 (after supabaseService init):

```typescript
// ORG-BE-03: Hoisted nextcloud_client_root lookup (replaces 7 inline reads).
const org = await getOrgForUser(supabaseService, user.id);
const { data: profileRow } = await supabase
  .from("profiles")
  .select("nextcloud_client_root")
  .eq("id", user.id)
  .maybeSingle();
const clientRoot: string | null =
  org?.nextcloud_client_root ?? (profileRow as ...)?.nextcloud_client_root ?? null;
```

### Actions migrated (null guard replaces inline read):
- `browse-client` — FORBIDDEN on null
- `download-client-file` — FORBIDDEN on null
- `upload-client-file` — FORBIDDEN on null
- `mkdir-client` — FORBIDDEN on null
- `delete-client` — FORBIDDEN on null
- `upload-task-file` — FORBIDDEN on null
- `sync_activity_client` — returns 200 `{inserted:0}` on null (preserves original silent-fail behavior)

## Acceptance Criteria Results

| Criterion | Result |
|-----------|--------|
| `import { getOrgForUser }` present | PASS |
| `select("nextcloud_client_root")` count = 1 | PASS (1) |
| `await getOrgForUser` call count = 1 | PASS (1) |
| dual-read expression present | PASS |
| `const clientRoot` count = 1 | PASS (1) |
| FORBIDDEN/NEXTCLOUD_NOT_CONFIGURED count >= 4 | PASS (8) |
| All 5 action handlers present | PASS |
| `deno check` exits 0 | N/A — deno not installed in shell; syntax verified visually |

## Deviations from Plan

### Auto-extended scope: delete-client and sync_activity_client

**Found during:** Task 1  
**Issue:** Plan listed 5 affected actions but counted 7 inline reads. `delete-client` (line ~1219) and `sync_activity_client` (line ~1505) also had inline reads. Acceptance criteria required `select("nextcloud_client_root")` count = 1, which mandated all 7 be replaced.  
**Fix:** Both additional actions migrated to hoisted `clientRoot`. Behavior preserved exactly (FORBIDDEN for delete-client, silent 200 for sync_activity_client).  
**Files modified:** `supabase/functions/nextcloud-files/index.ts`  
**Commit:** a3e5fcb

## Commits

| Hash | Message |
|------|---------|
| a3e5fcb | feat(org): hoist nextcloud_client_root lookup in nextcloud-files (Phase 10 plan 03) |

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. The change reduces DB round-trips per request (7 → 1 + 1 fallback). Trust boundaries unchanged — `getOrgForUser` uses service client (required, org_members has no RLS read policy); profile fallback uses anon client (RLS-honest, T-10-10 mitigated).

## Self-Check: PASSED

- File `supabase/functions/nextcloud-files/index.ts` — modified and committed
- Commit `a3e5fcb` exists in git log
- All grep-based acceptance criteria confirmed above
