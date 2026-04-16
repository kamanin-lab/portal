# Bug Fixes Batch 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 9 reported bugs/UX issues across the Portal — UI text/color micro-fixes, search scope, critical notification visibility gate, iOS mobile fixes, and session timeout.

**Architecture:** All changes are isolated and independently deployable by phase. Phase 2 (notification gate) is the most critical — it prevents clients from receiving notifications about invisible tasks. Frontend changes deploy via Vercel (push to main). Edge function changes deploy via Coolify volume mount.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Supabase Edge Functions (Deno), Motion, shadcn/ui, sonner toasts

---

## Phase 1 — Frontend Micro-fixes (UI Text & Colors)

**Files to modify:**
- `src/modules/tickets/components/TaskFilters.tsx` — mobile button label
- `supabase/functions/_shared/emailCopy.ts` — email template wording
- `src/modules/tickets/components/NewTaskButton.tsx` — mobile text
- `src/shared/styles/tokens.css` — "Ihre Rückmeldung" color tokens

---

### Task 1.1: Mobile Filter Button Label

**File:** `src/modules/tickets/components/TaskFilters.tsx`

Current at line 143: `{isMobile ? 'Filter' : 'Mehr'}`
Problem: "Filter" gives no hint that it opens status choices.

- [ ] **Step 1: Update the button label**

In `src/modules/tickets/components/TaskFilters.tsx`, change line 143:

```tsx
// Before:
{isMobile ? 'Filter' : 'Mehr'}

// After:
{isMobile ? 'Weitere Status' : 'Mehr'}
```

- [ ] **Step 2: Verify in browser**

Start dev server (`npm run dev`), open Tickets on mobile viewport (Chrome DevTools, iPhone SE 375px). Confirm button shows "Weitere Status" instead of "Filter".

- [ ] **Step 3: Commit**

```bash
git add src/modules/tickets/components/TaskFilters.tsx
git commit -m "fix(tickets): rename mobile filter button to 'Weitere Status' for clarity"
```

---

### Task 1.2: Email Template Wording Fix

**File:** `supabase/functions/_shared/emailCopy.ts`

Current lines 228–232: uses "Frage zu" / "hat eine Frage zu" — implies a question, but messages aren't always questions.

- [ ] **Step 1: Update the German email copy for `team_question`**

In `supabase/functions/_shared/emailCopy.ts`, change lines 228–233:

```ts
// Before:
team_question: {
  de: {
    subject: (taskName: string) => `Frage zu „${taskName}"`,
    title: "Ihr Tech-Team hat eine Frage",
    greeting: greetDe,
    body: (teamMemberName: string, taskName: string) =>
      `${teamMemberName} hat eine Frage zu „<strong>${taskName}</strong>":`,
    cta: "Im Portal antworten",
  },

// After:
team_question: {
  de: {
    subject: (taskName: string) => `Nachricht zu „${taskName}"`,
    title: "Ihr Tech-Team hat eine Nachricht",
    greeting: greetDe,
    body: (teamMemberName: string, taskName: string) =>
      `${teamMemberName} hat eine Nachricht zu „<strong>${taskName}</strong>":`,
    cta: "Im Portal antworten",
  },
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/emailCopy.ts
git commit -m "fix(email): change 'Frage zu' to 'Nachricht zu' in task comment email template"
```

---

### Task 1.3: Mobile "Neue Aufgabe" Button — Shorter Text

**File:** `src/modules/tickets/components/NewTaskButton.tsx`

The button currently shows "Neue Aufgabe" on all viewports. On mobile (where it's the only full-width element), it renders as two lines and looks oversized.

- [ ] **Step 1: Add `useBreakpoint` and conditional label**

Replace the entire file content:

```tsx
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon } from '@hugeicons/core-free-icons'
import { useBreakpoint } from '@/shared/hooks/useBreakpoint'

interface Props {
  onClick: () => void
}

export function NewTaskButton({ onClick }: Props) {
  const { isMobile } = useBreakpoint()

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-4 py-2 text-body font-semibold bg-cta text-white rounded-[var(--r-md)] hover:bg-cta-hover transition-colors cursor-pointer shrink-0"
    >
      <HugeiconsIcon icon={PlusSignIcon} size={15} />
      {isMobile ? 'Aufgabe' : 'Neue Aufgabe'}
    </button>
  )
}
```

- [ ] **Step 2: Verify in browser at 375px viewport**

Button should show "+ Aufgabe" on mobile and "Neue Aufgabe" on desktop.

- [ ] **Step 3: Commit**

```bash
git add src/modules/tickets/components/NewTaskButton.tsx
git commit -m "fix(tickets): shorten 'Neue Aufgabe' button to 'Aufgabe' on mobile"
```

---

### Task 1.4: "Ihre Rückmeldung" Status Color — Distinguish from CTA Orange

**File:** `src/shared/styles/tokens.css`

Current: `--awaiting: #EA580C` and `--cta: #FF8730` — both orange, visually clash on the Tickets page.

