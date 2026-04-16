---
phase: 12
slug: org-admin-page
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-15
---

# Phase 12 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + @testing-library/react |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test -- --run src/modules/organisation` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~20 seconds |

## Sampling Rate

- **After every task commit:** Run quick run command for changed module
- **After every plan wave:** Run `npm run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| ORG-FE-UI-01 | Non-admin redirects to /tickets | unit (component) | `npm run test -- --run src/modules/organisation` | ❌ W0 | ⬜ pending |
| ORG-FE-UI-03 | Pending member detected by full_name IS NULL | unit (hook transform) | `npm run test -- --run src/modules/organisation` | ❌ W0 | ⬜ pending |
| ORG-FE-UI-04 | invite-member error codes shown as toasts | unit (component) | `npm run test -- --run src/modules/organisation` | ❌ W0 | ⬜ pending |
| ORG-FE-UI-05 | Last admin cannot be demoted | unit (guard logic) | `npm run test -- --run src/modules/organisation` | ❌ W0 | ⬜ pending |
| ORG-FE-UI-06 | Last admin cannot remove self | unit (guard logic) | `npm run test -- --run src/modules/organisation` | ❌ W0 | ⬜ pending |
| ORG-FE-UI-07 | updatePassword called on submit | unit (component) | `npm run test -- --run src/shared/__tests__` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

- [ ] `src/modules/organisation/__tests__/useOrgMembers.test.ts` — covers ORG-FE-UI-03 pending detection
- [ ] `src/modules/organisation/__tests__/MemberRowActions.test.tsx` — covers ORG-FE-UI-05/06 guard logic
- [ ] `src/modules/organisation/__tests__/InviteMemberDialog.test.tsx` — covers ORG-FE-UI-04 error handling
- [ ] `src/shared/__tests__/PasswortSetzenPage.test.tsx` — covers ORG-FE-UI-07

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Admin sees /organisation; non-admin redirected | ORG-FE-UI-01 | Requires real auth session | Log in as admin → navigate to /organisation; log in as member → confirm redirect to /tickets |
| Invite flow end-to-end | ORG-FE-UI-04 | Requires email delivery + GoTrue | Invite new email → check inbox → open link → /passwort-setzen → set password → /tickets |
| /passwort-setzen works from invite link | ORG-FE-UI-07 | GoTrue recovery session | Follow invite email link → confirm page loads → set password → confirm redirect |

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
