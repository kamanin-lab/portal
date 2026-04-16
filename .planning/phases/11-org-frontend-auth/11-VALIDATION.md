---
phase: 11
slug: org-frontend-auth
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-15
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + @testing-library/react |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test -- --run src/shared/hooks/__tests__/useOrg.test.ts` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command for changed module
- **After every plan wave:** Run `npm run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 0 | ORG-FE-AUTH-01 | T-11-01 | `org_members` readable by authenticated user (self only) | migration | `npm run test` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | ORG-FE-AUTH-01 | — | `useOrg()` throws outside OrgProvider | unit | `npm run test -- --run src/shared/hooks/__tests__/useOrg.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-03 | 01 | 1 | ORG-FE-AUTH-01 | — | Legacy fallback: no org_members row → default member state | unit | `npm run test -- --run src/shared/hooks/__tests__/useOrg.test.ts` | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 2 | ORG-FE-AUTH-02 | — | `useWorkspaces` queries by `organization_id` not `profile_id` | unit | `npm run test -- --run src/shared/hooks/__tests__/useWorkspaces.test.ts` | ✅ | ⬜ pending |
| 11-03-01 | 03 | 2 | ORG-FE-AUTH-03 | — | `useCredits` calls `get_org_credit_balance` RPC with org id | unit | `npm run test -- --run src/modules/tickets/hooks/__tests__/useCredits.test.ts` | ❌ W0 | ⬜ pending |
| 11-04-01 | 04 | 3 | ORG-FE-AUTH-04 | — | Viewer: NewTaskButton not rendered in TicketsPage | component | `npm run test -- --run src/modules/tickets/pages/__tests__/TicketsPage.test.tsx` | ❌ W0 | ⬜ pending |
| 11-04-02 | 04 | 3 | ORG-FE-AUTH-05 | — | Viewer: CreditApproval not rendered | component | `npm run test -- --run src/modules/tickets/components/__tests__/CreditApproval.test.tsx` | ❌ W0 | ⬜ pending |
| 11-04-03 | 04 | 3 | ORG-FE-AUTH-06 | — | Viewer: TaskActions not rendered | component | `npm run test -- --run src/modules/tickets/components/__tests__/TaskActions.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/shared/hooks/__tests__/useOrg.test.ts` — stubs for ORG-FE-AUTH-01 (OrgProvider tests)
- [ ] `src/modules/tickets/hooks/__tests__/useCredits.test.ts` — stubs for ORG-FE-AUTH-03
- [ ] `src/modules/tickets/pages/__tests__/TicketsPage.test.tsx` — stubs for ORG-FE-AUTH-04
- [ ] `src/modules/tickets/components/__tests__/CreditApproval.test.tsx` — stubs for ORG-FE-AUTH-05
- [ ] `src/modules/tickets/components/__tests__/TaskActions.test.tsx` — stubs for ORG-FE-AUTH-06

*Note: `useWorkspaces.test.ts` already exists — update existing tests, no new stub needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Viewer cannot see NewTaskButton in live browser | ORG-FE-AUTH-04 | Role assignment requires Supabase Auth + org_members row | Log in as viewer-role user on staging, navigate to /tickets, confirm button absent |
| Admin sees all action buttons | ORG-FE-AUTH-06 | Requires real auth session | Log in as admin, open task in CLIENT REVIEW, confirm Freigeben/Änderungen visible |
| Legacy user (no org_members row) sees full UI | ORG-FE-AUTH-01 | Fallback path requires specific DB state | Create test user without org_members row, verify all UI visible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
