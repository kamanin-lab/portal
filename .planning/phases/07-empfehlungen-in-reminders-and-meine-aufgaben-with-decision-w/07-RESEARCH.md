# Phase 7: Empfehlungen in Reminders and Meine Aufgaben — Research

**Researched:** 2026-04-14
**Domain:** Recommendation workflow, email reminders, Meine Aufgaben UI, Edge Function extension
**Confidence:** HIGH — All findings verified directly against codebase source files

---

## Summary

Phase 7 adds two missing surfaces for Empfehlungen (recommendations): (1) the existing reminder email system must include pending recommendations in its digest, and (2) the `MeineAufgabenPage` must display an Empfehlungen block with inline Ja/Nein/Später (accept/decline/defer) actions.

The recommendation data model is already complete. Recommendations are `task_cache` rows with a `tags` array containing `{ name: "recommendation" }` and `status = "to do"`. The accept/decline actions are fully implemented in `update-task-status`. The `RecommendationApproval` component with Ja/Nein UI already exists. What is missing is: (1) `send-reminders` does not query or include recommendation tasks; (2) `MeineAufgabenPage` only shows `needs_attention` + `awaiting_approval` tasks — it has no recommendations block; (3) "Später" (defer) is not implemented anywhere — it will need a new UI interaction and a decision about backend behavior (snooze column vs. tag).

**Primary recommendation:** Extend `send-reminders` with a new `sendRecommendationReminders` function (5-day cooldown, separate from `last_reminder_sent_at`), add a `RecommendationsBlock` + inline action to `MeineAufgabenPage`, and implement Später as a client-side snooze (no backend: hide recommendation from current session, or store a `snoozed_until` date in `profiles.notification_preferences`).

---

## Project Constraints (from CLAUDE.md)

- **UI text:** All German, zero English in user-facing strings [VERIFIED: CLAUDE.md rule 6]
- **Components < 150 lines:** Extract logic to hooks [VERIFIED: CLAUDE.md rule 7]
- **`mapStatus()` for all status comparisons** — `task_cache.status` is raw ClickUp string [VERIFIED: CLAUDE.md rule 8]
- **Icons:** `@hugeicons/react` primary + `@phosphor-icons/react` secondary. No new Lucide. [VERIFIED: CLAUDE.md]
- **Toasts:** `import { toast } from "sonner"` [VERIFIED: CLAUDE.md]
- **Animation:** `import { motion } from "motion/react"` [VERIFIED: CLAUDE.md]
- **UI primitives:** shadcn/ui for Button, Input, etc. [VERIFIED: CLAUDE.md rule 12]
- **`ContentContainer width="narrow"` on all app pages** [VERIFIED: CLAUDE.md rule 11]
- **TDD default:** Write ONE failing test → implement minimal code → repeat [VERIFIED: CLAUDE.md]
- **Edge Functions:** Must proxy all ClickUp calls; service role key only; no Anthropic API key needed for this phase [VERIFIED: CLAUDE.md]
- **Stack:** React 19 + TypeScript, Vite, Tailwind CSS v4, shadcn/ui, React Router v7, Supabase Edge Functions (Deno) [VERIFIED: CLAUDE.md]

---

## Current State: How Recommendations Work Today

### Data Model [VERIFIED: src/modules/tickets/hooks/useRecommendations.ts]

```typescript
export function useRecommendations(tasks: ClickUpTask[]) {
  const recommendations = tasks.filter(t =>
    t.tags?.some(tag => tag.name.toLowerCase() === 'recommendation') &&
    t.status.toLowerCase() === 'to do'
  );
  return { recommendations, count: recommendations.length };
}
```

- Recommendations are identified by: `tag.name === "recommendation"` AND `status === "to do"`
- Stored in `task_cache` — same table as regular tickets
- `tags` field: `Array<{ name: string; color: string; background: string }>` — stored as JSONB in `raw_data` (top-level column mirroring from webhook)
- **No separate table.** No `is_recommendation` boolean column. Tag presence is the sole discriminator. [VERIFIED: DATABASE_SCHEMA.md, src/modules/tickets/types/tasks.ts]

### Accept/Decline Flow [VERIFIED: supabase/functions/update-task-status/index.ts]

`update-task-status` Edge Function handles two actions:

