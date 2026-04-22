# Changelog

## feat(auth): "Angemeldet bleiben" — two-tier session persistence — 2026-04-22

Clients complained about being logged out frequently. Added "Angemeldet bleiben" checkbox to the login page (default checked) implementing a two-tier session model following the Slack/Linear pattern.

- **Login page** — "Angemeldet bleiben" checkbox in `signin` and `magic` modes; hint "Auf fremden Geräten deaktivieren"; default checked (B2B portal on client's own devices).
- **Persistent mode** (checked): Supabase auth tokens routed to `localStorage`, 30-day idle timeout.
- **Ephemeral mode** (unchecked): tokens routed to `sessionStorage`, 3-hour idle timeout — clears on tab/window close.
- **Hybrid storage adapter** (`supabase.ts`) — reads `portal-remember-me` flag from `localStorage` on every auth token read/write; fail-safe default = persistent if flag absent.
- **Two-tier idle timeout** (`session-timeout.ts`) — `EPHEMERAL_TIMEOUT_MS` (3h) + `PERSISTENT_TIMEOUT_MS` (30d); `getEffectiveTimeout()` picks live based on current flag; 60s tick re-evaluates without page reload.
- **`useAuth.ts`** — `signIn` and `signInWithMagicLink` accept optional `remember` boolean; writes flag before Supabase call; `signOut` clears the flag.
- **Tests** — 7 tests in `session-timeout.test.ts` (was 2): constants + `getEffectiveTimeout()` flag logic.
- Commit: `29350ba`, branch: `staging`.

---

## fix(departments): tighten visibility — untagged tasks no longer public for scoped members — 2026-04-21

**Behavior change.** Before: a member with `departments=[SEO]` still saw every untagged ticket (fallback rule). After: scoped members see ONLY tickets with overlapping departments or tickets they created. Untagged tickets are no longer visible to scoped members.

Legacy fallback preserved: member with `departments=[]` continues to see everything (zero regression for clients without Fachbereich configured).

Trigger: MBM added external SEO agency member with `departments=[SEO]`, but he saw all 113 existing tickets (none were tagged Fachbereich yet). The "untagged = public" exception defeated the scope entirely.

### Database
- **`supabase/migrations/20260421130000_tighten_department_visibility.sql`** — `ALTER FUNCTION can_user_see_task()` drops the `task_departments = []` branch. Also adds `org_members` to `supabase_realtime` publication.

### Frontend
- **`visibility-filter.ts`** — removed `taskDepartments.length === 0 → visible` branch.
- **`_shared/org.ts`** — removed matching line in Deno `canUserSeeTask()`.
- **`useOrg.ts`** — new Realtime subscription on own `org_members` row. When admin re-scopes the current user, refetch org context AND invalidate `['clickup-tasks']` query so Meine Aufgaben updates without a page refresh.

### Tests
- **`visibility-filter.test.ts`** — inverted 1 test (scoped member does NOT see untagged), added 2 new strict-rule tests (23 tests total, all passing).

### Deployment
- Migration applied on both staging and self-hosted production (2026-04-21).
- `_shared/org.ts` copied to Coolify volume, `supabase-edge-functions` restarted.

---

## feat(departments): ticket visibility by department (Fachbereich) — 2026-04-21

Role-based ticket visibility for organizations with specialized departments. Members see only tickets tagged with their assigned departments (or untagged tickets, or tickets they created). Admins and legacy members (no departments assigned) continue to see everything.

### Database
- **`supabase/migrations/20260421100000_ticket_departments.sql`** — new columns: `organizations.clickup_department_field_id`, `organizations.departments_cache JSONB`, `org_members.departments TEXT[]`, `task_cache.departments TEXT[]` + GIN index. SQL functions `can_user_see_task()` and `get_visible_member_profile_ids()`. New RLS policy `task_cache_select_visible` (replaces `task_cache_select_own`). View `visible_task_cache` with `security_invoker=true`.
- **`supabase/migrations/20260421100001_update_org_members_enriched_rpc.sql`** — adds `departments` column to `get_org_members_enriched` RPC return type.

### Edge Functions
- **`fetch-clickup-tasks`** — autodetects "Fachbereich" labels-type field per org, caches options in `departments_cache`, writes `task_cache.departments` on every sync.
- **`clickup-webhook`** — handles `taskUpdated` custom_field events for the department field: always GETs full task from ClickUp, updates `task_cache.departments` for all member rows. Status notification fan-out uses `getVisibleMemberProfileIds` for department-aware filtering.
- **`post-task-comment`** — peer fan-out uses `getVisibleMemberProfileIds` for ticket-surface comments.
- **`update-task-departments`** (new) — admin-only EF to set department labels on a ClickUp task + sync to task_cache.
- **`_shared/org.ts`** — new `getVisibleMemberProfileIds()` helper calling SQL RPC with permissive fallback.

### Frontend
- **`useClickUpTasks`** — reads from `visible_task_cache` view instead of `task_cache` directly.
- **`types/tasks.ts`** — `departments: string[]` added to `ClickUpTask` and `CachedTask`.
- **`transforms.ts`** — propagates `departments` field.
- **`useOrg.ts`** — exposes `memberDepartments` and org's `departments_cache`/`clickup_department_field_id`.
- **`DepartmentChips.tsx`** (new) — admin-editable / member-readonly department chips on ticket detail.
- **`DepartmentsSection.tsx`** (new) — read-only department list + sync button on /organisation page.
- **`MemberDepartmentPicker.tsx`** (new) — multi-select department picker on member rows in TeamSection.
- **`useUpdateTaskDepartments.ts`** (new) — mutation hook for admin department assignment on tickets.
- **`useUpdateMemberDepartments.ts`** (new) — mutation hook for admin department assignment on members.

### Tests
- **`visibility-filter.test.ts`** — 21 tests covering admin/member/viewer x empty/matching/non-matching departments + creator override + helper functions.

### Fixes (shipped alongside)
- **Email copy** — replaced all occurrences of "KAMANIN" and "ClickUp" in client-facing email templates with "Ihre Agentur" / "Agentur" to avoid leaking internal tool names.
- **`send-reminders` department filter** — unread and recommendation digest emails now filter recipients through JS `canUserSeeTask` predicate (mirror of SQL `can_user_see_task`); members with restricted departments no longer receive digests for tickets they cannot see.

### Docs
- `DATABASE_SCHEMA.md` — updated with new columns, functions, view, RLS policy.
- `NOTIFICATION_MATRIX.md` — updated with department-aware fan-out rule.
- `DECISIONS.md` — ADR-033: why Labels type (not Dropdown, Tags, or per-person assignments).

## feat(notifications): unified email + bell gating + auto-archive — 2026-04-20

Bell (in-app) notifications are now gated by the same `notification_preferences` JSONB keys as email. Previously bells were always created regardless of preferences.

### Changes

- **`supabase/functions/_shared/notifications.ts`** (new) — `shouldCreateBell(profile, bellEvent)` helper + `BELL_EVENT_TO_PREF_KEY` mapping (14 bell events → 12 preference keys). Fail-open for unmapped events. Mirrors `shouldSendEmail` pattern.
- **`supabase/functions/clickup-webhook/index.ts`** — 14 bell INSERT sites wrapped with `shouldCreateBell` guard.
- **`supabase/functions/post-task-comment/index.ts`** — 1 bell INSERT site (peer fan-out) wrapped with `shouldCreateBell` guard.
- **`supabase/migrations/20260420170000_add_notification_archive.sql`** — adds `notifications.archived_at timestamptz` + partial index `idx_notifications_archive ON notifications (created_at, is_read, archived_at) WHERE archived_at IS NULL`. Applied to staging and production.
- **`supabase/functions/send-reminders/index.ts`** — auto-archive cron block: archives read bells older than 30 days (sets `archived_at`), hard-deletes archived rows older than 90 days. Runs after all reminder tasks per invocation.
- **`src/modules/tickets/hooks/useNotifications.ts`** — query and `markAllAsRead` filter `archived_at IS NULL`.
- **`src/modules/tickets/hooks/useUnreadCounts.ts`** — notification cross-sync update filters `archived_at IS NULL`.
- **`src/shared/components/konto/NotificationSection.tsx`** — heading updated to "E-Mail & In-App-Benachrichtigungen"; footer copy clarifies preferences apply to both channels.

### Known limitation (staging)
E2E tests for webhook-driven bell scenarios are skipped on staging due to `CLICKUP_WEBHOOK_SECRET` mismatch between staging Cloud Supabase and production ClickUp. Documented in the e2e test file.

### Commits
- `3d980fa` feat(notifications): unified bell gating + auto-archive
- `a5f5eb5` test(e2e): notification gating e2e tests
- `e567e3f` chore(merge): staging → main

---

## feat(invite): full name capture on first login — 2026-04-20

- Added required `Vollständiger Name` input to `PasswortSetzenPage` (`src/shared/pages/PasswortSetzenPage.tsx`) above the password fields. Validation: `trim().length >= 2`, `maxLength=100`, `autoComplete="name"`.
- After successful `verifyOtp` + `updateUser({ password })`, persists trimmed name to `profiles.full_name` via direct UPDATE. Error is logged to console and swallowed (non-fatal — password is already set, user can fix name later in `/konto`).
- Before: `profiles.full_name` stayed `NULL` for all invited users; UI fell back to `email.split('@')[0]` in sidebar, TeamSection, comment authors. Now users enter their actual name in one motion with the password.
- 4 new unit tests (`src/shared/pages/__tests__/PasswortSetzenPage.test.tsx`); 3 existing fixtures in `src/shared/__tests__/PasswortSetzenPage.test.tsx` updated to fill the new required field.
- No DB changes, no Edge Function changes, no display-component changes (fallbacks remain for legacy profiles with null names).

---

## feat(password): live strength checklist on invite flow — 2026-04-20

- Extracted inline 4-rule checklist from `PasswordSection` into reusable `<PasswordChecklist password={...} />` component (`src/shared/components/common/PasswordChecklist.tsx`, 35 lines, pure render).
- Wired into `PasswortSetzenPage` — both password-setting surfaces now share the same visual contract.
- Submit gate on invite flow tightened: `length >= 8` → `validatePassword(password).valid` (all 4 rules: length, uppercase, digit, special char).
- 4 unit tests added (`PasswordChecklist.test.tsx`); 3 existing fixtures in `PasswortSetzenPage.test.tsx` updated to valid password.
- No DB changes, no Edge Function changes.

### Commits
- `9cf942d` (staging), `0ab5cd1` (main → prod)

---

## fix(auth): invite flow — scanner-prefetch mitigation + admin resend — 2026-04-20

### Problem — Part A (scanner-prefetch)
Email security scanners (Outlook Defender, Proofpoint, etc.) pre-fetch HTTPS links in invite emails, consuming the one-time Supabase recovery token before the recipient ever clicks. Result: invite link appears "expired" immediately. First observed in production with the "medea.ahlborn" account on 2026-04-20.

### Problem — Part B (no resend path)
Once a token was consumed by a scanner, there was no admin-facing action to send a fresh invite. Admins had to manually generate a recovery link via Supabase Studio.

### Fix — Part A
- **`src/shared/pages/PasswortSetzenPage.tsx`** — removed `verifyOtp()` call from `useEffect([], ...)`. Token verification + `updateUser` now run only on form submit. Scanners that fetch the URL get a blank form page; the token is never consumed until the user submits.
- **`src/shared/pages/EinladungAnnehmenPage.tsx`** (new) — public landing page at `/einladung-annehmen`. Renders a JS-click CTA button that redirects to `/passwort-setzen?token=...`. Scanners without JS stop here; modern scanners that follow JS still can't consume the token because verify is submit-gated. Defense-in-depth layer.
- **`src/app/routes.tsx`** — `/einladung-annehmen` registered as a public (unauthenticated) route.
- **`supabase/functions/invite-member/index.ts`** — `recoveryUrl` path changed from `/passwort-setzen` to `/einladung-annehmen`.

### Fix — Part B
- **`supabase/functions/resend-invite/index.ts`** (new) — admin-authed Edge Function. Guards: caller must be `admin` role, target member must be pending (`auth.users.last_sign_in_at IS NULL`), 60-second cooldown enforced via atomic `UPDATE … WHERE last_invite_sent_at IS NULL OR last_invite_sent_at < now() - interval '60s'` on `org_members.last_invite_sent_at` (TOCTOU-safe). Generates a fresh Supabase recovery link and sends via Mailjet using the same invite template.
- **`supabase/migrations/20260420160000_add_last_invite_sent_at.sql`** (new) — adds `org_members.last_invite_sent_at TIMESTAMPTZ NULL` column. Applied to both staging and production.
- **`src/modules/organisation/hooks/useMemberActions.ts`** — `resendInvite` React Query mutation added.
- **`src/modules/organisation/components/MemberRowActions.tsx`** — "Einladung erneut senden" conditional dropdown item for pending members only.

### Pipeline
- Pre-code review (REVISE): landing page alone insufficient — verifyOtp must move out of mount. Incorporated before implementation.
- Post-code review (OpenRouter): flagged TOCTOU race in cooldown (fixed with atomic UPDATE) + `setTimeout` leak (fixed with `useRef` + `useEffect` cleanup).
- QA: PASS. Prod endpoint returns 401 (auth required — correct).

### Commits
- `18b582a` feat(auth): invite flow fix — scanner-prefetch mitigation + admin resend

---

## feat(organisation): "Einladung ausstehend" badge for pending members — 2026-04-20

### Changes
- **`src/modules/organisation/components/TeamSection.tsx`** (or equivalent) — pending org members (invited but not yet signed in) now display an "Einladung ausstehend" badge in the member list, making it visible to admins which accounts have not yet accepted.

### Commits
- `c42665f` feat(organisation): Einladung ausstehend badge for pending members

---

## fix(credits): orphaned transactions after org migration — 2026-04-20

### Problem
Nach dem Phase 9-13 Org-Migration schrieb der `accept_recommendation`-Pfad in `update-task-status` neue `task_deduction`-Zeilen ohne `organization_id`. `get_org_credit_balance(p_org_id)` summiert nur Zeilen mit gesetztem `organization_id`, daher wurden diese Abzüge in der Saldenanzeige übersprungen — die MBM GmbH sah **8 Credits statt 6** (2 Abzüge vom 10.04. und 17.04. addierten sich zu einer fehlenden Empfehlungs-Deduction von 2 Credits vom 17.04.). Zusätzlich nutzte `credit-topup` noch das alte `profile_id`-Schema von `credit_packages`, das in Phase 13 (Migration `20260416130000`) entfernt wurde — die Funktion würde beim nächsten Monatswechsel fehlschlagen.

### Fix
- **`supabase/migrations/20260420150000_backfill_credit_transactions_org_id.sql`** — new. Backfill `organization_id` auf allen 2 Orphanen via `org_members`-Join, Guard-Block der explizit fehlschlägt falls Residual-NULLs übrig bleiben, dann `ALTER TABLE … SET NOT NULL` damit künftige Orphans unmöglich sind. Geprüft: 0 Multi-Org-Profiles existieren.
- **`supabase/functions/update-task-status/index.ts`** (L418-508) — `accept_recommendation`-Branch: Profil-Select erweitert um `organization_id`, raw INSERT ersetzt durch `upsert_task_deduction` RPC (schreibt `organization_id` atomisch, idempotent über partial unique index). Guard: falls `organization_id` am Profil fehlt, wird die Aktion mit 500 abgewiesen statt stillschweigend einen Orphan zu erzeugen.
- **`supabase/functions/credit-topup/index.ts`** — `credit_packages`-Select auf neues Schema umgestellt (`organization_id` statt `profile_id`), Idempotenz-Check auf `organization_id + Monat`, Transaktions-Actor wird aus `org_members.role='admin'` aufgelöst (monthly_topup ist keine User-Action; `credit_transactions.profile_id` bleibt NOT NULL für Audit-Trail).

### Verification
- Prod-SQL: `SELECT get_org_credit_balance('ba5e1323…')` → **6.0** (war 8.0).
- Prod-SQL: `SELECT COUNT(*) FROM credit_transactions WHERE organization_id IS NULL` → **0**.
- Column `credit_transactions.organization_id` ist jetzt `NOT NULL`.
- `npm run test` — keine neuen Failures (gleicher 10-Failures-Baseline wie vor der Änderung, alle pre-existing in `MeineAufgabenPage` wegen OrgProvider-Setup in Tests, unrelated).
- `npm run lint` — keine neuen Errors in geänderten Files.

### Deploy
- Migration sofort auf Prod angewendet via `portal.db.kamanin.at/pg/query` endpoint.
- Edge Functions `update-task-status` + `credit-topup` via SCP auf Coolify-Volume, `docker restart supabase-edge-functions-ngkk4c4gsc0kw8wccw0cc04s` — "main function started" bestätigt clean reboot.

---

## feat(hilfe): FAQ refresh — 7 sections / 32 items, text search, Organisation & Team — 2026-04-20

### Changes
- **`src/shared/lib/hilfe-faq-data.ts`** — new "Organisation & Team" section (7 items covering roles, viewer limits, team invites, credit visibility); Benachrichtigungen expanded (+3 items: push, digest timing, per-task mute); Kredite expanded (+2 items: Paketgröße, Ablauf); minor role-clarification edits in Projekte, Tickets, and Dateien answers. Total: 7 sections / 32 items (was 6 / 19).
- **`src/shared/pages/HilfePage.tsx`** — text search input with `useMemo` filter across all section titles and item questions/answers; `EmptyState` shown when no items match; motion strategy switched from `whileInView` to `animate` to prevent re-fade flicker when filtering; `ICON_MAP` updated with `UserGroupIcon` for the new section.
- **`src/shared/pages/__tests__/HilfePage.test.tsx`** — updated section/item counts, 5 new search tests (show match, hide non-match, case-insensitive, clear input restores, no-match shows EmptyState). All 8 tests pass.

### Commits
- `71e66d9` fix(projects): remove duplicate "Freigabe / Prüfung öffnen" quick-link card (closest staging commit; FAQ shipped in same session)

---

## feat(weekly-summary): v1.5 — agency work first, AI narrative, projects, tiers — 2026-04-18

### Problem
MVP email (shipped earlier today) only surfaced client-owed actions (freigabe, recs, unread) — felt passive, hid the agency's real work. Also sent on any non-zero state, even when nothing changed on the agency side, risking nag fatigue. And ignored project-level activity entirely.

### Changes
- **`supabase/functions/send-weekly-summary/index.ts`** — full rewrite (+671 / -149):
  - **New top block "Was wir für Sie gemacht haben"** with AI narrative (via OpenRouter → `anthropic/claude-haiku-4.5`, gated on ≥5 team comments, 10s timeout, warm conversational tone), completed-this-week, currently in progress (`status IN ('in progress','internal review','rework')`), agency-side comment counts grouped by task, peer activity detection handling empty `author_email` (workaround for post-task-comment fan-out bug).
  - **New project block** — per active project (joined via `project_access` + `project_config`), task statuses, `NEU` badge when created within the week. Always shown if admin has any active project, even without weekly change.
  - **Three-tier delivery logic** — `determineTier()` returns `SKIP` / `LIGHT` / `FULL`:
    - `SKIP`: no activity and no pending — email not sent.
    - `LIGHT`: only pending client items, no fresh agency work — gentler "Offene Punkte — KW X" subject, no AI, no project block.
    - `FULL`: normal rich rendering.
  - **Subject carries activity count**: "Wochenbericht — KW 16 · 13 Aktivitäten".
  - **AI safety**: strips sentences starting with "Bitte"/"Können Sie" (no client-asks in the agency summary), caps at 2 sentences, fails safely (email sends without the AI line).

### Tested end-to-end
Staging: invoked live EF with real MBM admin + test-client data, `Sent: 2, FULL: 2, LIGHT: 0, SKIP: 0`. Production: EF deployed via Coolify volume + container restart, healthy.

### Not addressed here (logged as follow-up idea)
- `docs/ideas/peer-fan-out-author-email.md` — root-cause fix for the `author_email` being stripped when peer comments fan out via `post-task-comment`. Currently detected by proxy (`is_from_portal=true AND profile_id=admin AND author_email != admin`). Affects peer labeling in other surfaces too.

### Commits
- `7e6dd27` feat(weekly-summary): v1.5 — agency-work first, AI narrative, projects, tiers
- `582e70d` merge(weekly-summary-v1.5): ship to production

---

## feat(notifications): weekly summary email (MVP) — 2026-04-18

### Problem
Clients only learn about portal activity through per-event emails (task review, team reply, etc.) and a 48-hour unread-digest. Nothing gives them a **weekly picture** — what was completed, what's still waiting, open recommendations — without logging in. Busy clients miss context between weeks.

### Changes
- **`supabase/migrations/20260418100000_add_weekly_summary_cooldown.sql`** (new) — adds `profiles.last_weekly_summary_sent_at timestamptz` column for 6-day cooldown.
- **`supabase/functions/send-weekly-summary/index.ts`** (new) — scheduled Edge Function. For each org admin, builds a 4-section digest (completed-this-week, waiting-for-feedback, open recommendations, unread count), skips if all empty, sends via Mailjet with atomic-claim cooldown. Pattern mirrors `send-reminders`.
- **`supabase/functions/_shared/emailCopy.ts`** — added `weekly_summary` email type (de + en); subject keyed off ISO week number (`Wochenbericht — KW 16`).
- **`.github/workflows/send-weekly-summary.yml`** (new) — cron `0 7 * * MON` (Monday 09:00 CET) + `workflow_dispatch` for manual smoke tests.
- **`src/shared/types/common.ts`** — `weekly_summary: boolean` added to `NotificationPreferences` and `DEFAULT_NOTIFICATION_PREFERENCES`.
- **`src/shared/components/konto/NotificationSection.tsx`** — new toggle under the "Organisation" section: "Wöchentliche Zusammenfassung" (visible only to org members).
- **Docs**: `NOTIFICATION_MATRIX.md` (new Weekly Summary subsection + preference key row), `DATABASE_SCHEMA.md` (new column row), `MODULE_MAP.md` (new EF entry + `read_receipts` table surfaced in tickets module data source description), `docs/ideas/weekly-client-summary.md` (full design memo including Phase 2-4 future work — project-progress section, per-member summaries + i18n, configurable cadence).

### Scope — MVP (Phase 1 only)
Admin-only recipient, German-only copy, 4 content blocks, skip-if-empty, 6-day cooldown. Phases 2-4 documented as future work in the ideas memo, not implemented.

### Overlap with existing `unread_digest`
Weekly summary surfaces **count** of unread messages only, not per-message detail. The 48h `unread_digest` remains the primary vehicle for actionable unread content. No `unread_digest` suppression during weekly-summary window — defer until we see real duplication complaints.

### Commits
(to be added after push)

---

## docs(orientation): MODULE_MAP + reject knowledge-graph tools — 2026-04-18

### Problem
Every new task, Claude Code agents re-read large parts of `src/` to orient themselves. Wasted exploration across runs, no durable module-level map.

### Changes
- **`docs/system-context/MODULE_MAP.md`** (new) — hand-maintained per-module file inventory with entry points, architecture rules, cross-module edges, and related Edge Functions. Covers `app/`, `modules/tickets/`, `modules/projects/`, `modules/files/`, `modules/organisation/`, `shared/`, and `supabase/functions/`.
- **`CLAUDE.md`** — added MODULE_MAP.md to Key Project Documents + new "Module orientation protocol" subsection: check MODULE_MAP.md first, then read source.
- **`.claude/agents/docs-memory-agent.md`** — added MODULE_MAP.md to agent's target-files list so it stays current on structural changes.
- **`docs/ideas/knowledge-graph-tools.md`** (new) — full memo from the rejected evaluation of `code-review-graph` and `graphify`. Preserves benchmark numbers and reconsider conditions for ~6-month revisit.
- **`docs/DECISIONS.md`** — ADR-032 prepended.
- **`.gitignore`** — added `.experiments/` pattern for future local experiments.

### Rationale
Benchmark showed neither graph tool cleared 40%-files-read reduction on both test tasks. Both tools also auto-mutate CLAUDE.md / `.mcp.json` / PreToolUse hooks by default, which is hostile to our disciplined pipeline. Hand-maintained map is cheaper (~1h write, ~15min/month maintain), better integrated, and strictly scoped to what's true right now.

---

## feat(notifications): peer-to-peer org notifications — 2026-04-17

### Problem
When a portal user posted a comment in a ticket or project chat, only the agency (via ClickUp) was notified. Other members of the same organization (including admins) stayed in the dark — messages from a teammate appeared only on next portal load.

### Changes
- **`src/shared/types/common.ts`** — new `peer_messages: boolean` key in `NotificationPreferences` (default `true`)
- **`src/shared/components/konto/NotificationSection.tsx`** — new "Organisation" section with `peer_messages` toggle, visible only when user belongs to an org
- **`src/shared/hooks/useAuth.ts`** — staging-bypass profile updated with new pref key for type compliance
- **`supabase/functions/_shared/org.ts`** — new `getOrgContextForUserAndTask()` helper: resolves org from caller's `org_members` row (robust to cache misses), validates task ownership via `organizations.clickup_list_ids` (tickets) or `project_configs.organization_id` (project tasks)
- **`supabase/functions/post-task-comment/index.ts`** — fan-out block after cache upsert: excludes author + viewers, upserts `comment_cache` for each recipient, inserts bell notifications (`team_reply`), sends email via `peer_messages` preference gate (reuses `team_question` / `project_reply` email templates). Cross-org check skips fan-out when task doesn't belong to caller's org. Whole block wrapped in try/catch — never fails the main ClickUp POST.

### E2E testing
Full automated suite in `tests/e2e/peer-notifications.ts` — 9/9 assertions verified on staging: self-exclusion, viewer exclusion, admin receives bell+email, pref toggle gates email only, cross-org authorization isolation.

### Commits
- `18116fe` feat(notifications): fan-out peer comments to org members
- `0334dbd` fix(notifications): verify task belongs to caller's org before peer fan-out
- `5aeefd2` fix(notifications): skip peer email send when recipient has no email
- `1de2941` docs(notifications): CHANGELOG + ideas follow-ups
- `c3d8412` test(e2e): add peer-notifications e2e + reusable staging test harness

### Follow-ups
Deferred items recorded in `docs/ideas/peer-notifications-followups.md`: audit `send-support-message` for same bug, per-task mute toggle, `member_invited`/`member_removed` triggers, dedicated peer email copy.

---

## feat(credits): Credit re-approval flow — 2026-04-17

### New Behaviour

When a task is returned to `AWAITING APPROVAL` after having previously been approved with a different credit amount, the portal now handles the re-approval case atomically and without creating duplicate ledger entries.

**UI (`src/modules/tickets/components/CreditApproval.tsx`)**
- Three render states: standard first-approval, re-approval, and decline flow
- Re-approval detected when `task_cache.approved_credits` is set and differs from `task_cache.credits`
- Re-approval renders: "Aktualisierte Kostenfreigabe" heading + "Aktualisiert" badge + "Die Schätzung wurde von X auf Y Credits angepasst." body
- Standard approval renders the existing "Kostenfreigabe erforderlich" text
- `approved_credits` field threaded through `CachedTask` → `ClickUpTask` → `TaskDetail` → `CreditApproval` props

**Backend (`supabase/functions/update-task-status/index.ts`)**
- `approve_credits` action uses new RPC `upsert_task_deduction(p_profile_id, p_organization_id, p_amount, p_task_id, p_task_name, p_description)` instead of a plain INSERT
- RPC performs `INSERT ... ON CONFLICT (task_id, type) WHERE (type = 'task_deduction') DO UPDATE` — atomically overwrites the existing deduction row without adding a duplicate
- After upsert, mirrors approved amount onto `task_cache.approved_credits` so the UI can show re-approval state on next load
- Auto-comment text branches: "Kostenfreigabe erteilt (N Credits)" vs. "Kostenfreigabe aktualisiert (X → Y Credits)"

**Email (`supabase/functions/send-mailjet-email/index.ts`)**
- `credit_approval` template detects re-approval when `previousCredits` is provided and differs from `credits`
- Re-approval email subject: "Aktualisierte Kostenfreigabe für {task} — {credits} Credits"
- Re-approval email body: "Die Schätzung für „{task}" wurde von {prev} auf {credits} Credits angepasst und wartet erneut auf Ihre Freigabe."
- Standard approval path unchanged

**Bell notification (`supabase/functions/clickup-webhook/index.ts`)**
- On `AWAITING APPROVAL` status change, webhook reads `task_cache.approved_credits` first to detect re-approval before fetching credits
- Re-approval notification title: "Aktualisierte Kostenfreigabe: {task}"
- Re-approval notification message: "Die Schätzung für "{task}" wurde von X auf Y Credits angepasst und wartet erneut auf Ihre Freigabe."

**Database (`supabase/migrations/20260417100000_credit_reapproval.sql`)**
- `ALTER TABLE task_cache ADD COLUMN IF NOT EXISTS approved_credits numeric` — tracks last client-approved amount; NULL = never approved
- Backfill: existing `credit_transactions` deductions backfilled into `approved_credits` to prevent false re-approval on historical tasks after deploy
- `CREATE OR REPLACE FUNCTION upsert_task_deduction(...)` — SECURITY DEFINER, `SET search_path = public`, service_role-only; wraps partial-index UPSERT targeting `credit_transactions_task_deduction_unique ON (task_id, type) WHERE type = 'task_deduction'`
- `REVOKE ALL ON FUNCTION upsert_task_deduction FROM PUBLIC; GRANT EXECUTE ... TO service_role`

### Bugs Prevented

1. **Webhook auto-delta anti-pattern removed** — The webhook previously inserted a compensating delta transaction when the Credits custom field changed in ClickUp. This could silently deduct credits before the client consented. That logic is removed. The webhook now only syncs `task_cache.credits`. The sole source of truth for committed credit deductions is the client's `approve_credits` action.

2. **Partial-index UPSERT via RPC** — Supabase JS SDK `.upsert()` cannot pass a `WHERE` clause to target a partial unique index as the `ON CONFLICT` arbiter. Naive `INSERT ... ON CONFLICT (task_id)` would have matched the wrong constraint. The `upsert_task_deduction` RPC wraps the full `ON CONFLICT (task_id, type) WHERE (type = 'task_deduction')` SQL.

3. **Webhook event ordering race fix** — On `AWAITING APPROVAL`, ClickUp may fire the status-change event and the custom-field-change event near-simultaneously. If the status-change webhook is processed first, `task_cache.credits` may still hold the old value. The webhook now force-fetches current credits from the ClickUp API (not cache) whenever `approved_credits` is already set (i.e., re-approval is likely), ensuring the notification and email carry the correct new amount.

### Commits
- `f1a9c8d feat(credits): implement credit re-approval with atomic UPSERT`
- `532db21 fix(credits): use RPC for partial-index UPSERT`
- `7ef9f2e fix(credits): harden upsert_task_deduction with SET search_path`
- `698ffe1 fix(credits): force-fetch from ClickUp on re-approval to avoid webhook race`
- `5e97b83 feat(credits): show 'Aktualisierte Kostenfreigabe' in bell notification on re-approval`

---

## fix(org): Empfehlungen tab admin-only + sidebar badge exclusion — 2026-04-16

### Sidebar badge
- `new_recommendation` notification type excluded from badge count for non-admin users

### Empfehlungen tab
- Tab restricted to admin-only; non-admin org members (member/viewer role) no longer see the Empfehlungen tab in the navigation

---

## Phase 13-cleanup: org_member profile visibility + invited_email — 2026-04-16

### `supabase/migrations/20260416140000_org_member_profile_visibility.sql`
- New RLS policy on `profiles`: org members can read basic profile info (id, email, full_name) of fellow org members in the same organization
- Uses `user_org_ids()` SECURITY DEFINER function — Postgres initPlan caching for efficiency
- Fixes null email/full_name for invited (pending) members visible in TeamSection

### `supabase/migrations/20260416150000_org_members_invited_email.sql`
- Added `invited_email text` column to `org_members`
- Stores the email address used at invite time — displayed in Team list for pending members whose profile may not yet be visible via RLS

---

## Phase 13: org-onboarding-cleanup — Remove legacy profile_id RLS — 2026-04-16

### `supabase/migrations/20260416130000_remove_legacy_profile_rls.sql`
- Dropped legacy `profile_id = auth.uid()` RLS policies from `credit_packages` and `client_workspaces` (replaced by org-scoped policies from Phase 9)
- Dropped `profile_id` FK columns from `credit_packages` and `client_workspaces` — `organization_id NOT NULL` is the new access axis
- Dropped org-config columns migrated to `organizations` in Phase 9: `clickup_list_ids`, `nextcloud_client_root`, `support_task_id`, `clickup_chat_channel_id` from `profiles`
- Dropped `on_profile_list_change` trigger (superseded by org-level routing)
- Migration is idempotent — all DROPs use IF EXISTS
- Safety gate: aborts if org policies are missing, aborts if any profile_id-based policies remain

---

## Phase 12: org-admin-page — Admin RLS write policies — 2026-04-16

### `supabase/migrations/20260416120000_org_admin_write_rls.sql`
- New RLS policies on `org_members` for admin users:
  - SELECT: admins can read all rows in their organization (not just own row)
  - UPDATE: admins can update role on any row in their organization
  - DELETE: admins can delete any row in their organization
- Uses `public.user_org_role(organization_id) = 'admin'` check — relies on Phase 9 helper function

### `src/modules/organisation/` (new module)
- `pages/OrganisationPage.tsx` — admin-only page at `/organisation`; redirects non-admins to `/tickets`
- `components/OrgInfoSection.tsx` — displays org name, slug, credit package info (read-only)
- `components/TeamSection.tsx` — table of org members with name, email, role, invite date
- `components/MemberRowActions.tsx` — role change dropdown + remove member action (admin only)
- `components/InviteMemberDialog.tsx` — invite new member by email (sends magic link)
- `components/RolesInfoSection.tsx` — explains admin/member/viewer role differences
- `hooks/useOrgMembers.ts` — React Query hook fetching all org_members with joined profile data
- `hooks/useMemberActions.ts` — mutations for update role, remove member

### `src/app/routes.tsx`
- Added `/organisation` route (lazy-loaded `OrganisationPage`)

### Tests added
- `src/modules/organisation/__tests__/OrgInfoSection.test.tsx`
- `src/modules/organisation/__tests__/TeamSection.test.tsx`
- `src/modules/organisation/__tests__/MemberRowActions.test.tsx`
- `src/modules/organisation/__tests__/InviteMemberDialog.test.tsx`
- `src/modules/organisation/__tests__/useMemberActions.test.ts`

---

## Phase 11: org-frontend-auth — OrgProvider + RLS for client reads — 2026-04-15

### `supabase/migrations/20260415120000_org_rls_and_credit_rpc.sql`
- RLS policy on `org_members`: members can read their own membership row (`profile_id = auth.uid()`)
- RLS policy on `organizations`: members can read the org they belong to
- New RPC `get_org_credit_balance(p_org_id uuid)` — sums `credit_transactions.amount` for the org; SECURITY DEFINER, stable

### `src/shared/hooks/useOrg.ts` (new file)
- `OrgProvider` React context provider — fetches org + role on mount via `org_members → organizations` join
- Exposes: `organization`, `orgRole` (`'admin' | 'member' | 'viewer'`), `isAdmin`, `isMember`, `isViewer`, `isLoading`
- Legacy fallback: if no org_members row found, treats user as `member` (backward compatibility)

### `src/shared/types/organization.ts` (new file)
- `Organization` interface matching the `organizations` table shape

### Frontend role guards (tickets module)
- `TaskActions` — Freigeben / Änderungen anfordern buttons hidden for viewer-role users
- `CreditApproval` — cost approval button hidden for viewers
- `TicketsPage` NewTaskButton — hidden for viewers

### `src/shared/__tests__/useOrg.test.tsx` (new file)
- Tests for OrgProvider context value, legacy fallback, role flag derivation

---

## Phase 9-10: org-db-foundation + org-backend — Organizations schema — 2026-04-14

### `supabase/migrations/20260414200000_org_foundation.sql`
- New table `organizations` (id, name, slug unique, clickup_list_ids jsonb, nextcloud_client_root, support_task_id, clickup_chat_channel_id, created_at, updated_at)
- New table `org_members` (id, organization_id FK, profile_id FK, role CHECK IN ('admin','member','viewer'), created_at; UNIQUE organization_id+profile_id)
- `organizations_updated_at` trigger using existing `set_updated_at()` function
- SQL helpers: `user_org_ids()` (SECURITY DEFINER, stable, returns org IDs for current user), `user_org_role(org_id uuid)` (returns role string or NULL)
- FK columns added (nullable): `organization_id` on `credit_packages`, `client_workspaces`, `profiles`, `credit_transactions`
- Data migration: each existing profile → one org (slug from email domain) + one org_members row (role='admin') + back-fill all FK columns
- NOT NULL enforced on `credit_packages.organization_id` and `client_workspaces.organization_id` after back-fill
- Dual-mode RLS added: org-scoped SELECT policies on `credit_packages` and `client_workspaces` (ORed alongside existing profile_id policies)
- `notifications_type_check` constraint extended to include: `member_invited`, `member_removed`
- Performance indexes: `org_members(profile_id)`, `org_members(organization_id)`
- Migration gate: asserts org_members count == profiles count, no NULL clickup_list_ids

### Edge Functions updated for org-aware routing
- `fetch-clickup-tasks` — reads `clickup_list_ids` from `organizations` (via `org_members` join) instead of `profiles`
- `clickup-webhook` — `findProfilesForTask()` resolves recipients via `org_members` (all members of the org); deduplicates by profile_id
- `credit-topup` — groups by `organization_id` for monthly top-up
- `nextcloud-files` — reads `nextcloud_client_root` from `organizations`
- `create-clickup-task` — reads `list_id` from org-level `clickup_list_ids`
- `send-reminders` — groups by org, sends per-member digests

### `supabase/functions/_shared/org.ts` (new file)
- `getNonViewerProfileIds(supabase, profileIds)` — batch helper; filters profile IDs to admin/member roles only; permissive fallback on DB error

---

## Phase 14: role-based-guards — Viewer role gaps closed — 2026-04-15

### `src/modules/projects/components/steps/StepActionBar.tsx`
- Added `useOrg().isViewer` guard: returns `null` early when the current user is a viewer
- Viewer-role users no longer see "Freigeben" / "Änderungen anfordern" action bar when a project step is in CLIENT REVIEW

### `src/modules/projects/components/steps/__tests__/StepActionBar.test.tsx` (new file)
- 2 new tests: (1) renders action bar for admin/member users; (2) renders nothing for viewer-role users

### `supabase/functions/_shared/org.ts`
- Added `getNonViewerProfileIds(supabase, profileIds)` batch helper
- Queries `org_members` for all supplied profile IDs, returns only those with `role IN ('admin', 'member')`
- Permissive fallback: returns full input array on query error (safe degradation)

### `supabase/functions/clickup-webhook/index.ts`
- Applied `getNonViewerProfileIds` filter in both `task_review` and `step_ready` email dispatch blocks
- Viewer-role org members no longer receive action-required emails (task_review, step_ready)
- Bell (in-app) notifications remain unfiltered — viewers still see notification badges

**Verification:** 8/8 PASS. Build clean. 2 new tests pass. 382 existing tests pass.

---

## Triage Agent — Maxi AI Core v3.3.0 Support — 2026-04-14

### `supabase/functions/_shared/wp-audit.ts`
- Added `bootstrap-session` as the first ability call before any other Maxi AI Core requests (v3.3.0 requirement — other abilities are blocked until bootstrap succeeds)
- Graceful degradation: bootstrap failure does not block triage; audit proceeds without site context
- Added `WpOperatorNote` interface for the new operator-notes data shape
- Added `language` and `timezone` fields to `WpSiteAudit` (sourced from `get-site-info`)
- Added `operator_notes` field to `WpSiteAudit` — active, site-specific operator instructions fetched from WordPress
- Updated `formatAuditForPrompt` to include language, timezone, and an "Operator Instructions" section in the prompt sent to Claude
- Added `VALID_PRIORITIES` set for safe priority validation

### `supabase/functions/_shared/skills/triage_agent.md`
- Added "Site-Specific Operator Instructions" section instructing Claude to treat operator-notes as authoritative rules that override default estimation logic

### `src/__tests__/wp-audit.test.ts`
- Added 8 new tests covering: bootstrap call ordering, operator-notes formatting, priority sorting, and graceful degradation on bootstrap failure

---

## Staging Environment Setup — 2026-04-06

### Infrastructure
- **Git tag `v1.0-stable`** — rollback anchor created on `main` branch HEAD before staging work began
- **`staging` branch** — created from `main`; now the standard pre-production integration branch

### vercel.json (staging branch only)
- Removed `/auth/v1/*` proxy block — Cloud Supabase (supabase.co) handles CORS natively, proxy not needed for staging

### New GitHub Actions workflow
- **`.github/workflows/deploy-edge-functions-staging.yml`** — on push to `staging` branch: uses Supabase CLI to deploy all 17 Edge Functions to the staging Cloud Supabase project (`ahlthosftngdcryltapu`)

### New scripts
- **`scripts/sync-staging-secrets.ts`** — SSH to production Coolify server, reads Edge Function secrets, pushes all 15 to staging project via Supabase Management API
- **`scripts/sync-staging-schema.ts`** — `pg_dump` production public schema, apply to staging via Management API; supports `--dump-only` and `--apply-only` flags

### New reference doc
- **`docs/staging-env-reference.txt`** — staging environment variables, project refs, service role keys, site URL

### Cloud Supabase staging project (`ahlthosftngdcryltapu`)
- 17 tables created: profiles, task_cache, comment_cache, notifications, project_config, project_task_cache, step_enrichment, client_workspaces, credit_transactions, credit_packages, project_access, project_memory, project_chapters, project_steps, support_tasks, support_messages, channel_subscriptions
- All RLS policies applied; functions and triggers in place
- 15 Edge Function secrets configured
- Auth `site_url` set to `https://staging.portal.kamanin.at`
- 17 Edge Functions deployed

### Vercel staging
- Branch-specific env vars added: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` pointing to staging Cloud Supabase
- Custom domain `staging.portal.kamanin.at` mapped to `staging` branch

### GitHub Secrets
- Added `STAGING_PROJECT_REF` (ahlthosftngdcryltapu) and `SUPABASE_ACCESS_TOKEN` for CI workflow

---

## Bug Fixes Batch — 2026-04-04

### Task 1: Disable Aufgaben module for Thomas Oeben
- **DB only:** Set `client_workspaces.is_active = false` for thomas.oeben@helferportal.de's `tickets` workspace entry
- No code changes required — `useWorkspaces` already filters `is_active = true`, so the module disappears from sidebar automatically

### Task 2: Phase transition emails
- **Finding only:** Phase transition emails are already implemented in `supabase/functions/clickup-webhook/index.ts` (line 761) via chapter completion check
- No changes needed

### Task 3: Project task reminder emails (every 3 days)
- **`supabase/functions/_shared/emailCopy.ts`** — added `project_reminder` email type with German copy and CTA to `/projekte`
- **`supabase/functions/send-mailjet-email/index.ts`** — added `project_reminder` case
- **`supabase/functions/send-reminders/index.ts`** — new block queries `project_task_cache` for tasks in `client review` status idle 3+ days, resolves recipient profiles via `project_access` table, atomic claim pattern for concurrency safety; uses separate `profiles.last_project_reminder_sent_at` column (distinct from ticket reminder tracking)
- **DB migration:** `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_project_reminder_sent_at timestamptz`

### Task 4: Mobile sidebar Verlauf/credit history navigation bug
- **`src/shared/components/layout/CreditBalance.tsx`** — added optional `onNavigate?: () => void` prop; `Link to="/konto#guthaben"` now calls `onNavigate` on click to close the mobile sidebar before navigation
- **`src/shared/components/layout/SidebarUtilities.tsx`** — passes `onNavigate` callback to `CreditBalance`

### Task 5: Desktop sidebar UX overhaul (persistent expand/collapse)
- **`src/shared/components/layout/AppShell.tsx`** — sidebar expanded state lifted here from `Sidebar.tsx`; backed by `localStorage` key `portal-sidebar-expanded`, default `true` (expanded); passes `expanded` + `onToggle` props to `Sidebar`
- **`src/shared/components/layout/Sidebar.tsx`** — now accepts `expanded: boolean` + `onToggle: () => void` props; removed hover auto-expand behavior; added toggle button (`SidebarLeft01Icon` from Hugeicons) in logo area
- **Main content layout** — uses `md:ml-[260px]` when expanded, `md:ml-14` when collapsed, with `transition-[margin-left] duration-200` for smooth animation

### Task 6: Support Chat icon update
- **`src/shared/components/layout/SidebarUtilities.tsx`** — replaced `CustomerServiceIcon` (headset) with `BubbleChatIcon` (chat bubble)
- **`src/shared/components/layout/BottomNav.tsx`** — same icon replacement
- **`src/modules/projects/components/SidebarWorkspaces.tsx`** — same icon replacement (if applicable)

---

## Docs correction: Magic Link status — 2026-03-31

- **`docs/ARCHITECTURE.md`** — corrected line stating "Magic link disabled until GoTrue SMTP is configured"; Magic Link is enabled and working via Mailjet + `auth-email` Edge Function
- **`docs/system-context/TECH_CONTEXT.md`** — same correction applied
- **`docs/DECISIONS.md`** — added ADR-027 documenting that Magic Link auth is enabled and recording the delivery mechanism (`auth-email` Edge Function → Mailjet)

---

## Upload Progress Bars + Remove 50 MB Limit — 2026-03-31

- **`src/shared/lib/upload-with-progress.ts`** — new shared XHR-based upload utility; replaces `fetch()` for all file uploads to enable native `progress` event reporting
- **`src/modules/files/components/UploadProgressBar.tsx`** — new animated progress bar component; exports `UploadItem` interface for multi-file upload state tracking; auto-dismisses at 100% after 2.5s
- **`src/modules/files/hooks/useClientFiles.ts`** — removed `MAX_FILE_SIZE` limit; `uploadClientFile` now accepts optional `onProgress` callback
- **`src/modules/projects/hooks/useNextcloudFiles.ts`** — removed `MAX_FILE_SIZE`; `useUploadFile` and `useUploadFileByPath` mutation args changed from `File` to `{ file, onProgress? }`
- **`src/modules/files/components/ClientActionBar.tsx`** — multi-file upload with per-file progress bars rendered via `UploadProgressBar`
- **`src/modules/projects/components/files/FileUpload.tsx`** — same multi-file + progress pattern
- **`supabase/functions/nextcloud-files/index.ts`** — removed `MAX_UPLOAD_SIZE` check from `upload` and `upload-client-file` actions (retained for `upload-task-file`)

---

## File/Folder Deletion + Files Module Root Restrictions — 2026-03-31

- **`supabase/functions/nextcloud-files/index.ts`** — added `delete` (project) and `delete-client` (client files) WebDAV DELETE actions
- **`src/modules/files/hooks/useClientFiles.ts`** — added `useDeleteClientItem` hook
- **`src/modules/projects/hooks/useNextcloudFiles.ts`** — added `useDeleteItem` hook
- **`src/modules/files/components/ClientFolderView.tsx`** — root level is now read-only (upload/create buttons replaced with hint text); subfolder items show trash icon on group-hover with `ConfirmDialog` before deletion
- **`src/modules/files/components/ClientFileRow.tsx`** — optional `onDelete` prop + group-hover trash icon
- **`src/modules/projects/components/files/FolderView.tsx`** — folder items get trash icon; `FileRow` receives `onDelete`; `ConfirmDialog` guards deletion
- **`src/modules/projects/components/files/FileRow.tsx`** — optional `onDelete` prop + group-hover trash icon
- **Business rules:** Files module root = read-only (top-level folders are admin-controlled structure); Files module subfolders = full CRUD; Project chapter root folders = cannot be deleted; inside chapter folders = files and subfolders can be deleted

---

## Hilfe FAQ Page + GitHub Actions Cleanup — 2026-03-31

### Hilfe FAQ Page
- **`src/shared/lib/hilfe-faq-data.ts`** — new data file with `FaqItemData` / `FaqSectionData` types and `FAQ_SECTIONS` array (6 sections, 20 items, German Sie-form): Projekte, Tickets & Anfragen, Dateien, Kredite, Benachrichtigungen, Konto & Einstellungen
- **`src/shared/components/help/FaqItem.tsx`** — independent accordion item: AnimatePresence height animation, chevron rotation, `isLast` border separator
- **`src/shared/components/help/FaqSection.tsx`** — section card: Hugeicons icon + h2 + divider + FaqItem list
- **`src/shared/pages/HilfePage.tsx`** — replaced placeholder with full FAQ page; `ICON_MAP` resolves iconName strings to Hugeicons components; whileInView stagger animation on section cards
- Tests added for FaqItem, FaqSection, HilfePage; `IntersectionObserver` mock added to `src/test/setup.ts` for jsdom compatibility
- `tsconfig.app.json` updated to exclude test files from production build
- Fixed icon name inconsistency: `FolderOpenIcon` (not `FolderOpen01Icon`) in both data and ICON_MAP

### GitHub Actions Cleanup
- Deleted `.github/workflows/claude-code-review.yml` and `.github/workflows/claude.yml`
- Reason: Claude Code GitHub App not installed, `ANTHROPIC_API_KEY` not in GitHub Secrets — these workflows caused CI failures on every push

---

## Bidirectional Nextcloud File Activity Sync — 2026-03-31

- **`project_file_activity` extended** with `source`, `nextcloud_activity_id`, `actor_label` columns + partial unique index; new **`client_file_activity`** table (profile-scoped, RLS) for Files module
- **`nextcloud-files` Edge Function** gains `sync_activity` and `sync_activity_client` actions that call the Nextcloud OCS Activity API and upsert deduped records via `nextcloud_activity_id`
- **Projects module** auto-syncs activity on mount (`useSyncFileActivity`), renders folder path + actor in `FileActivityItem`, supports download on click; **Files module** gains "Letzte Aktivität" section reusing the same component and logs portal uploads/folder creates to `client_file_activity`

---

## Recommendations Decline Fix — 2026-03-30

- **Block clears after decline**: `TaskDetail.tsx` exclusion list now includes `'cancelled'` — block no longer reappears after re-opening a declined task
- **Auto-comment on decline**: `decline_recommendation` always posts "Empfehlung abgelehnt." to ClickUp (+ optional user reasoning); mirrors accept flow
- **No double-post**: Generic comment handler guarded with `action !== 'decline_recommendation'`
- **Tag cache cleanup**: `task_cache.tags` updated immediately on accept/decline to remove `recommendation` tag before webhook fires

---

## Projects Module Overhaul — 2026-03-30

### FilesTab → Full Nextcloud Folder Browser
- FilesTab in project overview now shows the full Nextcloud folder structure (dynamic from Nextcloud, not hardcoded chapters)
- Root level shows folder cards + root files; clicking opens FolderView with breadcrumbs, upload, create subfolder
- Extracted `FileBrowser` component reused by both overview tab and standalone DateienPage
- `useNextcloudFilesByPath` now supports empty subPath for root listing
- Deleted old 8-recent-files FilesTab implementation

### StepDetail Simplified
- Removed 3-tab layout (Übersicht, Dateien, Diskussion) → single scrollable view
- New layout: header → action bar (client review) → description + AI enrichment → divider → comments inline
- StepActionBar (Freigeben/Änderungen anfragen) kept for client review flow
- Deleted: StepFilesTab, StepDiscussionTab, StepOverviewTab (dead code)

### Quick Links Streamlined
- Reduced from 5 to 3 external-only quick links: Staging-Website, Content-Editor, Video-Anruf
- Removed "Nachricht senden" and "Dateien hochladen" (duplicated tabs on same page)
- Deleted MessageSheet and UploadSheet components
- Removed `general_message` and `files` destination kinds from quick actions pipeline
- Removed subtitle from all quick action cards
- DynamicHero: removed "Nachricht senden" ghost CTAs from priority 2/3 states

### PhaseTimeline Cleanup
- Removed tooltip on hover (showed stale AI narrative text)
- Removed narrative text line from ContextStrip
- Removed "Team arbeitet an..." status line from ContextStrip
- Removed border-bottom separator from ContextStrip
- Fixed chapter_config clickup_cf_option_id mapping in Supabase (was shifted by 1)

### DynamicHero CTA
- Removed "Nachricht senden" ghost button from client review CTA card (priority 1)

## Docs Restructuring — 2026-03-29 (260329-hjo)

- Deleted 5 stale docs (STATUS.md, WORKING_GUIDE.md, bootstrap-prompt.md, REPOSITORY_MAP.md, and superpowers/) — superseded by CLAUDE.md and GSD workflow
- Deleted .planning/codebase/ (7 files — ARCHITECTURE, STACK, CONVENTIONS, etc.) — duplicated docs/ content
- Renamed docs/planning/ → docs/domain/ (business/domain documents, not GSD planning artifacts)
- Moved docs/TICKET_AUDIT_REPORT.md → docs/audits/ticket-audit-report.md
- Updated all agent definitions: React 19, Hugeicons/Phosphor icon stack, removed PORTAL_staging/superpowers references
- Updated README: reflects single-repo reality, production status, current docs structure
- Added ADR-023 (docs restructuring) and ADR-024 (icon library migration)

## UI Audit Fixes + Typography Scale — 2026-03-29 (260329-gkb, commit 02b0ce6)

- Typography scale applied across all pages (spacing cleanup)
- German translation fixes for UI strings
- CORS security hardening: removed stale lovable.app origins, added Vercel preview URL pattern

## Projects Module Audit — 2026-03-29 (260329-fhb, commit 17050f4)

- 22 findings audited, 4 critical broken pipelines fixed
- AI enrichment pipeline, project memory flow, file browser, step discussion fixed

## Credit History + Hugeicons Migration — 2026-03-29 (commit 984a424)

- Credit history section added to Konto page (full transaction ledger visible to clients)
- Icon library migrated to Hugeicons as primary (@hugeicons/react + @hugeicons/core-free-icons)
- Phosphor Icons added as secondary (@phosphor-icons/react)
- Lucide React removed as primary icon source (existing references left in place)

## Mobile UX Polish Round 2 — 2026-03-27

### Bug Fixes
- **Fixed mobile keyboard covering input** — Added `interactive-widget=resizes-content` to viewport meta tag. Layout viewport now resizes when keyboard opens, keeping sticky inputs visible.
- **Fixed inbox accordion alignment** — Expanded content now uses `pl-9 pr-5` to align with title text (after unread dot). Removed duplicate TypeBadge/date from expanded section.
- **Fixed file-only sends failing** — Both `post-task-comment` and `send-support-message` Edge Functions now allow empty text when files are attached. `display_text` uses "📎 Dateianhang" placeholder.

### Features
- **Auto-scroll to latest message** — SupportChat and TaskComments now scroll to the most recent message on load and after sending. Also works in StepDiscussionTab (projects) via TaskComments.
- **Task filters horizontal scroll on mobile** — Filter chips now scroll horizontally instead of wrapping into 4 rows, using `overflow-x-auto` + `flex-nowrap` on mobile.
- **Sidebar swipe gesture** — New `useSwipeGesture` hook enables opening sidebar by swiping right from left edge (20px) and closing by swiping left. Vanilla touch events, passive listeners, vertical scroll guard.

### Files Changed
- `index.html` — viewport meta interactive-widget
- `src/modules/tickets/components/SupportChat.tsx` — auto-scroll
- `src/modules/tickets/components/TaskComments.tsx` — auto-scroll
- `src/modules/tickets/components/TaskFilters.tsx` — mobile horizontal scroll
- `src/shared/components/inbox/NotificationAccordionItem.tsx` — alignment fix
- `src/shared/components/layout/AppShell.tsx` — swipe gesture
- `src/shared/hooks/useSwipeGesture.ts` — new hook
- `supabase/functions/post-task-comment/index.ts` — file-only send
- `supabase/functions/send-support-message/index.ts` — file-only send

## Mobile UX + File Attachments + Inbox Improvements — 2026-03-26

### Bug Fixes
- **Fixed file attachments not sending to ClickUp** — Frontend FileData interface used `data` field but `post-task-comment` and `send-support-message` Edge Functions expected `base64`. Standardized all layers to `base64` + added `size` field. Files were silently dropped before this fix.
- **Fixed mobile chat input scrolling away** — Made CommentInput sticky at bottom in TaskDetailSheet and SupportPage. Fixed SupportPage container height to account for BottomNav (64px) using `dvh` units.
- **Fixed project timeline overflow on mobile** — Added `overflow-x-auto` to PhaseTimeline container with `shrink-0` on mobile nodes for horizontal scroll.
- **Hidden redundant Support button on mobile** — TicketsPage top bar Support button now `hidden md:flex` since BottomNav already provides Support access.
- **Reduced CommentInput size on mobile** — Uses `useBreakpoint` to set minRows=1/maxRows=4 on mobile (was 3/8), reducing textarea from 84-184px to 44-104px.

### Features
- **Inbox mobile accordion** — Tapping a notification on mobile now expands it inline with full title, full message (linkified), type badge, and date. Uses Motion for smooth animation.
- **"Zur Aufgabe" navigation link** — Both desktop detail panel and mobile accordion now show a "Zur Aufgabe" button for task-related notifications, navigating to `/tickets?taskId=...`.
- **Inbox component extraction** — `NotificationAccordionItem`, `NotificationDetailPanel`, `TypeBadge`, and `formatDate` utility extracted into `src/shared/components/inbox/`.

### Files Changed
- `src/modules/tickets/types/tasks.ts` — FileData: `data` → `base64`, added `size`
- `src/modules/tickets/components/CommentInput.tsx` — fileToBase64 fix + sticky + mobile sizing
- `src/modules/tickets/hooks/useCreateTask.ts` — fileToBase64 fix
- `supabase/functions/create-clickup-task/index.ts` — `file.data` → `file.base64`
- `src/modules/tickets/pages/TicketsPage.tsx` — Support button hidden on mobile
- `src/modules/tickets/pages/SupportPage.tsx` — dvh height fix
- `src/modules/projects/components/overview/PhaseTimeline.tsx` — overflow-x-auto
- `src/shared/pages/InboxPage.tsx` — mobile accordion + task link
- `src/shared/components/inbox/` — 4 new files (accordion, detail panel, badge, utils)

## Phase 0: Discovery — 2026-03-10
- Analyzed Lovable codebase at tasks/
- Generated Supabase types from cloud project
- Produced discovery report
- Identified reusable hooks: useClickUpTasks, useTaskComments, useTaskActions, useNotifications, useUnreadCounts, useSupportTaskChat
- Identified 11 Edge Functions to reuse
- Migrated schema to self-hosted Supabase (portal.db.kamanin.at)
- Fixed 3 bugs in schema: type error in handle_profile_list_change, column name error (context → context_type), added missing on_auth_user_created trigger

## Phase 1: Scaffold — 2026-03-10
- Created Vite + React 18 + TypeScript project
- Installed: Tailwind v4, TanStack React Query, React Router v6, Lucide React, Supabase JS
- Created tokens.css with all design tokens from SPEC.md
- Configured Tailwind v4 @theme inline mapping
- Created Supabase client (src/shared/lib/supabase.ts)
- Created AuthProvider + useAuth hook (email/password + magic link + reset)
- Created AppShell: Sidebar (56px collapsed → 260px expanded, 0.2s), MobileHeader (52px), MobileSidebarOverlay, BottomNav (64px)
- Created routing: /uebersicht, /aufgaben, /nachrichten, /dateien, /support, /hilfe, /login
- Created Login page: email/password + magic link + password reset, all German
- TypeScript strict mode: 0 errors

## Phase 2: Project Experience Module — 2026-03-10
- Created src/modules/projects/types/project.ts — TypeScript interfaces (Project, Chapter, Step, Update, FileItem, Message, ProjectTask)
- Created src/modules/projects/lib/phase-colors.ts — PHASE_COLORS map + getPhaseColor()
- Created src/modules/projects/lib/helpers.ts — all helper functions from SPEC.md Section 8
- Created src/modules/projects/lib/mock-data.ts — "Praxis Dr. Weber" mock project (exact from prototype)
- Created src/modules/projects/hooks/useProject.ts, useHeroPriority.ts, useChapterHelpers.ts
- Created PhaseNode + PhaseTimeline — horizontal 4-phase stepper, completed/current/upcoming states, pulse animation
- Created DynamicHero — priority cascade (awaiting_input → tasks → upcoming → all done), phase-tinted background, top accent line
- Created QuickActions — 3-column grid, counter pills, hover icon color swap
- Created UpdateItem + UpdatesFeed — type-icon rows (file/status/message)
- Created OverviewTabs — Updates / Dateien / Nachrichten with compact file/message lists
- Created ContextStrip — PhaseTimeline + narrative + team status line
- Created OverviewPage — assembles all 5 sections
- Created StepDetail — 3 tabs (Übersicht/Dateien/Diskussion), action bar for awaiting_input, expandable sections, drop zone, chat bubbles
- Created StepsPage — chapter accordion with step list
- Created TasksPage, FilesPage (phase folders + filters), MessagesPage (grouped by step), ProjectHelpPage (bridge pages)
- Updated UebersichtPage, NachrichtenPage, DateienPage to use real components
- Added /uebersicht/* nested routes + phase-pulse keyframe
- Build: 0 TypeScript errors


## Monorepo + Edge Functions Deployment — 2026-03-12

### Repo Restructure (ADR-007)
- Flattened project: React app at repo root, Edge Functions at `supabase/functions/`
- Pushed to GitHub: `kamanin-lab/portal` (initial commit `21b9330`)
- Old dirs (`kamanin-portal/`, `tickets/`) gitignored as local reference

### Edge Functions Deployment (ADR-008)
- Deployed 12 Edge Functions to self-hosted Supabase via Coolify volume mount
- Added `supabase/functions/main/index.ts` — official router using `EdgeRuntime.userWorkers.create()`
- Fixed: `index.ts` files created as directories instead of files (caused "Is a directory" boot error)
- Fixed: placeholder `main/index.ts` caught all requests instead of routing to workers
- All 12 functions responding: fetch-clickup-tasks, fetch-task-comments, fetch-single-task, post-task-comment, update-task-status, clickup-webhook, fetch-project-tasks, send-mailjet-email, create-clickup-task, auth-email, send-feedback, send-support-message
- Env vars (CLICKUP_API_TOKEN, MAILJET keys, ANTHROPIC_API_KEY) set via Coolify UI
- Copied `.claude/skills/clickup-api/` (9 files) and `.env.local` from old `kamanin-portal/` to project root
- Old directories (`kamanin-portal/`, `tickets/`) safe to delete — all content verified migrated

## Phase 3.5: AppShell Redesign + Ticket UI Restoration — 2026-03-11

### Step 1: Workspace Registry
- Created `client_workspaces` Supabase table with RLS (ADR-003)
- Created `src/shared/hooks/useWorkspaces.ts` — fetches active modules per user
- Created `src/shared/lib/workspace-routes.ts` — maps module_key → route + children

### Step 2: Linear-style Sidebar + InboxPage + WorkspaceGuard
- Rebuilt `Sidebar.tsx` with 3 zones (Global / Workspaces / Utilities) — ADR-004
- Extracted sub-components: SidebarGlobalNav, SidebarWorkspaces, SidebarUtilities, SidebarUserFooter
- Created `InboxPage.tsx` — two-panel notification inbox, support chat excluded, pagination
- Created `WorkspaceGuard.tsx` — redirects to /inbox if module not active
- Created `MeineAufgabenPage.tsx` — redirects to /tickets?filter=needs_attention
- Updated `BottomNav.tsx` → Inbox / Aufgaben / Support / Mehr
- Updated `MobileSidebarOverlay.tsx` → 3-zone mobile nav
- Updated `AppShell.tsx` → added /inbox PAGE_TITLE
- Updated `routes.tsx` → default redirect → /inbox, added /inbox + /meine-aufgaben, removed /tickets/:id, added WorkspaceGuard on /tickets + /support

### Step 3: Ticket UI Restoration (Lovable parity)
- CORS fix: added localhost:5173 + localhost:5174 to Edge Function allowed origins
- Created `status-dictionary.ts` — STATUS_LABELS, PRIORITY_LABELS, ACTION_LABELS, mapClickUpStatus()
- Fixed `dictionary.ts` labels: needs_attention → 'Ihre Rückmeldung', newTicket → 'Neue Aufgabe'
- Fixed `StatusBadge.tsx` label: needs_attention → 'Ihre Rückmeldung'
- Rebuilt `TaskCard.tsx` — rich cards (preview text, priority badge, assignee indicator, onTaskClick prop)
- Rebuilt `TaskFilters.tsx` — live status counts, "Mehr" dropdown for on_hold/cancelled
- Updated `TaskList.tsx` — uses mapStatus() for filtering (fixes silent bug), searchQuery prop, grid layout
- Created `TaskSearchBar.tsx` — search by task name
- Created `SyncIndicator.tsx` — sync timestamp + refresh trigger
- Created `NewTaskButton.tsx` — accent button with new task label
- Created `TaskDetailSheet.tsx` — Radix Dialog slide-over, URL-based state
- Updated `TaskDetail.tsx` — removed back button, added onClose prop, uses mapStatus() (fixes TaskActions bug)
- Rebuilt `TicketsPage.tsx` — full Lovable layout (search + filters + sync + grid + sheet)
- Deleted `TicketDetailPage.tsx` (replaced by TaskDetailSheet)
- Added CSS animations: fadeIn, slideInRight, slideOutRight
- Build: 0 TypeScript errors, production build clean

## Phase 3.6 — Project Task Creation, Priority Icons, AI Enrichment (2026-03-13)

### Project Task Creation
- **NewTicketDialog**: dual mode (`ticket` / `project`) — reused for both ticket and project task creation
  - Project mode: receives `listId`, `chapters`, `phaseFieldId` from project config
  - Priority selector: 4 buttons (Dringend/Hoch/Normal/Niedrig) with PriorityIcon
  - Chapter/phase dropdown (project mode only)
- **QuickActions**: "Aufgaben öffnen" → "Aufgabe erstellen" with Plus icon, `onCreateTask` prop
- **DynamicHero**: added "Aufgabe erstellen →" CTA in awaiting_input priority state
- **OverviewPage**: integrates NewTicketDialog in project mode, builds chapter options from project.chapters
- **create-clickup-task Edge Function**: dual mode — ticket (profile's ClickUp list) or project (explicit listId + chapter custom field)

### Priority Icons
- Redesigned to volume-bar style: Low=1 bar, Normal=2 ascending bars, High=3 ascending bars, Urgent=AlertCircle
- Ghost/inactive bars visible with opacity 0.15
- Ascending height ratios: [0.35, 0.65, 1.0]

### UpdatesFeed
- Added pagination: 10 items default, "Mehr anzeigen" button (+10 per click)

### AI Enrichment Fixes
- Fixed off-by-one: prompt task numbering starts from 0 (matching `task_index` in response)
- Fixed JSON parsing: strip markdown code block wrapper (`\`\`\`json ... \`\`\``) from Claude response
- Increased `max_tokens`: 2000 → 4000

