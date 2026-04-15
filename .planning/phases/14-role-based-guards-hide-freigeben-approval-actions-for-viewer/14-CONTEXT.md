# Phase 14: role-based-guards — Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the two remaining viewer-role gaps left open after Phase 11:

1. **Frontend: projects module viewer guard** — `StepActionBar` in `src/modules/projects/components/steps/StepActionBar.tsx` shows "Freigeben" and "Änderungen anfragen" action buttons to all roles, including viewers. Viewer users must not see these buttons (same `const { isViewer } = useOrg(); if (isViewer) return null` pattern already used in tickets module).

2. **Backend: email filtering for viewer role** — `clickup-webhook` sends `task_review` and `step_ready` emails to all org members including viewers. These are action-required emails (review a task, approve a project step) that viewers cannot act on. Both email sends must be filtered to admin/member roles only. Bell (in-app) notifications are NOT filtered — viewers should still see bells.

Nothing else. No new pages, no new API endpoints, no new DB tables.

</domain>

<decisions>
## Implementation Decisions

### Frontend: StepActionBar Viewer Guard

- **D-01:** Apply `const { isViewer } = useOrg(); if (isViewer) return null` at the top of `StepActionBar`. Returns null for the whole component — viewer sees neither the "Bereit für Ihre Prüfung" bar nor the action buttons.
- **D-02:** The guard must also cover `StepActionBar` in the projects module to align with Phase 11 scope (D-05 in Phase 11 CONTEXT only named tickets components explicitly; this phase closes the gap).
- **D-03:** No shared abstraction needed — same 2-line inline check pattern as `TaskActions`, `CreditApproval`, and the `NewTaskButton` in `TicketsPage.tsx`.
- **D-04:** Tests: add a viewer-guard test to `StepActionBar.test.tsx` (mirrors the pattern in `TaskActions.test.tsx`).

### Backend: clickup-webhook Email Filtering

- **D-05:** For `task_review` emails (ticket tasks moving to CLIENT REVIEW): after resolving `profileIds`, look up each profile's `org_members.role`. Only send email if `role === 'admin' || role === 'member'`. Bell notifications go to all profileIds regardless of role.
- **D-06:** For `step_ready` emails (project steps moving to CLIENT REVIEW): same filter — email to admin/member only, bell to all.
- **D-07:** Role lookup approach: after resolving profileIds, do a single Supabase query `org_members.select('profile_id, role').in('profile_id', profileIds)` to get roles for the batch. Build a Set of non-viewer profileIds. Do not change the profileIds array itself (it drives bell notifications).
- **D-08:** The email filter applies ONLY to `task_review` and `step_ready` email types in the webhook. All other email types (`task_completed`, `pending_reminder`, `project_reminder`, `recommendation_reminder`) already have their own sending logic — do not touch them in this phase.
- **D-09:** `send-reminders` already filters to admin-only by design (Phase 10 ORG-BE-07). No change needed there.
- **D-10:** If the role lookup query fails, log a warning and fall back to sending to all profileIds (permissive fallback — same philosophy as rest of org code).

### Claude's Discretion

- Exact variable naming for the role-filtered subset in the webhook (e.g., `nonViewerProfileIds`, `actionableProfileIds`)
- Whether to extract a shared helper function `filterNonViewerProfileIds(supabase, profileIds)` within the webhook file, or inline the query at each call site (two call sites)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Viewer Guard Implementations (copy these patterns)
- `src/modules/tickets/components/TaskActions.tsx:17-21` — inline `useOrg()` guard, `if (isViewer) return null`
- `src/modules/tickets/components/CreditApproval.tsx:19-25` — same pattern
- `src/modules/tickets/pages/TicketsPage.tsx:32,56` — conditional render `{!isViewer && <NewTaskButton .../>}`
- `src/modules/tickets/__tests__/TaskActions.test.tsx:38-70` — test pattern for viewer guard (renders nothing / renders buttons)

### Target File (Frontend)
- `src/modules/projects/components/steps/StepActionBar.tsx` — add viewer guard here

### Target File (Backend)
- `supabase/functions/clickup-webhook/index.ts` — two email send blocks to update:
  - Line ~872: `step_ready` email send loop (project tasks → CLIENT REVIEW)
  - Line ~1295: `task_review` email send loop (support/ticket tasks → CLIENT REVIEW)

### Phase 11 Context (established the pattern this phase extends)
- `.planning/phases/11-org-frontend-auth/11-CONTEXT.md` — D-05, D-06 explain the inline guard pattern

### Tests
- `src/modules/tickets/__tests__/TaskActions.test.tsx` — reference test structure for viewer guard
- `src/modules/projects/components/steps/__tests__/` — create `StepActionBar.test.tsx` here if not exists

### Org Role Lookup in Backend
- `supabase/functions/clickup-webhook/index.ts:359-417` — `findProfilesForTask()` — profileIds are resolved here, role filtering happens AFTER this
- `supabase/functions/_shared/org.ts` — shared org helper; check if it has a role-lookup utility before writing inline

</canonical_refs>

<specifics>
## Specific Ideas

- The backend change is surgical: two `for (const profile of profiles)` loops that call `sendMailjetEmail`. Add a role check before calling `sendMailjetEmail` — don't restructure the loop.
- If `_shared/org.ts` already has a `getOrgRole(profileId)` utility, use it. Otherwise inline the batch query.
- For the webhook, the role lookup must use `org_members` not `profiles` — `profiles` has no role column.

</specifics>

<deferred>
## Deferred Ideas

- Bell notification filtering for viewers (out of scope — viewers should see in-app notifications)
- `pending_reminder` and `project_reminder` filtering (already admin-only by Phase 10 design)
- Other email types (`task_completed`, `recommendation_reminder`) — not action-required, out of scope

</deferred>

---

*Phase: 14-role-based-guards*
*Context gathered: 2026-04-15*
