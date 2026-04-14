---
phase: 10-org-edge-functions
plan: "01"
subsystem: supabase-edge-functions
tags: [org, shared-helpers, edge-functions, phase10]
dependency_graph:
  requires: []
  provides:
    - supabase/functions/_shared/org.ts
  affects:
    - supabase/functions/fetch-clickup-tasks/index.ts
    - supabase/functions/fetch-single-task/index.ts
    - supabase/functions/nextcloud-files/index.ts
    - supabase/functions/create-clickup-task/index.ts
    - supabase/functions/clickup-webhook/index.ts
    - supabase/functions/send-reminders/index.ts
    - supabase/functions/post-task-comment/index.ts
    - supabase/functions/update-task-status/index.ts
tech_stack:
  added: []
  patterns:
    - org_members JOIN organizations via !inner syntax
    - jsonb array filter via .contains()
    - service-role-only pattern (documented in file header)
    - dual-read fallback (org first, profiles fallback)
key_files:
  created:
    - supabase/functions/_shared/org.ts
  modified: []
decisions:
  - "clickup_list_ids stored as jsonb — .contains([listId]) filter works against jsonb arrays"
  - "findOrgByListId returns null on >1 match (ambiguity guard, prevents cross-tenant fan-out)"
  - "getUserOrgRole returns null for legacy users with no org_members row — callers treat as member (permissive)"
  - "No default export — named exports only for explicit import discipline"
metrics:
  duration: "< 5 min"
  completed: "2026-04-15"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
---

# Phase 10 Plan 01: _shared/org.ts Org Resolution Helpers — Summary

**One-liner:** Named-export helper module with 5 async functions resolving org config from `org_members JOIN organizations` for all Phase 10 Edge Functions.

---

## What Was Done

Created `supabase/functions/_shared/org.ts` — the shared prerequisite for all Wave 1+ plans in Phase 10. This is a pure helper module: no router registration needed, no RLS changes, no schema changes.

### Exported symbols

| Symbol | Type | Purpose |
|--------|------|---------|
| `OrgConfig` | interface | Typed return shape for org config fields |
| `getOrgForUser` | async function | Resolves org config via org_members JOIN organizations; returns null for legacy users |
| `getOrgMemberIds` | async function | Returns all profile_ids for a given org (used for webhook fan-out) |
| `getUserOrgRole` | async function | Returns role string or null (no org_members row = null = permissive fallback) |
| `findOrgByListId` | async function | Finds org by jsonb clickup_list_ids contains filter; null on ambiguity (>1 match) |
| `findOrgBySupportTaskId` | async function | Finds org by support_task_id for support chat fan-out |

### Security design

- All functions require a **service role client** passed by the caller — documented in file header
- `getOrgForUser` filters strictly by `profile_id = userId` — no cross-tenant leakage
- `findOrgByListId` returns null on >1 match — prevents cross-tenant fan-out when list appears in multiple orgs
- No anon client fallback — silent empty rows would be a silent security failure

---

## Acceptance Criteria Verification

| Check | Command | Result |
|-------|---------|--------|
| File exists | `test -f supabase/functions/_shared/org.ts` | PASS |
| Export count >= 6 | `grep -c "^export" org.ts` | **6** (1 interface + 5 functions) |
| `organizations!inner` present | `grep -c "organizations!inner" org.ts` | **1** |
| `contains("clickup_list_ids"` present | `grep -c 'contains("clickup_list_ids"' org.ts` | **1** |
| esm.sh import `@supabase/supabase-js@2.47.10` | `grep -c "esm.sh/..."` | **1** |
| No default export | `grep -c "export default" org.ts` | **0** |
| `deno check` | deno not installed | SKIPPED |

---

## Commit

| Hash | Message |
|------|---------|
| `ac4c623` | `feat(org): add _shared/org.ts — org resolution helpers for Phase 10` |

---

## Deviations from Plan

None — plan executed exactly as written. File content matches the verbatim specification from the plan.

---

## Known Stubs

None.

---

## Threat Flags

No new network endpoints introduced. This is a pure helper module — no request handlers, no RLS changes. Threat model from plan applied as designed (service-role-only, strict userId filter, ambiguity guard).

---

## Self-Check: PASSED

- `supabase/functions/_shared/org.ts` — EXISTS
- Commit `ac4c623` — EXISTS (`git log --oneline | grep ac4c623`)
- All 6 acceptance criteria — PASSED
