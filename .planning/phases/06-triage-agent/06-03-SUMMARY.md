---
phase: 06-triage-agent
plan: "03"
subsystem: backend
tags: [webhook, triage, hitl, edge-functions, clickup]
dependency_graph:
  requires:
    - phase: 06-02
      provides:
        - supabase/functions/triage-agent/index.ts
        - agent_jobs table schema
  provides:
    - clickup-webhook taskCreated → triage-agent routing for monitored lists
    - clickup-webhook HITL detection: [approve]/[reject] → agent_jobs updates
    - sync-staging-secrets.ts with TRIAGE_ENABLED_LIST_IDS, WP_MCP_USER, WP_MCP_APP_PASS
  affects:
    - supabase/functions/clickup-webhook/index.ts
    - scripts/sync-staging-secrets.ts
tech_stack:
  added: []
  patterns:
    - supabase.functions.invoke fire-and-forget (not awaited) for non-blocking triage invocation
    - HITL regex patterns anchored case-insensitive: [approve], [approve: Xh Ycr], [reject: reason]
    - handleTriageHitl placed before checkCommentThreadContext to avoid thread-context filter dropping HITL commands
    - TRIAGE_ENABLED_LIST_IDS env var as gate for monitored list routing
key_files:
  created: []
  modified:
    - supabase/functions/clickup-webhook/index.ts
    - scripts/sync-staging-secrets.ts
decisions:
  - "handleTaskCreated placed OUTSIDE project routing block — project tasks already return before this point; triage runs on non-project taskCreated events"
  - "handleTriageHitl must be placed BEFORE checkCommentThreadContext — the thread-context filter passes only client-facing comments, silently dropping [approve]/[reject] HITL commands if placed after"
  - "taskCreated triage block returns after handleTaskCreated call — avoids falling through to ticket handlers which have no meaningful taskCreated logic"
  - "Fire-and-forget invocation: supabase.functions.invoke is not awaited — triage-agent runs asynchronously, webhook returns 200 immediately"
metrics:
  duration_minutes: 3
  completed_date: "2026-04-06"
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 2
---

# Phase 06 Plan 03: Webhook Triage Routing and HITL Detection Summary

**One-liner:** Surgical webhook extension — taskCreated events for monitored ClickUp lists invoke triage-agent fire-and-forget; [approve]/[reject] developer comments update agent_jobs HITL status before the thread-context filter can drop them.

## What Was Built

Two surgical additions to the existing ~1990-line `clickup-webhook/index.ts` Edge Function, plus a 4-line addition to `sync-staging-secrets.ts`.

### 1. `handleTaskCreated` (module-level function, lines 404-475)

Receives a `taskCreated` webhook payload, fetches full task details from the ClickUp API (name, description, list_id), checks if the list is in `TRIAGE_ENABLED_LIST_IDS`, looks up `profile_id` from `task_cache`, and invokes `triage-agent` fire-and-forget via `supabase.functions.invoke`. Returns immediately without awaiting the invocation — the webhook always returns 200 without blocking on AI processing.

Silently skips if:
- `TRIAGE_ENABLED_LIST_IDS` is empty/unset
- `CLICKUP_API_TOKEN` is missing
- Task fetch fails
- list_id not in enabled list

### 2. `handleTriageHitl` (module-level function, lines 476-548)

Detects developer HITL responses in ClickUp comments using three anchored case-insensitive regex patterns:
- `[approve]` → updates agent_jobs to `status: approved, hitl_action: approved`
- `[approve: Xh Ycr]` → same + stores `hitl_hours` and `hitl_credits`
- `[reject: reason]` → updates to `status: rejected, hitl_action: rejected, hitl_comment: reason`

Finds the most recent `awaiting_hitl` job for the task via `agent_jobs` query. Non-HITL comments pass through silently (no early return). Always continues to existing notification logic.

### 3. Webhook call sites

- **taskCreated route** (after line `END PROJECT ROUTING`, ~line 1177): calls `await handleTaskCreated(payload, supabase, log)` then returns `{ success: true, context: "triage_check" }` — only for non-project tasks.
- **taskCommentPosted route** (~line 1781): calls `await handleTriageHitl(payload, supabase, log)` immediately after `isPortalOriginatedComment` early return, before `checkCommentThreadContext`. This placement is critical.

