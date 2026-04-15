---
phase: 13-org-onboarding-cleanup
plan: "04"
subsystem: scripts
tags: [onboarding, organizations, org-first, typescript]
dependency_graph:
  requires: [org_members table (Phase 9), organizations table (Phase 9)]
  provides: [org-first onboarding script]
  affects: [scripts/onboard-client.ts]
tech_stack:
  added: []
  patterns: [org-first creation, slug collision loop, rollback on partial failure]
key_files:
  created: []
  modified:
    - scripts/onboard-client.ts
decisions:
  - deriveOrgSlug derives slug from email domain (SQL-equivalent: lower(regexp_replace(split_part(email, '@', 2), '\.[^.]+$', '')))
  - deriveUniqueSlug probes up to 5 slug candidates before throwing — matches uniqueness constraint in organizations table
  - Rollback on Step 2-4 failure deletes both auth user and org row (cascade covers org_members)
  - credit_transactions keeps both profile_id AND organization_id for audit trail (ORG-CLEANUP-03 requirement)
  - members[] failures are non-fatal (console.warn + continue) — partial team setup does not abort org creation
  - client_workspaces and credit_packages write organization_id only (no profile_id) to match Phase 13-03 post-migration schema
metrics:
  duration: "8 minutes"
  completed: "2026-04-15"
  tasks_completed: 2
  files_modified: 1
---

# Phase 13 Plan 04: Org-First Onboarding Script Rewrite — Summary

**One-liner:** Rewrote `onboard-client.ts` to create `organizations` row first, derive unique slug, and write `organization_id` (not `profile_id`) to `client_workspaces` and `credit_packages`.

## What Was Built

Complete rewrite of `scripts/onboard-client.ts` with a 9-step org-first creation flow:

| Step | Action | Key Change |
|------|--------|------------|
| 1 | Create `organizations` row | NEW — slug derived from email domain, collision-checked |
| 2 | Create auth user | Was Step 1; rollback now also deletes org |
| 3 | Create `profiles` row | No legacy org fields (no clickup_list_ids etc.) |
| 4 | Create `org_members` row (admin) | NEW |
| 5 | Create `client_workspaces` rows | Uses `organization_id`, no `profile_id` |
| 6 | Create `credit_packages` + `credit_transactions` | Uses `organization_id`; transactions keep `profile_id` |
| 7 | Create `project_access` rows | Unchanged logic |
| 8 | Create additional `members[]` | NEW — per-member auth user + profile + org_members |
| 9 | Trigger initial task sync | Renumbered, logic unchanged |

### New Interfaces

**`MemberConfig`** — describes additional org members:
```typescript
interface MemberConfig {
  email: string;
  password?: string;
  fullName: string;
  role?: 'member' | 'viewer';  // default: 'member'
}
```

**`ClientConfig`** — replaced `company` with `orgName`, added `orgSlug?` and `members?`:
```typescript
interface ClientConfig {
  orgName: string;         // was: company
  orgSlug?: string;        // auto-derived if omitted
  members?: MemberConfig[];  // NEW
  // ... rest unchanged
}
```

### Slug Logic

`deriveOrgSlug(email)` — mirrors Phase 9 SQL migration exactly:
- Takes email domain, strips TLD, lowercases, truncates to 30 chars
- Example: `max@muster.at` → `muster`

`deriveUniqueSlug(supabase, email, override?)` — collision-safe:
- Tries `base`, `base-2`, ..., `base-5`
- Throws after 5 attempts with descriptive error

### Rollback Behaviour

| Failure Point | Rollback |
|---------------|---------|
| Step 1 (org insert) | `process.exit(1)` only — nothing to clean up |
| Step 2 (auth user) | Delete org row |
| Step 3 (profile) | Delete auth user + org row |
| Step 4 (org_members) | Delete auth user + org row |
| Steps 5+ | `process.exit(1)` — org ID logged for manual cleanup |

## Deviations from Plan

None — plan executed exactly as written. Both tasks implemented in a single file write.

## Known Stubs

None — script is complete. Not runnable against staging until Plan 13-03 has been applied (column drops on `client_workspaces` and `credit_packages` removing `profile_id NOT NULL` constraint).

## Threat Surface Scan

No new network endpoints. Script is admin-only, run locally with service role key. No change to trust surface vs. old script.

## Self-Check

- [x] `scripts/onboard-client.ts` exists and is modified
- [x] `npx tsx --check scripts/onboard-client.ts` exits 0
- [x] `ClientConfig` has `orgName` not `company`
- [x] `MemberConfig` interface exists
- [x] `main()` creates `organizations` row (line 237) before `auth.admin.createUser` (line 258)
- [x] `client_workspaces` insert uses `organization_id` only — no `profile_id`
- [x] `credit_packages` insert uses `organization_id` only — no `profile_id`
- [x] `credit_transactions` insert has both `profile_id` AND `organization_id`
- [x] `members[]` loop uses `console.warn` + `continue` (non-fatal per member)
- [x] Rollback on Steps 2–4 deletes auth user and org row
- [x] Commit `b6b9b57` exists

## Self-Check: PASSED
