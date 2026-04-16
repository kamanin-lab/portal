# Unread Digest: 48h Cooldown + 7th Email Preference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the unread message digest cooldown from 24h to 48h, add a dedicated `unread_digest` preference key so users can toggle it independently, and surface it as a 7th item in the email notification settings UI.

**Architecture:** Three-layer change: (1) TypeScript type + default in `common.ts`, (2) Edge Function cooldown constant + preference gate in `send-reminders/index.ts`, (3) UI option row added to `TASK_OPTIONS` in `NotificationSection.tsx`. No DB migration required — `notification_preferences` is a JSONB column and new keys are backward-compatible (missing key = use default `true`).

**Tech Stack:** TypeScript (frontend), Deno/TypeScript (Edge Function), React + Tailwind (UI)

---

## Files

| Action | File | Change |
|--------|------|--------|
| Modify | `src/shared/types/common.ts` | Add `unread_digest: boolean` to interface + default |
| Modify | `supabase/functions/send-reminders/index.ts` | 48h cooldown constant + `unread_digest` pref gate |
| Modify | `src/shared/components/konto/NotificationSection.tsx` | Add 7th option to `TASK_OPTIONS` |
| Modify | `src/shared/components/konto/__tests__/NotificationSection.test.tsx` | Test for new option row (create file if missing) |

---

### Task 1: Add `unread_digest` to the TypeScript type and defaults

**Files:**
- Modify: `src/shared/types/common.ts`

- [ ] **Step 1: Add `unread_digest` to the `NotificationPreferences` interface**

Open `src/shared/types/common.ts`. The interface currently ends with `project_messages: boolean`. Add the new key after `new_recommendation` (keeping task-level prefs grouped together):

```typescript
export interface NotificationPreferences {
  task_review: boolean
  task_completed: boolean
  team_comment: boolean
  support_response: boolean
  reminders: boolean
  new_recommendation: boolean
  unread_digest: boolean       // ← ADD THIS
  project_task_ready: boolean
  project_step_completed: boolean
  project_messages: boolean
}
```

- [ ] **Step 2: Add default value for `unread_digest`**

In the same file, update `DEFAULT_NOTIFICATION_PREFERENCES`:

```typescript
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  task_review: true,
  task_completed: true,
  team_comment: true,
  support_response: true,
  reminders: true,
  new_recommendation: true,
  unread_digest: true,         // ← ADD THIS
  project_task_ready: true,
  project_step_completed: true,
  project_messages: true,
}
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
cd G:/01_OPUS/Projects/PORTAL && npm run build 2>&1 | tail -20
```

Expected: no type errors. If there are errors about `unread_digest` not matching somewhere, fix them in that file.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/common.ts
git commit -m "feat(notifications): add unread_digest preference key to NotificationPreferences"
```

---

### Task 2: Update Edge Function — 48h cooldown + unread_digest preference gate

**Files:**
- Modify: `supabase/functions/send-reminders/index.ts` (lines ~257–317 — the `sendUnreadMessageReminders` function)

- [ ] **Step 1: Change the cooldown constant from 24h to 48h**

Find the line (around line 257):
```typescript
const oneDayMs = 24 * 60 * 60 * 1000;
```

Replace with:
```typescript
const twoDaysMs = 48 * 60 * 60 * 1000;
```

- [ ] **Step 2: Update all three references to `oneDayMs` → `twoDaysMs`**

There are three uses of `oneDayMs` in `sendUnreadMessageReminders`:

1. The cooldown check (around line 274–277):
```typescript
    // 48h cooldown check
    if (profile.last_unread_digest_sent_at) {
      const lastSent = new Date(profile.last_unread_digest_sent_at as string).getTime();
      if (Date.now() - lastSent < twoDaysMs) { skipped++; continue; }
    }
```

2. The atomic update guard (around line 307–312):
```typescript
      const twoDaysAgo = new Date(Date.now() - twoDaysMs).toISOString();
      await supabase
        .from("profiles")
        .update({ last_unread_digest_sent_at: new Date().toISOString() })
        .eq("id", profile.id)
        .or(`last_unread_digest_sent_at.is.null,last_unread_digest_sent_at.lt.${twoDaysAgo}`);
```

- [ ] **Step 3: Add `unread_digest` preference gate**

In `sendUnreadMessageReminders`, there is already a preference block around lines 264–271:

```typescript
    // Preference checks
    const prefs = profile.notification_preferences as Record<string, boolean> | null;
    const remindersEnabled = prefs?.reminders !== false;
    const teamCommentEnabled = prefs?.team_comment !== false;
    const supportEnabled = prefs?.support_response !== false;

    if (!remindersEnabled || (!teamCommentEnabled && !supportEnabled)) {
      skipped++; continue;
    }
