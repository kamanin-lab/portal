# Weekly Client Summary — wöchentliche Zusammenfassung

> Status: **Phase 1 MVP + Phase 1.5 SHIPPED** (2026-04-18) | Priority: medium
> First scheduled run: Monday 2026-04-20 09:00 CET.
> Phases 2 / 3 / 4 still open below.

## Problem

Clients currently learn about portal activity through:
- Per-event emails (`task_review`, `credit_approval`, `team_question`, etc.)
- A 48-hour `unread_digest` for missed comments
- Reminders for idle `client_review` tasks (5-day ticket / 3-day project cooldowns)

What's missing: a **proactive weekly roll-up** that gives the client a complete picture — what was completed, what still needs their attention, open recommendations, open questions — in one email, on a predictable cadence. Today the client has to log into the portal to see this overview. For busy clients who haven't been in the portal for a week, this means they might miss context they would have seen had they logged in.

## Vision (long-term)

Every Monday morning, the org admin receives a clean German-language email:
- What your team finished this week (with titles + dates)
- What's still waiting for your feedback (with deep links)
- What your team is working on right now
- Open recommendations from our side
- N unread messages → view in portal
- Project progress per active project

One email, complete picture, 30-second read.

---

## Phase 1 — MVP (building now, 2026-04-18)

Minimum viable surface: admin-only, English-free, four sections, skip-if-empty.

### Scope

- **Recipients:** org admins only (matches existing `send-reminders` pattern)
- **Cadence:** Monday 09:00 CET (07:00 UTC), 6-day cooldown (not 7, to survive slightly-late runs)
- **Content blocks (4):**
  1. Abgeschlossen diese Woche
  2. Warten auf Ihre Freigabe
  3. Offene Empfehlungen
  4. Ungelesene Nachrichten (count + deep link only — defer to `unread_digest` for detail)
- **Empty-state rule:** if all 4 blocks are empty, skip send. No vacuous emails.
- **Locale:** German only initially. English key exists in emailCopy.ts but `en` copy is a placeholder.
- **Preference:** new `weekly_summary: boolean` toggle in `NotificationPreferences`, default `true`, shown in the "Organisation" section of Konto-Benachrichtigungen (hidden for users without an org).

### Implementation surface

| Surface | File | Notes |
|---|---|---|
| Migration | `supabase/migrations/YYYYMMDDHHMMSS_add_weekly_summary_cooldown.sql` | Adds `profiles.last_weekly_summary_sent_at timestamptz` |
| Type | `src/shared/types/common.ts` | Add `weekly_summary` key to `NotificationPreferences` + `DEFAULT_NOTIFICATION_PREFERENCES` |
| UI toggle | `src/shared/components/konto/NotificationSection.tsx` | Add to `ORG_OPTIONS` |
| Email copy | `supabase/functions/_shared/emailCopy.ts` | New `weekly_summary` type, de + en |
| Edge Function | `supabase/functions/send-weekly-summary/index.ts` | Org-admin fan-out, atomic-claim cooldown, multi-section HTML builder |
| Cron workflow | `.github/workflows/send-weekly-summary.yml` | `0 7 * * MON` + manual `workflow_dispatch` |
| Router | (none needed — `main/index.ts` dispatches by URL path) | Directory presence is sufficient |

### Data sources (per recipient)

All queries are scoped to the admin's org (`organizations.clickup_list_ids` for tickets, `project_access` joined with `project_task_cache` for projects).

| Block | Table | Filter |
|---|---|---|
| Abgeschlossen diese Woche | `task_cache` | `list_id IN org.clickup_list_ids`, `profile_id = admin.id`, `status IN ('done', 'approved', 'complete')`, `last_activity_at ≥ NOW() - 7 days`, `is_visible = true` |
| Warten auf Ihre Freigabe | `task_cache` | same scope, `status = 'client review'`, `is_visible = true` |
| Offene Empfehlungen | `task_cache` | same scope, `status = 'to do'`, `is_visible = true`, tag name = `recommendation` |
| Ungelesene Nachrichten (count) | `comment_cache` ⟕ `read_receipts` | `profile_id = admin.id`, `is_from_portal = false`, no receipt OR `clickup_created_at > last_read_at` |

### Preference & cooldown gating

- Respect global `email_notifications` switch (skip if false)
- Respect new `notification_preferences.weekly_summary` (explicit `=== false` skip, matches existing pattern)
- Atomic claim via `.update({last_weekly_summary_sent_at: now}).or('last_weekly_summary_sent_at.is.null,last_weekly_summary_sent_at.lt.<6 days ago>').select('id')` — prevents double-send under concurrent runs