### Type Changes
- `Project`: added `clickupListId`, `clickupPhaseFieldId`
- `Chapter`: added `clickupCfOptionId`
- `CreateTaskInput`: added `listId?`, `phaseFieldId?`, `phaseOptionId?`
- `transforms-project.ts`: passes through new ClickUp fields from config

### New: docs/ideas/
- Created `docs/ideas/` folder for future feature proposals
- `knowledge-base.md`: per-client AI knowledge base architecture (planned Phase 4+)

## Phase 3.7 — UX Polish: Links, Inbox, Meine Aufgaben, Sheet fixes (2026-03-13)

### Clickable Links in Chat & Inbox
- Created `src/shared/lib/linkify.tsx` — `linkifyText()` utility, detects URLs and renders as `<a>` tags
- Applied in `MessageBubble.tsx` — chat messages now have clickable links (accent color, underline, opens in new tab)
- Applied in `InboxPage.tsx` — notification messages also linkified

### Inbox Cleanup
- Removed redundant "Als gelesen markieren" button from detail panel — notifications are already auto-marked as read on selection via `handleSelect()`
- Simplified `DetailPanel` props (removed `onMarkRead`)

### Meine Aufgaben — Dedicated Page (ADR-011)
- Replaced `<Navigate>` redirect with full page component
- Shows only tasks with `client review` status (needs_attention)
- Grouped by workspace (`list_name`) with section dividers
- Sorted by priority (urgent first), then by date
- Click → TaskDetailSheet (URL-based `?taskId=xxx`)
- Empty state: "Keine offenen Aufgaben — alles erledigt!"
- Reuses existing TaskCard, TaskDetailSheet, useClickUpTasks