**`accept_recommendation`:**
1. Changes ClickUp task status to the next `in progress` equivalent
2. Sets `due_date` on the task (Unix ms timestamp required)
3. Removes `recommendation` tag via `DELETE /api/v2/task/{id}/tag/recommendation`
4. Adds `ticket` tag via `POST /api/v2/task/{id}/tag/ticket`
5. Posts auto-comment: `"Empfehlung angenommen. Erledigen bis: DD.MM.YYYY"`
6. Upserts comment to `comment_cache`
7. Deducts credits from `credit_transactions` (mirrors `approve_credits`)
8. Updates `task_cache.status` and `task_cache.due_date` immediately (belt-and-suspenders before webhook)

**`decline_recommendation`:**
1. Changes ClickUp task status (using `resolveStatusForAction`)
2. Removes `recommendation` tag
3. Posts auto-comment: `"Empfehlung abgelehnt."` (+ optional reason)
4. Upserts comment to `comment_cache`
5. Clears `recommendation` tag from `task_cache.tags` immediately

### UI Components [VERIFIED: src/modules/tickets/components/]

- `RecommendationCard.tsx` — card UI (h=152px, status left border, title + description + meta row)
- `RecommendationApproval.tsx` — accept/decline inline panel (3-state: buttons → accepting → declining). Has date picker for accept. Has optional comment for decline. Uses `useTaskActions` hook.
- `RecommendationsBlock.tsx` — section header + grid of `RecommendationCard`s. Already used in `TicketsPage` on `filter === 'attention'` tab only.

### Where Recommendations Currently Appear [VERIFIED: src/modules/tickets/pages/TicketsPage.tsx, src/shared/pages/MeineAufgabenPage.tsx]

| Surface | Shows recommendations? |
|---------|----------------------|
| TicketsPage — "Ihre Rückmeldung" tab | YES — `RecommendationsBlock` rendered when `filter === 'attention'` |
| TaskDetailSheet | YES — `RecommendationApproval` shown in detail sheet when task has recommendation tag |
| MeineAufgabenPage | NO — filters only `needs_attention` + `awaiting_approval`, no recommendations |
| Inbox/Notifications | YES — `new_recommendation` notification type wired end-to-end |
| Reminder emails | NO — `send-reminders` does not query recommendation tasks at all |

### Email Infrastructure [VERIFIED: supabase/functions/send-reminders/index.ts, supabase/functions/_shared/emailCopy.ts]

`send-reminders` Edge Function runs three jobs in sequence:
1. **Ticket reminders** (`pending_reminder`) — tasks in `"client review"` or `"awaiting approval"`, 5-day cooldown on `profiles.last_reminder_sent_at`
2. **Project reminders** (`project_reminder`) — `project_task_cache` rows in `"client review"`, 3-day cooldown on `profiles.last_project_reminder_sent_at`
3. **Unread digest** (`unread_digest`) — unread team comments, 24h cooldown on `profiles.last_unread_digest_sent_at`

Each job uses `sendMailjet()` helper. Email HTML is built with `buildReminderHtml()` which accepts a `ReminderTaskItem[]` array, greeting name, locale, email type, and CTA URL. The `emailCopy.ts` already has a `new_recommendation` email type registered — but it is used for the initial notification email, NOT a reminder.

**Cooldown tracking columns on `profiles`:**

| Column | Cooldown | Used for |
|--------|----------|---------|
| `last_reminder_sent_at` | 5 days | Ticket reminder |
| `last_project_reminder_sent_at` | 3 days | Project reminder |
| `last_unread_digest_sent_at` | 24 hours | Unread digest |
| (missing) | TBD | Recommendation reminder |

**No `last_recommendation_reminder_sent_at` column exists yet.** [VERIFIED: DATABASE_SCHEMA.md]

---

## Gap Analysis: What Is Missing for Phase 7

### Gap 1: Reminder email does not include pending recommendations [VERIFIED: send-reminders/index.ts]

The `send-reminders` function queries `task_cache` for `status IN ('client review', 'awaiting approval')` only. It does not query for `recommendation` tag. Pending recommendations (tag=recommendation, status=to do) are never included in any reminder email.

**What needs to happen:**
- Query `task_cache` for tasks with `recommendation` tag in status `"to do"` that are older than N days
- The `tags` field is JSONB — requires a query like `.contains('tags', [{ name: 'recommendation' }])` or raw SQL check. In Supabase JS client: `supabase.from('task_cache').select(...).contains('tags', JSON.stringify([{ name: 'recommendation' }]))` — needs verification of exact filter syntax for JSONB array-contains. [ASSUMED — needs test against actual schema]
- Add `last_recommendation_reminder_sent_at` column to `profiles` (DB migration needed)
- Add new `recommendation_reminder` email copy to `emailCopy.ts`
- Add `sendRecommendationReminders()` function in `send-reminders/index.ts`
- Send frequency: 5-day cooldown (same as ticket reminder — aligns with existing pattern)
- CTA URL: `/meine-aufgaben` (the new recommendations surface)

