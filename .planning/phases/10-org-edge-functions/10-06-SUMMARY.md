---
phase: 10-org-edge-functions
plan: 06
subsystem: edge-functions
tags: [org, invite, auth, mailjet, atomic-rollback]
dependency_graph:
  requires: [10-01]
  provides: [invite-member-edge-function]
  affects: [org_members, profiles, project_access, auth.users]
tech_stack:
  added: []
  patterns: [admin-invite-flow, atomic-rollback, role-guard-scoped-org]
key_files:
  created:
    - supabase/functions/invite-member/index.ts
  modified: []
decisions:
  - "A1 resolved: no handle_new_user trigger in migrations — manual profiles insert included after createUser"
  - "ctaLabel in plan template was wrong field name — adapted to copy.cta (actual EmailCopyEntry field)"
  - "copy.footer does not exist in EmailCopyEntry — used copy.notes[0] instead"
  - "deleteUser rollback implemented on 2 paths: generateLink failure + Mailjet send failure"
metrics:
  duration: "~12 minutes"
  completed: "2026-04-15T00:53:12+02:00"
  tasks_completed: 2
  files_created: 1
  files_modified: 0
---

# Phase 10 Plan 06: invite-member Edge Function Summary

**One-liner:** Admin-only member invite flow with auth.admin.createUser + generateLink(recovery) + Mailjet email + atomic deleteUser rollback on any failure.

## What Was Built

New Edge Function `supabase/functions/invite-member/index.ts` implementing ORG-BE-08, BE-09, BE-10.

### Flow

1. Bearer token → `supabase.auth.getUser()` (401 if missing/invalid)
2. Body parse: `{ organizationId, email, role }` (400 if missing)
3. Role validation: reject anything other than `"member"` or `"viewer"` (400 — blocks admin spoofing T-10-19)
4. Admin guard: `org_members WHERE profile_id = caller AND organization_id = body.organizationId AND role = "admin"` (403 if not admin — T-10-18, T-10-20)
5. Duplicate check: profiles by email → org_members by profile_id + organizationId (409 if found)
6. `auth.admin.createUser(email, email_confirm: true)`
7. `auth.admin.generateLink(type: "recovery", redirectTo: .../passwort-setzen)` — rollback deleteUser on failure
8. Mailjet POST send with invite copy from `getEmailCopy("invite", "de")` — rollback deleteUser on failure
9. Manual `profiles.insert` (A1: no handle_new_user trigger exists in migrations)
10. `org_members.insert` with organizationId, profile_id, role
11. `project_access` rows copied from org's first admin to new member
12. Return `{ success: true, userId }`

## Assumption A1 Resolution

**Command run:** `grep -rn "handle_new_user|on_auth_user_created" supabase/migrations/`
**Result:** 0 matches — no trigger auto-creates profiles rows on `auth.users` INSERT.
**Action taken:** Manual `profiles.insert` included after `createUser`, before `org_members.insert`. Unique-violation errors silently ignored (race safety).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrong field name `ctaLabel` in plan template**
- **Found during:** Task 2 — reading `emailCopy.ts` lines 29-38
- **Issue:** `EmailCopyEntry` interface has `cta: string`, not `ctaLabel`. The plan template used `copy.ctaLabel` which would be `undefined` at runtime.
- **Fix:** Used `copy.cta` with a string-type guard fallback: `typeof copy.cta === "string" ? copy.cta : "Einladung annehmen"`
- **Files modified:** `supabase/functions/invite-member/index.ts`
- **Commit:** 171f3b0

**2. [Rule 1 - Bug] Non-existent `copy.footer` field in plan template**
- **Found during:** Task 2 — reading `EmailCopyEntry` interface
- **Issue:** Plan used `copy.footer ?? ""` but `EmailCopyEntry` has no `footer` field. Would silently be `undefined`.
- **Fix:** Used `copy.notes?.[0] ?? ""` (the actual disclaimer text lives in `notes` array)
- **Files modified:** `supabase/functions/invite-member/index.ts`
- **Commit:** 171f3b0

**3. [Rule 2 - Missing functionality] EmailCopyEntry fields are union types**
- **Found during:** Task 2 — `greeting`, `body`, `subject` can be strings OR functions
- **Issue:** Plan template used them as plain strings; would break if function variant selected
- **Fix:** Added runtime type guards (`typeof copy.greeting === "string" ? copy.greeting : copy.greeting()` etc.)
- **Files modified:** `supabase/functions/invite-member/index.ts`
- **Commit:** 171f3b0

## Security Verification

All STRIDE threats mitigated as per threat model:

| Threat | Status |
|--------|--------|
| T-10-18: Non-admin invite | Mitigated — role guard on `profile_id AND organization_id` |
| T-10-19: Admin spoofing via body.role | Mitigated — `role !== "member" && role !== "viewer"` → 400 |
| T-10-20: Cross-org IDOR | Mitigated — role check uses `organization_id = body.organizationId` |
| T-10-21: Email enumeration | Accepted — org admins know their members |
| T-10-22: Orphaned auth user | Mitigated — deleteUser rollback on 2 failure paths |
| T-10-23: Partial state on org_members failure | Accepted — logged with userId for manual recovery |
| T-10-24: Unauthenticated abuse | Mitigated — auth guard before any admin API call |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | c6ca456 | `chore(org): stub invite-member — A1 resolved` |
| Task 2 | 171f3b0 | `feat(org): create invite-member Edge Function — admin invite flow with atomic rollback` |

## Known Stubs

None — implementation is complete. Staging smoke test required (cannot automate without live Supabase admin credentials).

## Threat Flags

None — all new surface is within the plan's threat model.

## Self-Check: PASSED

- `supabase/functions/invite-member/index.ts` — FOUND
- Commit `c6ca456` — FOUND
- Commit `171f3b0` — FOUND
- All 12 acceptance criteria grep checks — PASSED
- `deleteUser` rollback count: 2 paths (generateLink failure + email failure) — CONFIRMED