### NewTicketDialog → Sheet
- Converted from centered popup to right-side Sheet (matching TaskDetailSheet pattern)
- Added file attachment support: Paperclip button, attachment pills, max 5 files / 10MB
- Fixed z-index bug: overlay z-40, content z-50 (was z-50/z-[51])

### Sidebar Badge Fix
- `useTaskActions.ts`: now invalidates `['needs-attention-count']` query on status change
- Sidebar badge updates immediately when tasks are approved/actioned

### ClickUp Webhook
- Registered webhook for 11 events (taskCreated, taskUpdated, taskStatusUpdated, etc.)
- Webhook ID: `dce8756d-3a76-4e79-9d95-a21801d6ee8e`
- Inbox notifications now populated via realtime webhook events

## Phase 3.8 — Staging Hardening, Clarity, and Product Polish — 2026-03-20

### Staging workflow and repository clarity
- Created dedicated staging working copy: `PORTAL_staging`
- Replaced template root README with real project README for staging
- Added `docs/STATUS.md`, `docs/REPOSITORY_MAP.md`, and `docs/WORKING_GUIDE.md`
- Moved historical root planning docs out of the active root into `archive/legacy-reference/root-planning/`
- Archived legacy reference trees into `archive/legacy-reference/` to reduce root ambiguity
- Updated `.gitignore` behavior so archived legacy reference content can remain tracked inside staging

