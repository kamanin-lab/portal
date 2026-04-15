---
phase: 13-org-onboarding-cleanup
verified: 2026-04-15T12:00:00Z
status: passed
score: 5/5
overrides_applied: 0
---

# Phase 13: org-onboarding-cleanup Verification Report

**Phase Goal:** The onboarding script creates orgs as first-class entities, all legacy `profile_id`-based policies and columns are removed, and Edge Functions read exclusively from `organizations` with no fallback debt.
**Verified:** 2026-04-15T12:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running `onboard-client.ts` creates org first, then admin user, then `org_members` row, and accepts `members[]` | VERIFIED | Line 237 `organizations` insert precedes line 258 `auth.admin.createUser`; `MemberConfig` interface + Step 8 loop present; `ClientConfig.members?: MemberConfig[]` declared |
| 2 | `pg_policies` view shows zero rows with `profile_id = auth.uid()` on `credit_packages` and `client_workspaces` | VERIFIED (staging) | Migration `20260416130000_remove_legacy_profile_rls.sql` applied; SUMMARY-03 staging checkpoint: 0 rows confirmed |
| 3 | `credit_packages` and `client_workspaces` tables have no `profile_id` column | VERIFIED (staging) | Migration Section 3 drops `credit_packages.profile_id CASCADE` and `client_workspaces.profile_id CASCADE`; staging verification: 0 rows |
| 4 | All four updated Edge Functions contain no `?? profile?.field` dual-read fallback patterns | VERIFIED | `grep -r "?? profile?." supabase/functions/{fetch-clickup-tasks,fetch-single-task,create-clickup-task,nextcloud-files}` → zero matches; all four read exclusively from `org` via `getOrgForUser()` |
| 5 | `profiles` table has no `clickup_list_ids`, `nextcloud_client_root`, `support_task_id`, `clickup_chat_channel_id` columns | VERIFIED (staging) | Migration Section 4 drops all four columns + `DROP TRIGGER IF EXISTS on_profile_list_change`; staging verification: 0 rows |

**Score:** 5/5 truths verified

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| ORG-CLEANUP-01 | `onboard-client.ts` rewritten org-first with `members[]` | SATISFIED | `organizations` insert at line 237, `auth.admin.createUser` at line 258; `members[]` loop at Step 8 |
| ORG-CLEANUP-02 | Legacy `profile_id = auth.uid()` RLS policies dropped | SATISFIED | Migration drops `"Users see own packages"` and `"Users see own workspaces"`; staging checkpoint passed |
| ORG-CLEANUP-03 | `profile_id` FK dropped from `credit_packages` and `client_workspaces` (retained in `credit_transactions`) | SATISFIED | Migration Section 3; `credit_transactions` insert in script retains both `profile_id` AND `organization_id` |
| ORG-CLEANUP-04 | Dual-read fallbacks removed from all 4 Edge Functions | SATISFIED | Zero `?? profile?.` matches in all four files; zero `profiles` query in nextcloud-files and fetch-clickup-tasks |
| ORG-CLEANUP-05 | Four legacy columns dropped from `profiles` | SATISFIED | Migration Section 4; staging checkpoint passed |

All 5 requirements marked `[x]` complete in REQUIREMENTS.md.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/onboard-client.ts` | Org-first onboarding script | VERIFIED | 499 lines; org insert on line 237, auth user on line 258, `org_members` on line 294, members loop on line 388 |
| `supabase/functions/fetch-clickup-tasks/index.ts` | No dual-read, org-only | VERIFIED | Uses `getOrgForUser()` at line 369; no `profiles` query anywhere |
| `supabase/functions/fetch-single-task/index.ts` | No dual-read, org-only | VERIFIED | Uses `getOrgForUser()` at line 218; no `profiles` query |
| `supabase/functions/create-clickup-task/index.ts` | No dual-read; narrow `profiles.full_name` read kept | VERIFIED | `getOrgForUser()` at line 301; narrow `profiles.select("full_name")` at line 314; `org.clickup_list_ids` and `org.clickup_chat_channel_id` used directly |
| `supabase/functions/nextcloud-files/index.ts` | No dual-read, org-only | VERIFIED | `getOrgForUser()` imported and used; zero `profiles` matches in file |
| `supabase/migrations/20260416130000_remove_legacy_profile_rls.sql` | Migration file | VERIFIED | Exists in `supabase/migrations/` |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `create-clickup-task` | `organizations` | `getOrgForUser()` | WIRED | `org.clickup_list_ids` and `org.clickup_chat_channel_id` read from org object |
| `create-clickup-task` | `profiles.full_name` | narrow `.select("full_name")` | WIRED | Single `.maybeSingle()` query scoped to `user.id`; no other profiles fields read |
| `fetch-clickup-tasks` | `organizations` | `getOrgForUser()` | WIRED | `org.clickup_list_ids` used at line 377 |
| `fetch-single-task` | `organizations` | `getOrgForUser()` | WIRED | `org.clickup_list_ids` used at line 226 |
| `nextcloud-files` | `organizations` | `getOrgForUser()` | WIRED | `org?.nextcloud_client_root ?? null` pattern replaces old profiles query |
| `onboard-client.ts` | `organizations` (Step 1) | Supabase insert | WIRED | Insert happens before all other steps; org ID captured and passed to subsequent inserts |
| `onboard-client.ts` | `org_members` (Step 4) | Supabase insert | WIRED | `organization_id: orgId`, `profile_id: userId`, `role: "admin"` |
| `client_workspaces` insert | `organization_id` | Step 5 | WIRED | `organization_id: orgId` only — no `profile_id` field in insert object |
| `credit_packages` insert | `organization_id` | Step 6 | WIRED | `organization_id: orgId` only — no `profile_id` field |

---

## Anti-Patterns Found

No blockers or warnings. Scan results:

- Zero `?? profile?.` patterns in all four Edge Functions
- Zero `profiles.select(` in `fetch-clickup-tasks`, `fetch-single-task`, `nextcloud-files`
- `create-clickup-task` has exactly one `profiles.select("full_name")` — this is intentional per plan decision (full_name is a person attribute not stored in organizations)
- `onboard-client.ts` has no legacy profile org-config fields in `profiles.upsert()` calls (Step 3 and Step 8 member loop)
- Migration file is a clean, idempotent SQL file with IF EXISTS guards throughout

---

## Behavioral Spot-Checks

Step 7b: SKIPPED — script requires live Supabase connection; Edge Functions require deployed Deno runtime. Cannot test without running services.

The staging checkpoint documented in SUMMARY-03 serves as the human-executed equivalent for the database migration claims.

---

## Human Verification Required

None — all five success criteria are either fully verifiable in code (SC-1, SC-4) or confirmed via documented staging checkpoint by the implementer (SC-2, SC-3, SC-5). The staging checkpoint results are considered trusted evidence given the explicit before/after row counts provided in SUMMARY-03.

---

## Gaps Summary

No gaps. All five success criteria pass.

---

_Verified: 2026-04-15T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
