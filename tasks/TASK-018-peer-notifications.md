# TASK-018: Peer-to-peer org notifications

## Goal
When a portal user posts a comment in a ticket or project chat, all other members of the same organization receive a bell notification and (optionally) an email. Previously only the agency team (via ClickUp webhook) was notified of portal comments — org peers were invisible to each other.

## Why This Matters
Multi-user orgs (Phase 14+) need visibility across their own team's activity in the portal. Without peer notifications, a second admin posting a ticket reply would be invisible to other org members until their next portal load.

## Scope
- **In scope:** Fan-out in `post-task-comment` Edge Function; new `peer_messages` preference key; "Organisation" toggle in `/konto`; `getOrgContextForUserAndTask` authz helper; e2e test infra
- **Out of scope:** Support chat fan-out (deferred), per-task mute toggle (deferred), dedicated peer email copy (deferred), `member_invited`/`member_removed` notification triggers (deferred)

## Affected Areas
- Modules: tickets, projects (comment surfaces), shared/konto
- Files:
  - `src/shared/types/common.ts` — `peer_messages: boolean` in `NotificationPreferences`
  - `src/shared/components/konto/NotificationSection.tsx` — "Organisation" section + toggle
  - `src/shared/hooks/useAuth.ts` — staging-bypass profile updated
  - `supabase/functions/_shared/org.ts` — `getOrgContextForUserAndTask` helper
  - `supabase/functions/post-task-comment/index.ts` — fan-out block
  - `tests/_shared/staging-client.ts` — reusable staging test harness
  - `tests/e2e/peer-notifications.ts` — e2e test with self-cleanup
  - `tests/e2e/_inspect-staging.ts` — staging inspection helper
  - `tests/README.md` — e2e test methodology
- Integrations: Supabase (notifications, comment_cache), Mailjet (peer emails)

## References Consulted
- `docs/system-context/NOTIFICATION_MATRIX.md`
- `docs/ARCHITECTURE.md` — fan-out symmetry rationale
- `docs/DECISIONS.md` — ADR-031
- `supabase/functions/_shared/org.ts` — existing `getNonViewerProfileIds` pattern

## Risks
- **Cross-org leak:** Mitigated by `taskBelongsToOrg` check in `getOrgContextForUserAndTask`
- **Fan-out failure breaks comment POST:** Mitigated by wrapping fan-out in try/catch
- **No email for recipients without email:** Handled by explicit null check before send
- **Viewer over-notification:** Viewers excluded from both bell and email (stricter than webhook path)

## Implementation

### `getOrgContextForUserAndTask`
Returns `{ orgId, surface, memberProfileIds, taskBelongsToOrg, projectConfigId }`.
- Resolves org from caller's `org_members` row (never from task_cache)
- Validates ownership: tickets via `organizations.clickup_list_ids`, project tasks via `project_configs.organization_id`
- `taskBelongsToOrg === false` → fan-out skipped entirely

### Fan-out block in `post-task-comment`
After cache upsert:
1. Call `getOrgContextForUserAndTask`
2. Filter recipients: exclude author, exclude viewers
3. For each recipient: upsert `comment_cache`, insert `team_reply` bell, send `team_question`/`project_reply` email if `peer_messages === true` and recipient has email

### Preference key
`peer_messages: boolean` added to `NotificationPreferences` interface (default `true`). No DB migration needed — JSONB column accepts new keys freely.

### E2E test infra
- Tests run against staging only (safety guard rejects prod)
- Self-cleanup: test data removed after each run
- `staging-client.ts` is a reusable harness for future e2e tests

## Commits
- `18116fe` feat(notifications): fan-out peer comments to org members
- `0334dbd` fix(notifications): verify task belongs to caller's org before peer fan-out
- `5aeefd2` fix(notifications): skip peer email send when recipient has no email
- `1de2941` docs(notifications): CHANGELOG + ideas follow-ups
- `c3d8412` test(e2e): add peer-notifications e2e + reusable staging test harness

## Acceptance Criteria
- [x] Org member receives bell notification when a peer posts a ticket comment
- [x] Org member receives bell notification when a peer posts a project chat comment
- [x] Author does not receive self-notification
- [x] Viewer-role members receive neither bell nor email
- [x] Recipients with `peer_messages: false` receive bell but no email
- [x] Recipients with no email address are skipped without error
- [x] Cross-org task IDs produce no fan-out
- [x] Fan-out failure does not fail the underlying comment POST
- [x] `peer_messages` toggle visible in `/konto` notification settings

## Status
**COMPLETE** — merged to staging 2026-04-17, pending merge to main.

## Follow-ups (deferred)
See `docs/ideas/peer-notifications-followups.md`:
- Audit `send-support-message` for same peer notification gap
- Per-task mute toggle
- `member_invited`/`member_removed` bell notifications
- Dedicated peer email copy (not reusing agency templates)