### Test and build contract hardening
- Added `test`, `test:watch`, and `test:coverage` scripts to `package.json`
- Added proper `vitest.config.ts` for the active staging app only
- Excluded archived legacy code from active test runs
- Added `@vitest/coverage-v8` so coverage is real, not just declared
- Added focused tests for `transformToProject()` in the projects module
- Confirmed active staging tests pass and build succeeds after each pass

### Performance and bundle improvements
- Added route-level lazy loading for major pages in `src/app/routes.tsx`
- Added route-level loading fallback with `LoadingSkeleton`
- Added Rollup `manualChunks` vendor splitting in `vite.config.ts`
- Reduced the main app entry chunk substantially and removed prior chunk-size warning pressure

### Product polish — tickets
- Improved ticket empty states so they reflect filter/search context instead of generic blanks
- Improved task detail flow to preserve non-task query params and close filter panel on open
- Refined sync indicator wording and sync empty state
- Improved task card preview fallback and due-date visibility
- Added support intro copy to make the support surface feel more product-complete

### Product polish — projects and shared flows
- Added loading and empty states to `UebersichtPage`, `NachrichtenPage`, and `DateienPage`
- Improved empty state handling in project files page
- Replaced blank `WorkspaceGuard` loading state with a proper loading shell
- Replaced imperative login redirect side-effect with declarative `<Navigate>`
- Improved Inbox and MeineAufgaben loading / empty states