### 4. `sync-staging-secrets.ts` allow-list update

Added 3 entries with `action: "copy"` before `GOTRUE_HOOK_SEND_EMAIL_URI`:
- `TRIAGE_ENABLED_LIST_IDS`
- `WP_MCP_USER`
- `WP_MCP_APP_PASS`

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add handleTaskCreated and handleTriageHitl to clickup-webhook | f184779 | supabase/functions/clickup-webhook/index.ts |
| 2 | Add triage secrets to sync-staging-secrets allow-list | b8cd50c | scripts/sync-staging-secrets.ts |

## Decisions Made

- **handleTaskCreated placement outside project routing block:** Project taskCreated events already return inside the project routing block with `{ success: true, context: "project" }`. The new triage handler runs only for non-project tasks (or tasks where project routing failed), placed after `// ============ END PROJECT ROUTING`.
- **handleTriageHitl BEFORE checkCommentThreadContext:** The `checkCommentThreadContext` + `resolveClientFacingCommentEvent` pipeline only passes client-facing comments (those with `@client:` prefix or in client-facing threads). Internal developer comments like `[approve]` would be dropped by `if (!commentEvent.shouldNotify) return`. Placing HITL detection before this filter ensures HITL commands are always processed.
- **taskCreated block returns after triage call:** Added an explicit return after `handleTaskCreated` to avoid falling through to ticket handlers that have no `taskCreated` handling (those would just hit the final "Event ignored" response anyway, but returning early is cleaner).

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria met.

The plan indicated `handleTriageHitl` could be placed "at the END of the taskCommentPosted handler" in CONTEXT.md but then PLAN.md corrected this to "BEFORE checkCommentThreadContext" which was implemented as specified.

## Known Stubs

None — all changes are complete implementations.

## Self-Check: PASSED

Files modified:
- [x] supabase/functions/clickup-webhook/index.ts — EXISTS (2151 lines, up from 1991)
- [x] scripts/sync-staging-secrets.ts — EXISTS (3 new entries at lines 238-240)

Commits verified:
- [x] f184779 — feat(06-03): extend clickup-webhook with triage routing and HITL detection
- [x] b8cd50c — chore(06-03): add triage secrets to sync-staging-secrets allow-list

Acceptance criteria verified:
- [x] `grep -c "handleTaskCreated"` returns 4 (definition + comment + call + inner taskId check) — at least 2 ✓
- [x] `grep -c "handleTriageHitl"` returns 3 (definition + comment + call) — at least 2 ✓
- [x] `TRIAGE_ENABLED_LIST_IDS` present in webhook (3 occurrences) ✓
- [x] `functions.invoke.*triage-agent` present (line 464) ✓
- [x] No `await` before `supabase.functions.invoke` (line 464 has no leading await) ✓
- [x] `[approve]` regex pattern present (line 491) ✓
- [x] `awaiting_hitl` referenced (lines 499, 504, 510) ✓
- [x] `hitl_action`, `hitl_hours`, `hitl_credits`, `hitl_comment` all present (7 occurrences) ✓
- [x] `END PROJECT ROUTING` marker still present (line 1175) ✓
- [x] `isPortalOriginatedComment` still present (lines 12, 1026, 1771) ✓
- [x] `checkCommentThreadContext` still present and called after HITL (lines 549, 1036, 1790) ✓
- [x] File size increased from 1991 to 2151 lines ✓
- [x] No `model_used` or `claude-haiku` in webhook file ✓
- [x] sync-staging-secrets: TRIAGE_ENABLED_LIST_IDS line 238 < GOTRUE line 242 ✓
- [x] sync-staging-secrets: WP_MCP_USER line 239 < GOTRUE line 242 ✓
- [x] sync-staging-secrets: WP_MCP_APP_PASS line 240 < GOTRUE line 242 ✓
- [x] sync-staging-secrets: OPENROUTER_API_KEY still present (line 236) ✓
- [x] sync-staging-secrets: GOTRUE_HOOK_SEND_EMAIL_URI still present (line 242) ✓