### Gap 2: MeineAufgabenPage has no Empfehlungen block [VERIFIED: src/shared/pages/MeineAufgabenPage.tsx]

`MeineAufgabenPage` currently:
- Imports `useClickUpTasks` (already fetches all tasks including recommendations)
- Filters to `needs_attention | awaiting_approval` tasks only
- Does NOT import `useRecommendations` or `RecommendationsBlock`
- Shows no accept/decline actions — just `TaskCard` list items

**What needs to happen:**
- Import `useRecommendations` + `RecommendationsBlock` + `RecommendationApproval` components
- Add `openTask` handler to open `TaskDetailSheet` (which already has `RecommendationApproval`)
- Place recommendations block below the main task list (or as a separate section above/below)
- The `RecommendationsBlock` + `RecommendationCard` components already exist and work correctly — this is a pure composition task

### Gap 3: "Später" (defer) action does not exist [VERIFIED: all recommendation components + useTaskActions.ts]

Neither the frontend nor backend has any defer/snooze mechanism. The `TaskAction` type has no `defer_recommendation`. No snooze column exists on `task_cache` or `profiles`.

**Design decision needed:** What does "Später" mean?
- **Option A — Pure client-side hide:** Store `snoozed_recommendation_ids` in `localStorage` or React state. Recommendation disappears from current session. Reappears on next page load. No backend change.
- **Option B — Notification preference snooze:** Store `snoozed_recommendations: { [taskId]: ISO_date }` in `profiles.notification_preferences` JSONB. Backend checks this before sending reminders. Frontend filters by it. Requires Edge Function update + DB write.
- **Option C — Backend column:** Add `snoozed_until` column to `task_cache`. Requires migration.

**Recommendation:** Option B provides persistence without a new DB column. `notification_preferences` is already a JSONB field with flexible structure. This approach: (1) persists snooze across devices/sessions, (2) allows `send-reminders` to check snooze before sending, (3) requires no new DB migration column, only an update to an existing JSONB field.

Implementation: new `defer_recommendation` action in `useTaskActions` → calls a new `defer-recommendation` Edge Function or reuses `update-task-status` with a new action → writes `{ snoozed_recommendations: { [taskId]: snoozed_until_ISO_string } }` patch to `profiles.notification_preferences`.

**Simpler alternative (Phase 7 scope):** If "Später" is scoped to "hide for this session only", implement as pure frontend state in `MeineAufgabenPage` using `useState<Set<string>>` — no backend, no migration, ships in Phase 7. Reminder emails can always skip snoozed tasks by checking the preferences JSONB if we later add that. For now, a session-only hide may be sufficient for the stated goal ("need a clear decision workflow").

---

## Technical Approach: What Needs to Be Built

### Part 1: Reminder Email Extension (Backend)

**Files to modify:**
- `supabase/migrations/YYYYMMDD_recommendation_reminder_column.sql` — new migration
- `supabase/functions/send-reminders/index.ts` — add `sendRecommendationReminders()` function
- `supabase/functions/_shared/emailCopy.ts` — add `recommendation_reminder` email type
- `docs/system-context/DATABASE_SCHEMA.md` — document new column

**New DB column:**
```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_recommendation_reminder_sent_at timestamptz;
```

**New email type in `emailCopy.ts`:**
```typescript
recommendation_reminder: {
  de: {
    subject: (count: number) => `Erinnerung: ${count} offene Empfehlung${count === 1 ? '' : 'en'} warte${count === 1 ? 't' : 'n'} auf Ihre Entscheidung`,
    title: "Offene Empfehlungen",
    greeting: greetDe,
    body: "Die folgenden Empfehlungen unseres Teams warten auf Ihre Entscheidung:",
    cta: "Im Portal ansehen",
    notes: [
      "Sie erhalten diese Erinnerung alle 5 Tage, solange offene Empfehlungen bestehen.",
      "Sie können Erinnerungen in Ihren Kontoeinstellungen deaktivieren.",
    ],
  },
  ...
}
```