New color: amber-700 (`#B45309`) — warm, distinct from the CTA orange, clearly signals "action needed".

- [ ] **Step 1: Update token values**

In `src/shared/styles/tokens.css`, find and update:

```css
/* Before: */
--awaiting: #EA580C;
--awaiting-bg: #FFF7ED;

/* After: */
--awaiting: #B45309;
--awaiting-bg: #FEF3C7;
```

- [ ] **Step 2: Verify in browser**

On Tickets page, "Ihre Rückmeldung" badge should appear amber/yellow-brown (distinctly different from the orange "Aufgabe" button above it). Also verify that the filter chip for "attention" (which uses `bg-amber-500` Tailwind class separately) still looks coherent.

- [ ] **Step 3: Commit**

```bash
git add src/shared/styles/tokens.css
git commit -m "fix(tokens): change --awaiting color to amber to distinguish from CTA orange"
```

---

## Phase 2 — Critical: Notification Visibility Gate

**File:** `supabase/functions/clickup-webhook/index.ts`

**Problem:** When a team member posts a comment to a ClickUp task that does NOT have "Visible in Client Portal" checked, the client still receives an in-app notification and email. Status-based notifications already check visibility (lines ~1060, ~1251, ~1332). Comment notifications do NOT.

**Root cause:** At line 1753–1758, `fetchTaskForVisibilityCheck()` is already called to get `listId` and `name`, but the returned `visible` boolean is never checked.

**Important:** Support task comments (handled in the `if (supportProfiles.length > 0)` branch, lines 1670–1743) should NOT be gated — support tasks are always client-facing. The visibility gate applies only to regular task comments (line 1746+ branch).

---

### Task 2.1: Add Visibility Check to Regular Task Comment Notifications

**File:** `supabase/functions/clickup-webhook/index.ts`

- [ ] **Step 1: Add the visibility gate after fetching task info**

Find the block at lines 1753–1758 (inside the `// REGULAR TASK COMMENT` section):

```ts
// Current code (lines 1753–1758):
if (clickupTokenForComment) {
  const commentTaskInfo = await fetchTaskForVisibilityCheck(taskId, clickupTokenForComment, log);
  if (commentTaskInfo) {
    commentTaskListId = commentTaskInfo.listId;
    commentTaskName = commentTaskInfo.name;
  }
}
```

Replace with:

```ts
if (clickupTokenForComment) {
  const commentTaskInfo = await fetchTaskForVisibilityCheck(taskId, clickupTokenForComment, log);
  if (commentTaskInfo) {
    // CRITICAL: Skip all notifications if task is not visible in the client portal
    if (!commentTaskInfo.visible) {
      log.info("Task not visible in client portal — skipping comment notification", { taskId });
      return new Response(
        JSON.stringify({ message: "Task not visible in portal — comment notification skipped" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    commentTaskListId = commentTaskInfo.listId;
    commentTaskName = commentTaskInfo.name;
  }
}
```

- [ ] **Step 2: Verify logic**

Read through the surrounding code to confirm:
- The support task check (lines 1658–1743) runs BEFORE this block — support comments still go through
- The visibility check applies only to non-support tasks (the `else` branch starting at line 1746)
- `fetchTaskForVisibilityCheck()` is defined in the same file (around line 312) and uses `CLICKUP_VISIBLE_FIELD_ID` env var — confirm that env var is set in Coolify

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/clickup-webhook/index.ts
git commit -m "fix(webhook): gate comment notifications on 'visible in client portal' field