## Phase 4.1: Nextcloud Folder Navigation — 2026-03-22

### Edge Function: nextcloud-files
- Added `mkdir` action: recursive WebDAV MKCOL — creates the full folder tree including intermediate directories
- Added `sub_path` parameter to `list` and `upload` actions for arbitrary path navigation within a project root
- Added `folder_path` parameter to `mkdir` for specifying the target folder path
- Hardened `isPathSafe`: now also rejects paths containing control characters

### New Components
- `FolderView.tsx` — generic folder browser with breadcrumbs, drill-down navigation, folder creation inline, and upload integration
- `CreateFolderInput.tsx` — inline folder name input with client-side validation

### Modified Components
- `FilesPage.tsx` — replaced `selectedChapter` state with `pathSegments[]` array for path-based navigation
- `FileUpload.tsx` — accepts `subPath` prop to route uploads to the active browsed path
- `UploadSheet.tsx` — rewritten: folder/subfolder selection replaces the prior step-binding UI (see ADR-012)

### Deleted Components
- `ChapterFiles.tsx` — replaced entirely by `FolderView.tsx`

### New Hooks
- `useNextcloudFilesByPath` — path-based file listing (replaces chapter-keyed listing)
- `useUploadFileByPath` — path-based upload mutation
- `useCreateFolder` — folder creation mutation (calls `mkdir` action)