```

Add a new `unreadDigestEnabled` check and include it in the guard:

```typescript
    // Preference checks
    const prefs = profile.notification_preferences as Record<string, boolean> | null;
    const unreadDigestEnabled = prefs?.unread_digest !== false;  // ← ADD
    const remindersEnabled = prefs?.reminders !== false;
    const teamCommentEnabled = prefs?.team_comment !== false;
    const supportEnabled = prefs?.support_response !== false;

    if (!unreadDigestEnabled || !remindersEnabled || (!teamCommentEnabled && !supportEnabled)) {  // ← UPDATED
      skipped++; continue;
    }
```

- [ ] **Step 4: Update the version comment at the top of the file**

The file starts with a version block (lines 1–5). Update it to reflect the change:

```typescript
// ============ DEPLOYMENT VERSION ============
// Version: 2026-04-14-v3-unread-digest-48h
// Feature: Digest email reminders for pending approval tasks (every 5 days)
// Feature: Unread message digest — 48h cooldown, respects unread_digest pref
// =============================================
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/send-reminders/index.ts
git commit -m "feat(reminders): change unread digest cooldown to 48h, add unread_digest pref gate"
```

---

### Task 3: Add 7th option row to the notification settings UI

**Files:**
- Modify: `src/shared/components/konto/NotificationSection.tsx`

- [ ] **Step 1: Add `unread_digest` to `TASK_OPTIONS`**

In `NotificationSection.tsx`, find the `TASK_OPTIONS` array (currently 6 items, around line 52–59). Add the new entry **after** `new_recommendation` so it stays with the task-related options:

```typescript
const TASK_OPTIONS: OptionDef[] = [
  { key: 'task_review',        label: 'Aufgabe zur Prüfung bereit',   description: 'Benachrichtigung, wenn eine Aufgabe auf Ihre Rückmeldung wartet.' },
  { key: 'task_completed',     label: 'Aufgabe abgeschlossen',         description: 'Benachrichtigung, wenn eine Aufgabe als erledigt markiert wurde.' },
  { key: 'team_comment',       label: 'Neue Nachricht vom Team',       description: 'Benachrichtigung bei neuen Nachrichten oder Rückfragen zu Ihren Aufgaben.' },
  { key: 'support_response',   label: 'Support-Antwort',               description: 'Benachrichtigung bei neuen Antworten im Support-Chat.' },
  { key: 'reminders',          label: 'Erinnerungen',                  description: 'Erinnerung alle 5 Tage bei ausstehender Prüfung oder Kostenfreigabe.' },
  { key: 'new_recommendation', label: 'Neue Empfehlung',               description: 'Benachrichtigung, wenn das Team eine neue Empfehlung für Sie erstellt hat.' },
  { key: 'unread_digest',      label: 'Ungelesene Nachrichten',        description: 'Erinnerung alle 2 Tage bei ungelesenen Nachrichten vom Team.' },  // ← ADD
]
```

- [ ] **Step 2: Verify the build compiles without TypeScript errors**

```bash
cd G:/01_OPUS/Projects/PORTAL && npm run build 2>&1 | tail -20
```

Expected: clean build. The `key` type is `keyof NotificationPreferences`, so TypeScript will validate `unread_digest` is a valid key (added in Task 1).

- [ ] **Step 3: Run existing tests to check no regressions**

```bash
cd G:/01_OPUS/Projects/PORTAL && npm run test 2>&1 | tail -30
```

Expected: all tests pass. No new test required for adding a static config entry — the type system enforces correctness.

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/konto/NotificationSection.tsx
git commit -m "feat(konto): add unread_digest as 7th email notification preference in settings UI"
```

---

### Task 4: Browser smoke test

**Files:** None (verification only)

- [ ] **Step 1: Start the dev server**

```bash
cd G:/01_OPUS/Projects/PORTAL && npm run dev
```

- [ ] **Step 2: Navigate to Konto → E-Mail-Benachrichtigungen**

Open http://localhost:5173, log in, go to the Konto (account) page.

Expected: 7 toggle rows visible under "Aufgaben" tab:
1. Aufgabe zur Prüfung bereit
2. Aufgabe abgeschlossen
3. Neue Nachricht vom Team
4. Support-Antwort
5. Erinnerungen
6. Neue Empfehlung
7. **Ungelesene Nachrichten** ← new

- [ ] **Step 3: Toggle the new switch and verify it saves**

Toggle "Ungelesene Nachrichten" off, reload the page, verify it stays off. Toggle it back on.

Expected: preference persists (stored in `profiles.notification_preferences` JSONB column via `useUpdateProfile`).

---

## Scope boundaries

**In scope:**
- Cooldown change: 24h → 48h in Edge Function
- New `unread_digest` pref key: type, default, pref gate in EF, UI toggle
- No DB migration (JSONB column is schema-flexible)

**Out of scope:**
- Changing the cron schedule (the function is called daily by the cron job; the 48h cooldown inside the function prevents double-sending — no schedule change needed)
- Any other reminder type cooldowns
- UI changes outside `NotificationSection.tsx`