**JSONB tag filter syntax (needs test):**
The `task_cache.tags` column is JSONB storing `[{ "name": "recommendation", "color": "...", "background": "..." }]`. The Supabase PostgREST filter for JSONB array contains is:
```typescript
.contains('tags', [{ name: 'recommendation' }])
// PostgREST: ?contains=tags::[{"name":"recommendation"}]
```
Or using raw filter: `.filter('tags', 'cs', '[{"name":"recommendation"}]')`. [ASSUMED — verify with actual query against DB before committing to this approach]

Alternative: use `.not('tags', 'eq', '[]').filter(...)` — but this is less reliable. Safest path is: fetch all visible tasks for the profile and filter in JS (same as `useRecommendations` hook does).

**`sendRecommendationReminders` function structure:**
```typescript
async function sendRecommendationReminders(supabase, log): Promise<{ sent, skipped, errors }> {
  // 1. Fetch profiles with email enabled
  // 2. Bulk fetch task_cache rows with recommendation tag (status = 'to do', is_visible = true)
  //    Use .filter('tags', 'cs', '[{"name":"recommendation"}]') or JS-side filter
  // 3. For each profile: check 5-day cooldown (last_recommendation_reminder_sent_at)
  //    Check reminders preference (prefs?.reminders !== false)
  //    Check how old each recommendation is (last_activity_at)
  // 4. Build ReminderTaskItem[] for tasks older than N days
  // 5. Send using buildReminderHtml(tasks, firstName, "de", "recommendation_reminder", `${portalUrl}/meine-aufgaben`)
  // 6. Update last_recommendation_reminder_sent_at atomically (same pattern as project reminder)
}
```

**Cooldown for recommendation reminder:** 5 days, matching ticket reminder. Minimum age before first reminder: consider 3 days old (recommendation created but not acted on after 3 days → first reminder on next cron run).

### Part 2: MeineAufgabenPage Empfehlungen Block (Frontend)

**File to modify:**
- `src/shared/pages/MeineAufgabenPage.tsx`

**Changes needed (< 150 line budget):**
1. Import `useRecommendations` from `@/modules/tickets/hooks/useRecommendations`
2. Import `RecommendationsBlock` from `@/modules/tickets/components/RecommendationsBlock`
3. Add `const { recommendations } = useRecommendations(tasks)` (tasks already fetched)
4. Render `<RecommendationsBlock recommendations={recommendations} onTaskClick={openTask} />` after or before the grouped task list

The `openTask` function already exists and opens `TaskDetailSheet`. `TaskDetailSheet` already renders `RecommendationApproval` when the task has the recommendation tag. So the full Ja/Nein workflow works immediately once the cards are clickable.

**MeineAufgabenPage current line count:** 123 lines. After adding recommendations block: estimate +5–8 lines (imports + one hook call + one component render). Stays well under 150. [VERIFIED: src/shared/pages/MeineAufgabenPage.tsx]

**Empty state logic update:** The empty state message "Keine offenen Aufgaben — alles erledigt!" should only show when BOTH `attentionTasks.length === 0` AND `recommendations.length === 0`. Currently it only checks `attentionTasks`.

**Page description text update:** Currently `"Aufgaben, die Ihre Rückmeldung erfordern"`. Should become something like `"Aufgaben und Empfehlungen, die Ihre Entscheidung erfordern"` when recommendations exist. Or keep as-is and let the section header communicate the distinction.

### Part 3: "Später" (Defer) Action

**Scope decision required before planning:** Session-only vs. persisted.

**If session-only (simpler, ships faster):**
- Add `useState<Set<string>>(new Set())` to `MeineAufgabenPage` for `snoozedIds`
- Filter out snoozed ids from `recommendations` before rendering
- Pass `onSnooze` callback to `RecommendationsBlock` → `RecommendationCard`
- Add "Später" button to `RecommendationCard` (or inside `RecommendationApproval`)
- No backend change, no migration

**If persisted (Option B — recommended for production):**
- New `TaskAction`: `defer_recommendation`
- `update-task-status` adds handling: patches `profiles.notification_preferences` with `{ snoozed_recommendations: { [taskId]: snoozed_until } }` (7-day or 14-day snooze window)
- `useRecommendations` hook filters out snoozed tasks using auth user's `notification_preferences` (needs new query or extend `useAuth`)
- `send-reminders` skips tasks in the snooze map
- Frontend: add "Später" button to `RecommendationApproval` component

