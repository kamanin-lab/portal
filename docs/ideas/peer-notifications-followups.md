# Peer Notifications — Follow-ups

> Out-of-scope items from the "Peer-to-Peer Notifications для Организаций" task (April 2026).
> Main feature: portal users in one org notify each other when posting comments in tasks/projects.
> These items were deferred from the initial implementation and should be picked up as separate work.

Status: parent feature `in_progress` (branch `staging`).
Priority: `medium` unless noted.

---

## 1. Audit `send-support-message` for same asymmetry
**Priority:** medium

Support chat (admin ↔ agency) uses a separate edge function `send-support-message` (and the support channel task). Needs verification:
- Do other org admins/members see the support chat in their portal?
- If yes, does a portal user's message in support chat notify other org members? Likely suffers from the same bug as `post-task-comment` did.

**How to validate:** send a support message as a non-admin member, check whether admin receives bell + email on portal side (ignoring ClickUp notifications).

**Fix path:** mirror the fan-out pattern from `post-task-comment` (see commit that ships the peer-messages feature).

---

## 2. Per-task/per-project mute toggle
**Priority:** low

Today: `notification_preferences` is profile-level. A user who's on 20 projects can't silence one noisy project without disabling the entire `peer_messages` toggle.

**Scope:**
- New table `profile_notification_mutes (profile_id, scope: 'task'|'project_config', target_id, created_at)`
- UI: mute button in task/project chat header
- Fan-out check: skip recipient if mute row exists for task/project

Deferable until a user actually complains about noise.

---

## 3. `member_invited` / `member_removed` bell notifications
**Priority:** medium

Phase 9 added these to the `notifications_type_check` constraint, but no trigger or edge-function logic actually inserts these rows. So adding/removing org members is silent for existing members.

**Scope:**
- `invite-member` edge function → insert `member_invited` notifications for existing admins when a new invite is created
- Member removal (via `useMemberActions`) → insert `member_removed` notification for the removed user (so their next login shows the reason)
- Optional: email template for both types

---

## 4. Dedicated peer-reply email copy
**Priority:** low

Parent feature reuses existing `team_question` / `project_reply` email templates. These say "Das Team hat geantwortet" — technically incorrect when the author is a peer org member, not agency.

**Scope:**
- Add two new types to `emailCopy.ts`: `peer_team_reply` and `peer_project_reply`
- German copy example: "**[Name]** aus Ihrer Organisation hat eine Nachricht geschrieben"
- Update `post-task-comment` fan-out to use these new types instead of the agency-named ones

**Why deferred:** parent feature's Priority was to close the notification gap; copy polish is iterative.

---

## 5. Realtime push in chat UI on peer insert
**Priority:** low

After multi-row `comment_cache` insert in `post-task-comment`, each org member's chat UI should receive the new comment via Realtime (existing debounce-300ms subscription in `useProjectComments.ts` + poll fallback).

**What to verify:**
- N Realtime events for one comment don't cause UI flicker or duplicate render
- If flicker happens, add a de-dup key on `clickup_comment_id` in the React Query cache merge

**Why listed as idea and not main scope:** existing subscription is expected to handle it; only turn into a real task if staging testing reveals a regression.