### Email structure

Subject (de): `Wochenbericht — KW {isoWeek}` (e.g., `Wochenbericht — KW 16`)

Body sections in order:
1. `Abgeschlossen diese Woche ({count})` — list of task names
2. `Warten auf Ihre Freigabe ({count})` — list with days-pending
3. `Offene Empfehlungen ({count})` — list with days-pending
4. `Ungelesene Nachrichten` — "Sie haben N ungelesene Nachrichten" + CTA

HTML: reuses `styles` + `wrapper + card` layout from `send-reminders/index.ts`. Section headings use `<h2 class="section-title">` with a bottom divider. No in-email reply UI. Primary CTA link: `https://portal.kamanin.at`.

### Estimated dev effort

1-2 days. Low risk — all patterns exist, just copy + parameterize.

---

## Phase 2 — Project progress block (future)

Add a 5th section: **Projektfortschritt**. Per active project, show:
- Phase (Konzept / Design / Entwicklung / Launch)
- Completed-this-week / remaining count
- Next blocker or milestone

Source: `project_task_cache` grouped by `project_config_id`, joined to `project_configs` for name.

Why deferred: needs a per-project roll-up display pattern that doesn't exist yet in emails. Design work needed on how much to cram per project and whether to link into each one. Non-blocking for MVP.

---

## Phase 3 — Per-member summaries + i18n (future)

### Per-member
MVP goes to admins only. Members may want their own digest of things assigned to them.

Problem: we don't model "assigned to member" explicitly — `task_cache.profile_id` is whoever the cache belongs to, not task ownership. Would require either:
- Adding an "assignee_member_id" concept (new column, populated from ClickUp assignees)
- OR: filtering client-side by what each member has viewed/commented on

Worth designing when we see client demand for it.

### English (`en`)
Currently `emailCopy.ts` has `en` stubs for every type but nothing surfaces English. When we onboard a non-German-speaking client, we'll need per-profile locale detection (probably `profiles.locale text`) and pass it through to all `getEmailCopy()` calls. Out of scope for MVP.

---

## Phase 4 — Configurable cadence (future)

Let clients choose: weekly (default), bi-weekly, monthly, or off. Requires:
- New `profiles.weekly_summary_cadence enum` or similar
- Preference UI that looks like a radio group, not a toggle
- EF logic to check cadence before claim

Non-urgent. Most clients will be fine with weekly.

---

## Overlap with existing `unread_digest` (48h cadence)

Risk: client gets pinged about the same unread comment twice — first via `unread_digest`, then again in the Monday summary.

MVP resolution: weekly summary shows only the **count** of unread messages + a single deep link, NOT the per-message list. The 48h digest stays the primary vehicle for the full unread content. The weekly summary's unread block answers "am I missing something" at a glance, not "what exactly".

Alternative (not adopted): suppress `unread_digest` for the 24h before a scheduled weekly summary. More complex — need to track the next scheduled send. Defer until we see real duplication complaints.

---

## Alternatives considered and rejected

- **Weekly digest replaces `unread_digest`**: rejected. 48h unread digest exists specifically to drive same-week response. Weekly summary is a different rhythm (orientation, not urgency).
- **Per-profile cooldown instead of org-level**: chose per-profile admin cooldown because each admin gets their own email. Extending to org-level would require a new column on `organizations` — unnecessary complexity for MVP.
- **Render via `send-mailjet-email/generateEmailHtml()` instead of inline HTML in the EF**: `send-reminders` builds HTML inline via its own `buildReminderHtml`. Following that pattern keeps the routing simple and lets the weekly summary evolve section structure independently.

## Success metrics (track post-launch)

- Open rate of weekly summary email (Mailjet dashboard)
- Click-through to portal (Mailjet link tracking + web analytics)
- Rate of clients turning it OFF in preferences (signal of noise/overload)
- Subjective feedback from Yuri / client-success after ~4 weeks
- Does it reduce "wo stehen wir?" questions during client calls?

## Open questions (resolve after MVP runs for 2-3 weeks)

- Is 09:00 CET Monday right or do clients prefer e.g. Sunday evening?
- Should the "Warten auf Ihre Freigabe" list also include items from previous weeks (>7 days idle) to surface staleness?
- Should members (not just admins) also receive a scoped summary?