**Recommendation for Phase 7:** Start with session-only ("Später" = hide until page reload). The stated goal is "a clear decision workflow" — Ja/Nein are the primary decisions. Später is a UX convenience, not a core requirement. Persisted snooze can be Phase 7.1 or deferred. This keeps the phase focused and avoids an additional DB write path.

---

## Files to Modify

### Backend (Edge Functions)

| File | Change |
|------|--------|
| `supabase/migrations/YYYYMMDD_recommendation_reminder_column.sql` | NEW — add `last_recommendation_reminder_sent_at` column to profiles |
| `supabase/functions/send-reminders/index.ts` | ADD `sendRecommendationReminders()` function + call at end of handler |
| `supabase/functions/_shared/emailCopy.ts` | ADD `recommendation_reminder` email type to `EmailType` union and `EMAIL_COPY` dict |

### Frontend

| File | Change |
|------|--------|
| `src/shared/pages/MeineAufgabenPage.tsx` | ADD `useRecommendations` hook, `RecommendationsBlock`, update empty state logic |
| `src/modules/tickets/lib/dictionary.ts` | ADD strings for `Später` button label and updated page subtitle if needed |
| `docs/system-context/DATABASE_SCHEMA.md` | ADD `last_recommendation_reminder_sent_at` column doc |

### New Files (if Später is session-only)

None required — pure composition changes.

### New Files (if Später is persisted — out of scope for Phase 7)

- `supabase/functions/update-task-status/index.ts` — add `defer_recommendation` action
- Possibly `src/modules/tickets/hooks/useSnoozedRecommendations.ts`

---

## Architecture Patterns

### Adding a new reminder type to `send-reminders`

Pattern from existing code: all three jobs follow the same structure:
1. Query eligible profiles (email enabled)
2. Query relevant data (tasks/comments)
3. Per-profile: check prefs + cooldown
4. Atomic claim update (`.or('col.is.null,col.lt.${cooldown_boundary}')` before sending)
5. Call `sendMailjet()`
6. Log job stats

The atomic claim pattern is critical — prevents double-send on concurrent cron executions. [VERIFIED: project reminder handler in send-reminders/index.ts lines 626–666]

### JSONB tag query in Supabase

The `tags` column in `task_cache` is JSONB. Two approaches:

**Approach A — PostgREST filter (preferred for server-side filtering):**
```typescript
const { data } = await supabase
  .from('task_cache')
  .select('clickup_id, name, profile_id, last_activity_at')
  .eq('status', 'to do')
  .eq('is_visible', true)
  .contains('tags', [{ name: 'recommendation' }])
```
PostgREST `contains` maps to the `@>` operator for JSONB. [ASSUMED — verify behavior with actual data before coding]

**Approach B — Fetch all to-do tasks and filter in JS:**
```typescript
const { data } = await supabase
  .from('task_cache')
  .select('...')
  .eq('status', 'to do')
  .eq('is_visible', true)

const recommendations = data.filter(t =>
  Array.isArray(t.tags) && t.tags.some(tag => tag.name === 'recommendation')
)
```
This is safer but costs more bandwidth. Acceptable for a cron job context.

**Recommendation:** Use Approach B in the Edge Function to mirror exactly what the frontend `useRecommendations` hook does — avoids divergence in recommendation detection logic.

### RecommendationsBlock placement in MeineAufgabenPage

Options:
- **After grouped task list** — natural flow: first handle critical attention tasks, then recommendations
- **Before grouped task list** — recommendations are higher priority (proactive suggestions)
- **As separate section with divider** — the `RecommendationsBlock` component already renders its own divider + section header internally

**Recommendation:** After the grouped task list, matching the placement in `TicketsPage`. The `RecommendationsBlock` component already handles its own empty-state (returns null when empty). No conditional needed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email sending | Custom SMTP | `sendMailjet()` in `send-reminders/index.ts` | Already wired, credentials, error handling |
| Email HTML template | New template | `buildReminderHtml()` reusable function | Already exists, handles all copy via `emailCopy.ts` |
| Accept/decline UI | New form | `RecommendationApproval` component | Fully implemented, tested, used in TaskDetailSheet |
| Recommendation detection | Custom query | `useRecommendations(tasks)` hook | Already used in TicketsPage |
| Task click → sheet | Custom sheet | `TaskDetailSheet` with `?taskId=` | Already handles RecommendationApproval internally |
| Cooldown tracking | Custom table | `profiles` column + atomic `.or()` update | Established pattern for all 3 existing reminder types |