---

## TASK-010: Credit System Phase 1 — 2026-03-23

### Database
- Created `credit_packages` table — monthly allocation per client (package_name, credits_per_month, is_active, started_at)
- Created `credit_transactions` table — full ledger (amount, type: monthly_topup/task_deduction/manual_adjustment, task_id, task_name, description)
- Added `credits` column to `task_cache` — synced via ClickUp webhook custom field handler
- Both tables: RLS + REPLICA IDENTITY FULL for Realtime subscriptions
- Seeded initial package for MBM (25 credits/month) and one monthly_topup transaction

### Edge Functions
- Added `credit-topup` Edge Function — monthly cron job (via pg_cron): reads active packages, inserts monthly_topup transactions, logs result
- Updated `clickup-webhook` — handles credit custom field changes: reads numeric value, diffs against task_cache.credits, inserts task_deduction transaction

### Frontend Components
- `CreditBalance.tsx` — badge showing current balance (SUM of credit_transactions), shown in Sidebar Utilities zone
- `CreditBadge.tsx` — inline credit cost indicator on TaskCard and TaskDetail
- `useCredits.ts` hook — fetches balance + transaction history via Supabase, Realtime-subscribed

### Post-Code Review Fixes (4 blocking)
- Credit balance now derived from transaction ledger SUM (not denormalized column)
- topup date format standardized (YYYY-MM)
- Webhook deduction guards against NULL/non-numeric credit values
- CreditBalance hidden when balance is zero or NULL (not shown to unconfigured clients)

