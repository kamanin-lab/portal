---
phase: 10
slug: org-edge-functions
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing `vitest.config.ts`) + manual integration against staging |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test:coverage` |
| **Estimated runtime** | ~30s (frontend suite) |

**Note:** Edge Functions run in Deno. Vitest covers frontend code only. Edge Function correctness is validated via manual integration smoke tests against the staging Supabase instance after deployment.

---

## Sampling Rate

- **After every task commit:** Run `npm run test` (confirms no frontend regressions)
- **After every plan wave:** Run `npm run test:coverage` + manual smoke test on staging
- **Before `/gsd-verify-work`:** Full suite green + all manual integration checks passed
- **Max feedback latency:** ~30 seconds (Vitest) + ~5 minutes (staging deploy + smoke test)

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Verification Command / Steps | Status |
|--------|----------|-----------|------------------------------|--------|
| ORG-BE-01 | fetch-clickup-tasks returns correct list from org.clickup_list_ids | Integration (staging) | `curl -X POST https://staging.portal.kamanin.at/functions/v1/fetch-clickup-tasks` with valid client JWT — verify tasks returned match staging org list | ⬜ pending |
| ORG-BE-02 | fetch-single-task validates task access via org clickup_list_ids | Integration (staging) | POST /fetch-single-task with taskId from known client org; assert 200 and task returned | ⬜ pending |
| ORG-BE-03 | nextcloud-files resolves client root from org | Integration (staging) | POST /nextcloud-files with action=list; verify response lists files from org's nextcloud_client_root | ⬜ pending |
| ORG-BE-04 | create-clickup-task uses org list + chat channel | Integration (staging) | POST /create-clickup-task with valid payload; verify task created in correct ClickUp list | ⬜ pending |
| ORG-BE-05 | webhook fan-out notifies all org members | SQL check (staging) | After webhook event: `SELECT COUNT(*) FROM notifications WHERE task_id='...'` should equal org member count | ⬜ pending |
| ORG-BE-06 | support comment_cache has N rows per org member | SQL check (staging) | After support comment webhook: `SELECT COUNT(*) FROM comment_cache WHERE task_id = '{support_task_id}'` should equal org member count | ⬜ pending |
| ORG-BE-07 | send-reminders emails only org admin | Manual invoke + check | Invoke send-reminders cron manually on staging; verify only admin email receives reminder | ⬜ pending |
| ORG-BE-08 | invite-member creates user + sends email | Integration (staging) | POST /invite-member `{"organizationId":"...","email":"test@example.com","role":"member"}` with admin JWT; assert 200, user in auth.users, invite email received | ⬜ pending |
| ORG-BE-09 | invite-member returns 403 for non-admin caller | Integration (staging) | POST /invite-member with member-role JWT; assert 403 response | ⬜ pending |
| ORG-BE-10 | invite-member returns 409 for duplicate invite | Integration (staging) | POST /invite-member with already-invited email + org; assert 409 response | ⬜ pending |
| ORG-BE-11 | viewer role returns 403 on mutating operations | Integration (staging) | POST /create-clickup-task, /post-task-comment, /update-task-status with viewer JWT; all assert 403 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No new Vitest test files required — all verification is integration-level (manual smoke tests on staging).

Existing frontend test suite must remain green throughout all waves:
- [ ] `npm run test` passes after every plan wave

*All phase behaviors have integration-level verification only (Edge Function / Deno runtime — outside Vitest scope).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| fetch-clickup-tasks org resolution | ORG-BE-01 | Deno Edge Function; requires real Supabase staging + ClickUp token | POST with valid staging JWT, compare task list against org.clickup_list_ids |
| invite-member full flow | ORG-BE-08 | Requires real email send (Mailjet staging) + GoTrue admin API | POST /invite-member with admin JWT, verify email in inbox |
| webhook fan-out to all org members | ORG-BE-05 | Requires real webhook trigger from ClickUp | Create/update task in staging ClickUp list, query notifications table |
| send-reminders admin-only grouping | ORG-BE-07 | Cron function; requires manual trigger on staging | Invoke via scheduled function trigger, verify email logs |

---

## Validation Sign-Off

- [ ] All tasks have integration verify steps documented above
- [ ] Frontend Vitest suite remains green through all waves
- [ ] Wave 0 covers all MISSING references (no new test stubs needed — existing infra sufficient)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (Vitest) + < 5min (staging smoke)
- [ ] `nyquist_compliant: true` set in frontmatter once all integration checks pass

**Approval:** pending