---

## Common Pitfalls

### Pitfall 1: JSONB array-contains filter syntax
**What goes wrong:** Using `.eq('tags', ...)` or `.filter('tags', 'like', ...)` for JSONB arrays — returns wrong results or errors.
**Why it happens:** JSONB array `@>` semantics require exact JSON structure match on the contained element.
**How to avoid:** Use JS-side filter (Approach B) to match existing `useRecommendations` logic exactly. No risk of filter divergence.
**Warning signs:** Zero recommendations returned even when tasks have the tag in the DB.

### Pitfall 2: Email type union not updated in `emailCopy.ts`
**What goes wrong:** Adding copy to `EMAIL_COPY` dict but not adding `"recommendation_reminder"` to the `EmailType` union — TypeScript compile error in Edge Function Deno.
**Why it happens:** The `EmailType` is a string union defined separately from the dict.
**How to avoid:** Add to BOTH `EmailType` union AND `EMAIL_COPY` dict in `emailCopy.ts`.

### Pitfall 3: Using `last_reminder_sent_at` for recommendation cooldown
**What goes wrong:** Reusing the ticket reminder cooldown column for recommendations — sending a ticket reminder would suppress recommendation reminder (and vice versa).
**Why it happens:** Temptation to avoid a new migration.
**How to avoid:** Add a separate `last_recommendation_reminder_sent_at` column. Each reminder type has its own cooldown clock.

### Pitfall 4: MeineAufgabenPage empty state fires too early
**What goes wrong:** Empty state "Keine offenen Aufgaben" shows even when there are pending recommendations (because `attentionTasks.length === 0` but `recommendations.length > 0`).
**How to avoid:** Update the empty state condition: `attentionTasks.length === 0 && recommendations.length === 0`.

### Pitfall 5: `RecommendationsBlock` not receiving `onTaskClick`
**What goes wrong:** Recommendations render but clicking a card does nothing because `openTask` wasn't passed.
**Why it happens:** `openTask` sets `?taskId=` search param — this is how `TaskDetailSheet` opens.
**How to avoid:** Pass `onTaskClick={openTask}` to `RecommendationsBlock`. The `openTask` function already exists in `MeineAufgabenPage`.

### Pitfall 6: Recommendation age threshold for reminder
**What goes wrong:** Sending reminder the same day a recommendation was created — spammy.
**How to avoid:** Check `last_activity_at` — only include tasks where `last_activity_at < NOW() - 3 days` (same as project reminder threshold). The 5-day cooldown is on the email frequency, not the task age.

---

## Code Examples

### Pattern: Adding a new reminder job to send-reminders

Based on existing `sendUnreadMessageReminders` and project reminder patterns [VERIFIED: send-reminders/index.ts]:

```typescript
// Source: send-reminders/index.ts — project reminder pattern (lines 540–670)
async function sendRecommendationReminders(
  supabase: ReturnType<typeof createClient>,
  log: ReturnType<typeof createLogger>
): Promise<{ sent: number; skipped: number; errors: number }> {
  let sent = 0, skipped = 0, errors = 0;

  // 1. Fetch all profiles with email enabled
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, email_notifications, notification_preferences, last_recommendation_reminder_sent_at")
    .eq("email_notifications", true);

  if (!profiles?.length) return { sent, skipped, errors };

  // 2. Fetch recommendation tasks (to do, visible, older than 3 days)
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recTasks } = await supabase
    .from("task_cache")
    .select("clickup_id, name, profile_id, last_activity_at")
    .eq("status", "to do")
    .eq("is_visible", true)
    .lt("last_activity_at", threeDaysAgo)
    .in("profile_id", profiles.map(p => p.id));

  // 3. JS-side filter for recommendation tag (mirrors useRecommendations hook)
  const recommendations = (recTasks ?? []).filter(t =>
    Array.isArray(t.tags) && t.tags.some((tag: { name: string }) => tag.name === "recommendation")
  );

  // NOTE: task_cache select above does NOT include tags column — need to add it:
  // .select("clickup_id, name, profile_id, last_activity_at, tags")

  // 4. Build per-profile map
  // ... (same pattern as projectProfileMap in project reminders)

  // 5. Per-profile: check prefs + cooldown (5 days), atomic claim, send
}
```

### Pattern: Using `buildReminderHtml` with a new email type