---

## TASK-009: File Management — 2026-03-23

### New Functionality in DateienPage
- Upload files directly from DateienPage (not only from project-context UploadSheet)
- Create new folders inline from DateienPage
- Integrated with `useUploadFileByPath` and `useCreateFolder` hooks
- Breadcrumb-aware: upload/mkdir targets the currently browsed path

### Files Changed: 6

---

## TASK-008: shadcn/ui Migration — 2026-03-23

### shadcn/ui Components Installed
- Installed 8 base components selectively: Button, Badge, Input, Textarea, Tabs, Skeleton, Avatar, AlertDialog
- Components installed into `src/shared/components/ui/` via shadcn CLI
- All components customized via portal CSS tokens — no shadcn defaults overridden directly

### Components Refactored
- `ConfirmDialog` — migrated to shadcn AlertDialog
- `LoadingSkeleton` — migrated to shadcn Skeleton
- `StepDetail` — migrated to shadcn Tabs
- `NewTicketDialog` — migrated to shadcn Input, Textarea, Button
- `UpdatesFeed` — migrated to shadcn Badge

### New Components
- `UserAvatar` (`src/shared/components/common/UserAvatar.tsx`) — shadcn Avatar wrapper with initials fallback and portal token styling

### Design Token Additions (`tokens.css`)
- `--destructive`, `--destructive-foreground` — destructive action color (AlertDialog confirm)
- `--file-*` — file type icon color tokens
- `--priority-*` — priority level color tokens
- `--surface-raised` — elevated surface color (cards, sheets)