Tasks not marked visible in ClickUp now correctly receive no in-app or email
notifications when team members post comments. Support tasks are unaffected."
```

- [ ] **Step 4: Deploy Edge Function**

The edge functions deploy via Coolify volume mount (no manual deploy command needed — the file change is picked up on next container sync). Verify with a test: in ClickUp, find a task WITHOUT the visibility field checked, post a comment, confirm no notification arrives in the portal.

---

## Phase 3 — Search Global Scope

**Files:**
- `src/modules/tickets/lib/task-list-utils.ts` — core logic change
- `src/modules/tickets/__tests__/task-list-search.test.ts` — update failing test

**Problem:** When a search query is active, `filterTasks` applies the status filter AFTER the search, so results are scoped to the current status tab. The user expects search to find tasks across ALL statuses.

---

### Task 3.1: Change `filterTasks` to Skip Status Filter When Query Is Active

**File:** `src/modules/tickets/lib/task-list-utils.ts`

- [ ] **Step 1: Write the failing test first**

In `src/modules/tickets/__tests__/task-list-search.test.ts`, update the `filterTasks search behavior` describe block:

```ts
describe('filterTasks search behavior', () => {
  test('bypasses status filter and searches all tasks when query is active', () => {
    const tasks = [
      makeTask({ clickup_id: 'a', name: 'Alpha', description: 'Needs invoice upload', status: 'open' }),
      makeTask({ clickup_id: 'b', name: 'Beta', description: 'No match here', status: 'open' }),
      makeTask({ clickup_id: 'c', name: 'Gamma', description: 'Invoice mentioned here too', status: 'complete' }),
    ]

    const result = filterTasks(tasks, 'open', 'invoice')

    // Both 'open' and 'complete' tasks match — status filter is bypassed
    expect(result.map(task => task.clickup_id)).toEqual(['a', 'c'])
  })

  test('applies status filter normally when query is empty', () => {
    const tasks = [
      makeTask({ clickup_id: 'a', name: 'Alpha', status: 'open' }),
      makeTask({ clickup_id: 'b', name: 'Beta', status: 'complete' }),
    ]

    const result = filterTasks(tasks, 'open', '')

    expect(result.map(task => task.clickup_id)).toEqual(['a'])
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test -- task-list-search
```

Expected: the first test FAILS (currently returns `['a']` instead of `['a', 'c']`).

- [ ] **Step 3: Update `filterTasks` logic**

In `src/modules/tickets/lib/task-list-utils.ts`, replace the `filterTasks` function:

```ts
export function filterTasks(tasks: ClickUpTask[], filter: TaskFilter, query: string, activeFilters?: ActiveFilters): ClickUpTask[] {
  let result = tasks

  // When a search query is active, bypass the status filter so results span all statuses
  if (!query.trim()) {
    switch (filter) {
      case 'attention':   result = result.filter(t => { const s = mapStatus(t.status); return s === 'needs_attention' || s === 'awaiting_approval'; }); break
      case 'ready':       result = result.filter(t => mapStatus(t.status) === 'ready'); break
      case 'open':        result = result.filter(t => mapStatus(t.status) === 'open'); break
      case 'in_progress': result = result.filter(t => mapStatus(t.status) === 'in_progress'); break
      case 'approved':    result = result.filter(t => mapStatus(t.status) === 'approved'); break
      case 'done':        result = result.filter(t => mapStatus(t.status) === 'done'); break
      case 'on_hold':     result = result.filter(t => mapStatus(t.status) === 'on_hold'); break
      case 'cancelled':   result = result.filter(t => mapStatus(t.status) === 'cancelled'); break
      default:            break
    }
  }

  if (query.trim()) {
    result = result.filter(t => matchesTaskSearch(t, query))
  }

  if (!activeFilters) return result

  if (activeFilters.priorities.length > 0) {
    result = result.filter(t => {
      const p = (t.priority ?? 'none').toLowerCase()
      return activeFilters.priorities.includes(p)
    })
  }

  if (activeFilters.datePreset) {
    const now = new Date()
    result = result.filter(t => {
      const due = t.due_date ? new Date(t.due_date) : null
      switch (activeFilters.datePreset) {
        case 'overdue': return due !== null && due < now
        case '1day':    return due !== null && due >= now && due <= addDays(now, 1)
        case '3days':   return due !== null && due >= now && due <= addDays(now, 3)
        case '1week':   return due !== null && due >= now && due <= addDays(now, 7)
        case '1month':  return due !== null && due >= now && due <= addDays(now, 30)
        case '3months': return due !== null && due >= now && due <= addDays(now, 90)
        case 'nodue':   return due === null
        default:        return true
      }
    })
  }

  return result
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test -- task-list-search
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/tickets/lib/task-list-utils.ts src/modules/tickets/__tests__/task-list-search.test.ts
git commit -m "fix(tickets): search now spans all statuses regardless of active status filter"
```

---

## Phase 4 — iOS / Mobile Fixes

**Files:**
- `index.html` — viewport meta tag
- `src/modules/projects/components/overview/OverviewTabs.tsx` — nested scroll fix
- `src/shared/styles/tokens.css` — iOS input zoom fix (font-size)

---

### Task 4.1: Viewport Meta — Add `viewport-fit=cover`

**File:** `index.html`

- [ ] **Step 1: Update viewport meta tag**

```html
<!-- Before: -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, interactive-widget=resizes-content" />

<!-- After: -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content" />
```

`viewport-fit=cover` ensures the portal fills the full screen on iPhone (including under the notch) and prevents the viewport from being shrunk in certain iOS Chrome states.

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "fix(viewport): add viewport-fit=cover for iOS notch and Chrome rendering"
```

---

### Task 4.2: iOS Input Auto-zoom Fix (Font Size)

**Problem:** iOS Safari and Chrome auto-zoom when focusing an input with font-size < 16px. The `!text-xxs` class on `TaskSearchBar` and other inputs triggers this zoom, which is why the portal appears "zoomed in" after tapping a search box on iPhone.

**Fix:** Globally enforce 16px font-size on all inputs/textareas on mobile. This is the standard iOS fix.

**File:** `src/shared/styles/tokens.css`

- [ ] **Step 1: Add mobile input font-size rule**

At the end of `src/shared/styles/tokens.css`, add:

```css
/* iOS auto-zoom prevention: inputs below 16px trigger zoom on focus */
@media (max-width: 768px) {
  input,
  textarea,
  select {
    font-size: 16px !important;
  }
}
```

- [ ] **Step 2: Verify**

On iPhone (or Chrome DevTools iPhone SE viewport), tap the search bar in Tickets. The page should NOT zoom in.

- [ ] **Step 3: Commit**

```bash
git add src/shared/styles/tokens.css
git commit -m "fix(mobile): prevent iOS input auto-zoom by enforcing 16px font-size on mobile"
```

---

### Task 4.3: iOS Projects Scroll-to-Top Fix

**Problem:** In the Projects Übersicht page on iOS, scrolling down to reach the tabs causes the page to snap back to top. Root cause: `OverviewPage.tsx` has `overflow-y-auto` on the outer container, AND `OverviewTabs.tsx` has `overflow-y-auto` on the inner tab content. On iOS, scroll events "chain" from the inner container to the outer one — when the user reaches the inner container's top edge, iOS bounces the outer container upward.

**Fix:** Add `overscroll-behavior-y: contain` to the inner scroll container in `OverviewTabs.tsx` to prevent scroll chaining.

**File:** `src/modules/projects/components/overview/OverviewTabs.tsx`

- [ ] **Step 1: Add `overscroll-behavior-y: contain`**

Change line 37:

```tsx
// Before:
<div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>

// After:
<div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'thin', overscrollBehaviorY: 'contain' }}>
```

- [ ] **Step 2: Verify on iOS Chrome**

Test on an iPhone (real device or BrowserStack): scroll down past the hero and timeline to the tabs area, then scroll within the tab content. The page should NOT bounce back to the top.

- [ ] **Step 3: Commit**

```bash
git add src/modules/projects/components/overview/OverviewTabs.tsx
git commit -m "fix(projects): prevent iOS scroll-to-top by containing overscroll on tab content"
```

---

## Phase 5 — Session Timeout (Inactivity Auto-logout)

**Files:**
- `src/shared/lib/session-timeout.ts` — new file: inactivity tracker
- `src/shared/hooks/useAuth.ts` — integrate timer into AuthProvider

**Goal:** Auto-logout after 3 hours of user inactivity. Show a toast warning 5 minutes before logout. On any user interaction (click, key, touch, scroll), reset the timer.

---

### Task 5.1: Create Session Timeout Utility

**File:** `src/shared/lib/session-timeout.ts` (new file)

- [ ] **Step 1: Create the utility**

```ts
// src/shared/lib/session-timeout.ts

export const SESSION_TIMEOUT_MS = 3 * 60 * 60 * 1000  // 3 hours
export const SESSION_WARNING_MS = 5 * 60 * 1000        // warn 5 minutes before

let lastActivityAt = Date.now()

function recordActivity() {
  lastActivityAt = Date.now()
}

export function getIdleMs(): number {
  return Date.now() - lastActivityAt
}

export function startActivityTracking(): () => void {
  const events = ['mousemove', 'keydown', 'touchstart', 'click', 'scroll'] as const
  events.forEach(e => window.addEventListener(e, recordActivity, { passive: true }))
  return () => events.forEach(e => window.removeEventListener(e, recordActivity))
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/lib/session-timeout.ts
git commit -m "feat(auth): add session timeout utility with inactivity tracking"
```

---

### Task 5.2: Integrate Timeout into AuthProvider

**File:** `src/shared/hooks/useAuth.ts`

- [ ] **Step 1: Write a failing test**

Create `src/shared/__tests__/session-timeout.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { getIdleMs, SESSION_TIMEOUT_MS, startActivityTracking } from '../lib/session-timeout'

describe('session-timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('getIdleMs increases over time', () => {
    startActivityTracking()
    vi.advanceTimersByTime(5000)
    expect(getIdleMs()).toBeGreaterThanOrEqual(5000)
  })

  test('SESSION_TIMEOUT_MS is 3 hours', () => {
    expect(SESSION_TIMEOUT_MS).toBe(3 * 60 * 60 * 1000)
  })
})
```

- [ ] **Step 2: Run tests — confirm pass**

```bash
npm run test -- session-timeout
```

Expected: PASS (the utility is already written).

- [ ] **Step 3: Add timeout logic to AuthProvider**

In `src/shared/hooks/useAuth.ts`, add these imports at the top:

```ts
import { toast } from 'sonner'
import { startActivityTracking, getIdleMs, SESSION_TIMEOUT_MS, SESSION_WARNING_MS } from '@/shared/lib/session-timeout'
```

Then, inside the `AuthProvider` function body, add a new `useEffect` AFTER the existing auth state effect:

```ts
// Session inactivity timeout
useEffect(() => {
  if (STAGING_AUTH_BYPASS || !user) return

  const stopTracking = startActivityTracking()
  let warnedAboutExpiry = false

  const checkInterval = setInterval(() => {
    const idle = getIdleMs()
    const remaining = SESSION_TIMEOUT_MS - idle

    if (remaining <= 0) {
      clearInterval(checkInterval)
      stopTracking()
      supabase.auth.signOut().then(() => {
        setUser(null)
        setSession(null)
        setProfile(null)
        toast.info('Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.')
      })
    } else if (!warnedAboutExpiry && remaining <= SESSION_WARNING_MS) {
      warnedAboutExpiry = true
      toast.warning('Ihre Sitzung läuft in 5 Minuten ab. Klicken Sie irgendwo, um sie zu verlängern.', {
        duration: 30_000,
      })
    }
  }, 60_000) // check every minute

  return () => {
    clearInterval(checkInterval)
    stopTracking()
  }
}, [user]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Run all tests**

```bash
npm run test
```

Expected: all tests PASS. No existing tests should break.

- [ ] **Step 5: Verify behavior**

In development, temporarily change `SESSION_TIMEOUT_MS` to `30_000` (30 seconds), log in, wait 30 seconds without interacting — confirm the warning toast appears at 25 seconds, then auto-logout at 30 seconds. Revert constant to `3 * 60 * 60 * 1000`.

- [ ] **Step 6: Commit**

```bash
git add src/shared/hooks/useAuth.ts src/shared/__tests__/session-timeout.test.ts
git commit -m "feat(auth): auto-logout after 3 hours of inactivity with 5-min warning toast"
```

---

## Verification Checklist

After all phases are deployed:

| Fix | How to verify |
|-----|---------------|
| Mobile filter button | Open Tickets on 375px viewport → button shows "Weitere Status" |
| Email template | Post a comment from ClickUp → email subject says "Nachricht zu..." |
| Mobile button text | 375px viewport → button shows "+ Aufgabe" |
| Ihre Rückmeldung color | Set a task to CLIENT REVIEW → amber badge, visually distinct from orange CTA button |
| Notification gate | In ClickUp, ensure a task has NO visibility field → post a comment → no portal notification received |
| Search scope | Type a search query → results include tasks from all status tabs |
| iOS viewport | Test on iPhone Chrome → no zoom mismatch, correct full-screen rendering |
| iOS input zoom | Tap search bar on iPhone → page does NOT zoom in |
| iOS scroll | Scroll down in Projects to tabs → page does NOT snap back to top |
| Session timeout | Set constant to 30s → confirm warning toast and auto-logout |

## Support Badge Note

The Support workspace badge already exists in `SidebarWorkspaces.tsx` — it shows a count badge when `module_key === 'support'` and `supportUnread > 0`. If a user reports the badge missing even with unread messages, check: (1) the workspace entry in `client_workspaces` table has `module_key = 'support'`, and (2) `useUnreadCounts` is returning a non-zero count for that user.