```typescript
// Source: send-reminders/index.ts — buildReminderHtml is already generic
const { subject, html } = buildReminderHtml(
  profile.tasks,        // ReminderTaskItem[]
  firstName,            // string | null
  "de",                 // EmailLocale
  "recommendation_reminder",  // EmailType — must exist in emailCopy.ts
  `${portalUrl}/meine-aufgaben`  // CTA URL
);
```

`buildReminderHtml` signature: `(tasks, firstName, locale, emailType, ctaUrl)` — already accepts any `EmailType`. [VERIFIED: send-reminders/index.ts lines 63–110]

### Pattern: MeineAufgabenPage recommendations addition

```typescript
// Source: src/shared/pages/MeineAufgabenPage.tsx — add these

// Additional import
import { useRecommendations } from '@/modules/tickets/hooks/useRecommendations'
import { RecommendationsBlock } from '@/modules/tickets/components/RecommendationsBlock'

// Inside component (after line 43 — existing useUnreadCounts call):
const { recommendations } = useRecommendations(tasks)

// Updated empty state condition (line 87):
{!isLoading && attentionTasks.length === 0 && recommendations.length === 0 && (
  // ... existing EmptyState
)}

// After grouped task list (before TaskDetailSheet):
<RecommendationsBlock
  recommendations={recommendations}
  onTaskClick={openTask}
/>
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| No recommendation reminder emails | Add sendRecommendationReminders() to send-reminders | Clients get nudged about pending recommendations |
| Recommendations only visible on TicketsPage attention tab | Add RecommendationsBlock to MeineAufgabenPage | Centralized "Meine Aufgaben" becomes the decision hub |
| No defer action | Später = session-only hide (Phase 7) | Low scope, ships fast |

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely code/config changes. All required infrastructure (Supabase, Edge Functions, Mailjet, ClickUp) is already operational. No new external dependencies are introduced.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.x (jsdom environment) |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test` |
| Full suite command | `npm run test:coverage` |

[VERIFIED: vitest.config.ts]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REMIND-01 | `sendRecommendationReminders()` sends email when profile has pending recommendations older than 3 days | unit | `npm run test -- --grep "sendRecommendationReminders"` | No — Wave 0 |
| REMIND-02 | `sendRecommendationReminders()` skips profiles on 5-day cooldown | unit | same | No — Wave 0 |
| REMIND-03 | `sendRecommendationReminders()` skips profiles with `reminders: false` preference | unit | same | No — Wave 0 |
| UI-01 | `MeineAufgabenPage` renders `RecommendationsBlock` when recommendations exist | component | `npm run test -- --grep "MeineAufgabenPage"` | No — Wave 0 |
| UI-02 | Empty state shown only when both `attentionTasks` and `recommendations` are empty | component | same | No — Wave 0 |
| UI-03 | `RecommendationsBlock` passes `onTaskClick` correctly | component | same | No — Wave 0 |
| EMAIL-01 | `recommendation_reminder` copy returns correct German subject with count | unit | `npm run test -- --grep "emailCopy"` or extend existing tests | Partial — extend existing |

**Note:** Edge Function logic (send-reminders) is Deno runtime — not testable with Vitest. REMIND-01/02/03 would be integration tests or manual-only. For Vitest coverage, the testable surface is: the `emailCopy.ts` new entry (unit), the `MeineAufgabenPage` component (component test), and the `useRecommendations` hook behavior (already tested via existing hook infrastructure if applicable).

### Sampling Rate