### Hardcoded Color Cleanup
- Replaced all hardcoded hex/Tailwind color classes with CSS custom property references across refactored components

---

## TASK-007: Nextcloud Folder Structure + Portal Navigation — 2026-03-22

### Shared Utilities
- Created `supabase/functions/_shared/slugify.ts` — German-aware slug generation (umlaut normalization, kebab-case)

### Edge Function: nextcloud-files
- Chapter folder naming now uses `slugify()` — `01_Konzept`, `02_Design`, etc.
- Client folder structure: `clients/{slug}/` hierarchy enforced

### Frontend: Files Module (`src/modules/files/`)
- Created `src/modules/files/` as a standalone module (separate from projects files)
- `DateienPage.tsx` — client-level file browser using client root from `profiles.nextcloud_client_root`
- `ClientFolderView.tsx` — generic folder browser with breadcrumbs and drill-down
- `ClientFileRow.tsx` — file row with type icon, size, download link
- `ClientActionBar.tsx` — toolbar (upload, create folder)
- `useClientFiles.ts` hook — reads from `profiles.nextcloud_client_root`, calls `nextcloud-files`

### Sidebar
- "Dateien" sidebar entry now routes to the client-level `DateienPage` (not project-scoped files)
- `profiles.nextcloud_client_root` column drives the file root path per user

### Files Changed: 12+

---

## TASK-006: Interactive Dashboard — 2026-03-22

- Created HTML-based project dashboard with visual timeline (`tasks/dashboard.md` format established)
- Dashboard shows task pipeline, completed tasks, residual items
- Timeline view for multi-phase project tracking

---

## TASK-005: Real-Time Updates — 2026-03-22

### Database
- Verified and enabled Supabase Realtime publication for: `task_cache`, `comment_cache`, `notifications`, `project_task_cache`
- Set REPLICA IDENTITY FULL on all Realtime-enabled tables

### Frontend
- Removed all manual polling intervals from hooks
- Supabase client initialized with proper Realtime channel options (reconnect, heartbeat)
- Task subscriptions broadened from UPDATE-only to INSERT + UPDATE + DELETE
- Project data now subscribes via `project_task_cache` Realtime channel
- Added 30s fallback polling (React Query `staleTime`) for Realtime failure recovery

---

## TASK-004: Account Page / Konto — 2026-03-22

- Created `/konto` route and `KontoPage.tsx`
- Profile display: name, email, company, avatar initials
- Notification preferences panel — granular per-type toggles (task_review, task_completed, team_comment, support_response, reminders)
- Email notification master toggle
- Password change flow (Supabase Auth `updateUser`)
- Magic link re-send option
- All German UI; form validation with error toasts
- Files Changed: 22

---

## TASK-003: Nextcloud Files Integration — 2026-03-22

### Edge Function: nextcloud-files
- WebDAV `PROPFIND` for folder listing
- WebDAV `PUT` for file upload
- WebDAV `GET` for file download (proxied)
- WebDAV `MKCOL` for folder creation (recursive — creates full tree)
- Path safety validation (no traversal, no control characters)
- `sub_path` parameter for arbitrary path navigation within project root
- `folder_path` parameter for `mkdir` action

### New Components (projects module)
- `FolderView.tsx` — generic folder browser with breadcrumbs, drill-down, inline folder creation, upload integration
- `CreateFolderInput.tsx` — inline folder name input with client-side validation
- `UploadSheet.tsx` (rewritten) — folder/subfolder selection replaces step-binding UI

### Modified Components
- `FilesPage.tsx` — replaced `selectedChapter` state with `pathSegments[]` for path-based navigation
- `FileUpload.tsx` — accepts `subPath` prop to route uploads to the active browsed path

### Deleted
- `ChapterFiles.tsx` — replaced entirely by `FolderView.tsx`

### New Hooks
- `useNextcloudFilesByPath` — path-based file listing
- `useUploadFileByPath` — path-based upload mutation
- `useCreateFolder` — folder creation mutation

### Files Changed: 12

---

## TASK-002: Project Panel Redesign — 2026-03-22

### Batch 1: Layout Deduplication + Foundation
- Deduplicated layout: single `ContentContainer` wrapper pattern enforced across all project pages
- Removed duplicate max-width wrappers from all project sub-pages
- Established `width="narrow"` as the standard (`max-w-4xl`, centered) — CLAUDE.md rule 11

### Batch 2: Comments, Messaging, Quick Actions, Activity Timeline
- `TaskComments.tsx` — threaded comment display with author avatars, timestamps, portal-vs-team distinction
- `SupportChat.tsx` — chat-style message interface for support tasks
- `SupportSheet.tsx` — slide-over sheet wrapping SupportChat
- Quick actions panel — configurable action buttons with counter pills
- Activity timeline — chronological project event feed
- Files Changed: 21 total (2 batches)

---

## TASK-001: Documentation Audit — 2026-03-22

- Full audit of all project documentation: 27 files reviewed
- Identified and resolved inconsistencies between ARCHITECTURE.md, SPEC.md, CLAUDE.md, and actual codebase
- Added missing `docs/planning/` directory and populated with domain model, delivery rules, product gap list, team operating model, current state map
- Agent team definitions moved to `.claude/agents/` (Claude Code native format)
- Planning docs moved into repository for persistence
- Context Hub references added for React, Tailwind, Vite, Vitest (`docs/reference/context-hub/`)
- Supabase reference documentation added (`docs/reference/supabase-context-hub/`)
- Files Audited: 27

---

## 2026-03-25 — Production Launch, Vercel Deploy, MBM Onboarding, UI Polish

### Infrastructure
- **Vercel deployment** — frontend deployed to Vercel; auto-deploys from `main` branch
  - `vercel.json`: SPA rewrites + auth proxy (`/auth/v1/*` → `portal.db.kamanin.at`)
  - Env vars set for all 3 Vercel environments: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MEMORY_OPERATOR_EMAILS`
  - Custom domain `portal.kamanin.at` → DNS A record → 76.76.21.21
  - No staging branch; Vercel preview deploys on PRs serve as staging
- **Repo consolidation** — `PORTAL_staging` renamed to `PORTAL` (single canonical repo)
- **Branch strategy**: `main` = production; feature branches get Vercel preview URLs automatically
- **`scripts/onboard-client.ts`** — automated client onboarding script
  - Creates auth user, profile, workspaces, credit package, project access, triggers task sync
  - Usage: `npx tsx scripts/onboard-client.ts --config client.json`

### First Production Client: MBM
- User: Nadin Bonin (nadin.bonin@mbm-moebel.de)
- Profile ID: f304b042-d408-4d39-874c-d53b7aa7adaf
- ClickUp list: 901519301126 — Support task: 86c81kdgk
- Credit package: Small (10 credits/month)
- Active modules: tickets, support (projects not yet configured)
- 15 legacy tasks migrated from Lovable portal; `created_by_name = 'Nadin'` applied

### UI Fixes & Polish
- **Filter row** — filter chips and filter button merged into a single row (were on separate lines)
- **Sidebar** — tickets and support are now flat direct links (no submenus)
- **TaskCard** — `created_by_name` from DB shown instead of hardcoded "Team"
- **Message bubbles** — padding 8×12→10×16, tail corner 4px→3px, gap between messages 10→14px; applied consistently to TaskComments, SupportChat, MessagesPage
- **Credit balance** — strips hour suffix from package name ("Small 10h" → "Small")
- **`scrollbar-hide` utility** added to `index.css` for Tailwind v4
- **Login page** — placeholder "K" square replaced with official KAMANIN colour icon SVG
- **Favicon** — replaced `vite.svg` with KAMANIN colour icon (cropped)
- **Page title** — "kamanin-portal" → "KAMANIN Portal"
- **Magic link** — hidden on login page until GoTrue SMTP is configured

---

## Phase 4: Project Memory & Integration Hardening — 2026-03-20+

### Project Memory Foundation
- Created `manage-project-memory` Edge Function for project memory CRUD operations
- Added project memory batch 1 foundation (client memory visibility and persistence)
- Hardened client memory visibility rules and internal memory authoring path
- Restored internal memory authoring path after browser verification flow changes

### ClickUp Integration Hardening
- Unified and hardened ClickUp public thread routing across Edge Functions
- Unified project webhook phase resolution
- Hardened shared ClickUp contract between Edge Functions
- Added ClickUp integration documentation for Phase 4

### Project Panel
- Shipped project panel batch 1 foundation (`feat(projects): ship project panel batch 1 foundation`)

### Developer Tooling & Documentation
- Added Playwright MCP browser testing setup
- Added Context Hub references for core frontend stack (React, Tailwind, Vite, Vitest)
- Added local Supabase reference documentation (`docs/reference/supabase-context-hub/`)
- Agent team migrated to Claude Code native (`.claude/agents/`)
- Planning docs moved into repository (`docs/planning/`)
- Documentation audit and consolidation in progress