- **Per task commit:** `npm run test`
- **Per wave merge:** `npm run test:coverage`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/shared/pages/__tests__/MeineAufgabenPage.test.tsx` — covers UI-01, UI-02, UI-03
- [ ] Extend or add email copy test for `recommendation_reminder` type — covers EMAIL-01

*(Edge Function tests are Deno/manual scope — not Vitest)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Not a new auth surface |
| V3 Session Management | No | No session changes |
| V4 Access Control | Yes — reminder emails | `profiles.email_notifications` + `notification_preferences.reminders` check before sending. RLS on `task_cache` means only the owning profile's tasks are returned. [VERIFIED: DATABASE_SCHEMA.md] |
| V5 Input Validation | No | No new user input surfaces in Phase 7 (session-only Später) |
| V6 Cryptography | No | No new crypto |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CRON_SECRET bypass on send-reminders | Spoofing | Already enforced: `authHeader !== Bearer ${cronSecret}` check at handler entry [VERIFIED: send-reminders/index.ts line 384] |
| Profile data leakage in reminder email | Information Disclosure | Service role query scoped to `profile_id`; email sent only to the profile's own email address |
| Cooldown race condition (double send) | Tampering | Atomic claim pattern: `.or('last_recommendation_reminder_sent_at.is.null,...').update(...)` — returns 0 rows if another execution already claimed [VERIFIED: project reminder pattern lines 630–637] |

---

## Open Questions

1. **"Später" scope: session-only or persisted?**
   - What we know: Session-only is simpler, persisted is more user-friendly and integrates with reminder suppression
   - What's unclear: User expectation for "Später" — does 7 days sound right? Should it affect email reminders?
   - Recommendation: Ship session-only in Phase 7. Persisted snooze can be Phase 7.1 if needed.

2. **Recommendation reminder email — combined with ticket reminder or separate?**
   - What we know: Ticket reminder already sends for `client review` + `awaiting approval` tasks. Recommendations are status `to do` with a tag — they are NOT included in the current reminder.
   - What's unclear: Should recommendations appear in the same email as pending tickets (if both exist) or always in a separate email?
   - Recommendation: Separate email with separate cooldown (`last_recommendation_reminder_sent_at`). Cleaner messaging, avoids mixing two different action types in one email digest.

3. **Minimum recommendation age before first reminder**
   - What we know: Project reminder waits 3 days (`last_activity_at < NOW() - 3 days`). Ticket reminder has no minimum age filter.
   - What's unclear: For recommendations, a brand-new recommendation should not trigger a reminder immediately.
   - Recommendation: 3-day minimum age (same as project reminder threshold).

4. **JSONB `.contains()` filter behavior with partial object match**
   - What we know: `tags` stores `[{ name, color, background }]` objects. We only want to match on `name: "recommendation"`.
   - What's unclear: Whether Supabase PostgREST `.contains([{ name: 'recommendation' }])` matches partial objects or requires exact match.
   - Recommendation: Use JS-side filter (Approach B) to guarantee correctness. [ASSUMED — test before deploying Approach A]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | PostgREST `.contains('tags', [{ name: 'recommendation' }])` performs partial object match (only checks `name` field) | Technical Approach / Pitfall 1 | Wrong results from DB query — fall back to JS-side filter (Approach B, fully safe) |
| A2 | `buildReminderHtml` `emailType` parameter accepts any `EmailType` string without additional type guard | Code Examples | TypeScript error in Edge Function — easily fixed by adding the new type to the union |
| A3 | MeineAufgabenPage line count stays under 150 after additions | Architecture Patterns | Component must be split — unlikely given current 123-line count + ~8 line addition |

---

## Sources

### Primary (HIGH confidence)
- `supabase/functions/send-reminders/index.ts` — Full source read, all three job patterns verified
- `supabase/functions/update-task-status/index.ts` — Full source read, accept/decline recommendation actions verified
- `supabase/functions/_shared/emailCopy.ts` — Full source read, all email types verified
- `src/modules/tickets/hooks/useRecommendations.ts` — Recommendation detection logic verified
- `src/modules/tickets/components/RecommendationApproval.tsx` — Accept/decline UI component verified
- `src/modules/tickets/components/RecommendationsBlock.tsx` — Block component verified
- `src/shared/pages/MeineAufgabenPage.tsx` — Current state verified (no recommendations block)
- `src/modules/tickets/pages/TicketsPage.tsx` — Current placement of RecommendationsBlock verified
- `docs/system-context/DATABASE_SCHEMA.md` — profiles table columns verified, task_cache tags column verified
- `src/modules/tickets/types/tasks.ts` — ClickUpTask type, TaskAction union verified
- `src/modules/tickets/lib/dictionary.ts` — German strings verified

### Secondary (MEDIUM confidence)
- `src/app/routes.tsx` — `/meine-aufgaben` route confirmed
- `vitest.config.ts` — Test framework and coverage config confirmed

### Tertiary (LOW confidence — requires validation)
- PostgREST JSONB `.contains()` partial object match behavior [A1]

---

## Metadata

**Confidence breakdown:**
- Current state analysis: HIGH — all source files read directly
- Standard stack: HIGH — no new dependencies introduced
- Architecture patterns: HIGH — following established patterns from 3 existing reminder jobs
- Pitfalls: HIGH — derived from code reading, not speculation
- JSONB filter behavior: LOW — assumed, needs runtime test

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (stable codebase, no external dependency changes)
