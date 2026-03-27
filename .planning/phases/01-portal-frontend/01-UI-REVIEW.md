# Phase 1 -- UI Review

**Audited:** 2026-03-27
**Baseline:** Abstract 6-pillar standards (no UI-SPEC.md exists)
**Screenshots:** Not captured (no dev server detected on ports 3000, 5173, or 8080)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Strong German dictionary system; English leaks in ProjectMemorySheet and admin panels |
| 2. Visuals | 3/4 | Good hierarchy and component structure; limited aria-labels on interactive elements |
| 3. Color | 3/4 | Well-structured token system; 5 hardcoded hex values bypass tokens |
| 4. Typography | 2/4 | 21 distinct arbitrary font sizes create an uncontrolled type scale |
| 5. Spacing | 2/4 | Heavy mix of arbitrary px values alongside Tailwind scale; no dominant system |
| 6. Experience Design | 4/4 | Comprehensive loading, error, empty, disabled, and confirmation states |

**Overall: 17/24**

---

## Top 3 Priority Fixes

1. **21 arbitrary font sizes create visual noise** -- Users encounter inconsistent text sizing across views (e.g., `text-[13px]`, `text-[13.5px]`, `text-[12.5px]`, `text-[11.5px]` all used in adjacent contexts) -- Consolidate to a defined type scale of 6-8 sizes mapped to CSS custom properties or a Tailwind `fontSize` extension (e.g., `--text-2xs: 10px`, `--text-xs: 11px`, `--text-sm: 12px`, `--text-body: 13px`, `--text-md: 14px`, `--text-lg: 16px`, `--text-xl: 18px`, `--text-2xl: 20px`), then replace all arbitrary `text-[Npx]` classes.

2. **ProjectMemorySheet and admin panels use English strings** -- Clients see "Cancel", "Save changes", "Create memory", "Edit memory entry", "Profile", "Internal", "Shared", "Scope", "Category", "Visibility" in an otherwise fully German portal -- Replace all English strings in `ProjectMemorySheet.tsx`, `ProjectContextAdminPanel.tsx`, and `ProjectContextSection.tsx` with German equivalents via the dictionary pattern.

3. **Arbitrary spacing values undermine consistency** -- 25+ unique arbitrary spacing values (e.g., `gap-[10px]`, `gap-[8px]`, `px-[14px]`, `py-[7px]`) coexist with Tailwind scale classes -- Standardize on the declared `--sp-*` token scale or Tailwind's default spacing, replacing arbitrary values with the nearest scale step (e.g., `gap-[10px]` -> `gap-2.5`, `px-[14px]` -> `px-3.5`, `p-[16px]` -> `p-4`).

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**Strengths:**
- Centralized German dictionary at `src/modules/tickets/lib/dictionary.ts` with 80+ entries covering statuses, actions, labels, dialogs, and toasts
- Status labels in `src/modules/tickets/lib/status-dictionary.ts` are complete and consistently German
- Empty states use contextual German messages: "Keine Aufgaben vorhanden.", "Dieser Ordner ist leer.", "Noch keine Nachrichten."
- CTA labels are action-specific: "Freigeben", "Anfrage senden", "Akzeptieren", "Besprechen"
- Error toasts use German with specific failure descriptions, not generic "error occurred"
- No instances of "went wrong" or "try again" in English anywhere

**Issues:**
- `src/modules/projects/components/overview/ProjectMemorySheet.tsx:58,62,107,113` -- Full English UI: "Edit memory entry", "Add memory entry", "Cancel", "Save changes", "Create memory", "Saving..."
- `src/modules/projects/components/overview/ProjectMemorySheet.tsx:14-28` -- Category/visibility labels in English: "Profile", "Communication", "Technical constraint", "Internal", "Shared", "Client visible"
- `src/modules/projects/components/overview/ProjectMemorySheet.tsx:65` -- English description text: "Use memory only for durable context..."
- `src/modules/projects/components/overview/ProjectContextAdminPanel.tsx:13,23-24` -- English category/visibility labels
- `src/modules/projects/components/overview/ProjectContextSection.tsx:12,22` -- Same English labels
- `src/modules/tickets/components/FileAttachments.tsx:13` -- "Anhaenge" missing umlaut (should be "Anhange" or better "Dateien anhangen")

**Note:** The memory/context admin panels may be internal-only (admin audience), but if any client can navigate to project overview, they would see English in context sections.

### Pillar 2: Visuals (3/4)

**Strengths:**
- Clear 3-zone sidebar architecture (Global / Workspaces / Utilities) following Linear-style pattern
- Status badges with colored dots provide strong visual hierarchy (`StatusBadge.tsx`)
- Task cards have consistent 152px fixed height with status-colored left border for scanability
- Motion animations on card hover (`whileHover: { y: -2 }`) add polish
- Priority icons use a distinctive volume-bar metaphor (`PriorityIcon.tsx`) with 1/2/3 bars
- Notification badges use orange CTA color consistently across sidebar, bottom nav, and bell
- Credit approval block has distinct amber styling that draws attention appropriately
- Mobile-responsive layout with dedicated header, bottom nav, and swipe gestures

**Issues:**
- Limited `aria-label` coverage: only `MobileHeader.tsx:15` ("Menu offnen") and `NotificationSection.tsx:36` (`role="switch"`) have explicit accessibility attributes among interactive elements
- `NotificationBell.tsx:23` uses `title` attribute instead of `aria-label` for the bell button
- Icon-only buttons in filter panel, task actions secondary row, and sidebar collapsed state lack aria-labels
- `TaskCard.tsx:51-104` is a `<button>` wrapping complex content -- screen reader announcement may be unclear without an `aria-label`
- No visible focus indicators defined beyond browser defaults in most custom buttons (filter chips, sidebar items)

### Pillar 3: Color (3/4)

**Strengths:**
- Comprehensive token system in `tokens.css` with 60+ CSS custom properties covering surfaces, text, accents, statuses, phases, file types, credits, priorities, and destructive states
- Clear brand hierarchy: Indigo accent (`#2B1878`) for primary actions, Orange CTA (`#FF8730`) for new-task and notification badges
- Status colors are semantically mapped: green for committed/approved, amber for awaiting, red for destructive
- Phase colors (4 phases) each have light/mid/text variants for consistent layered usage
- Sidebar uses dark brand indigo (`#1A1247`) creating strong contrast with light content area

**Issues (5 hardcoded hex values):**
- `src/shared/components/common/StatusBadge.tsx:18` -- `done` status uses `'#F0FDF4'`, `'#6B9B7A'`, `'#86EFAC'` instead of tokens
- `src/shared/components/common/StatusBadge.tsx:20` -- `cancelled` status uses `'#FEF2F2'`, `'#EF4444'` instead of `var(--destructive)` and `var(--destructive-bg)`
- `src/modules/tickets/components/TaskCard.tsx:33` -- `done` border color `'#86EFAC'` hardcoded
- `src/modules/tickets/components/TaskCard.tsx:35` -- `cancelled` border color `'#EF4444'` hardcoded
- `src/modules/tickets/components/TaskCard.tsx:48` -- Hover shadow uses `rgba(0,0,0,0.08)` instead of `var(--shadow-sm)` or `var(--shadow-md)`

These are minor but break the single-source-of-truth principle. If the "done" green or "cancelled" red ever changes in tokens, these components will be out of sync.

### Pillar 4: Typography (2/4)

**Strengths:**
- DM Sans (UI) and DM Mono (code/metadata) font pairing is well-chosen and consistently loaded
- Heading hierarchy exists: `text-xl` for page titles, `text-base` for section headers, smaller sizes for body/meta
- Font weights are restrained to 3 values: `font-medium`, `font-semibold`, `font-bold` (good)
- Tracking adjustments (`tracking-[-0.02em]`) applied consistently to headings

**Issues:**
- **21 distinct arbitrary font sizes** found across the codebase:
  - `text-[8px]` (5), `text-[9px]` (8), `text-[10px]` (21), `text-[10.5px]` (4), `text-[11px]` (29), `text-[11.5px]` (6), `text-[12px]` (42), `text-[12.5px]` (25), `text-[13px]` (53), `text-[13.5px]` (4), `text-[14px]` (5), `text-[15px]` (4), `text-[16px]` (1), `text-[17px]` (1), `text-[18px]` (5), `text-[20px]` (2), `text-[22px]` (1), `text-[1rem]` (1), `text-[1.15rem]` (1), `text-[1.2rem]` (6), `text-[1.3rem]` (1)
- Sub-pixel sizes like `text-[12.5px]`, `text-[13.5px]`, `text-[11.5px]`, `text-[10.5px]` cause subpixel rendering inconsistencies
- Additionally, 7 Tailwind scale sizes are used: `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-4xl`
- Total: **28 distinct font sizes** (21 arbitrary + 7 Tailwind scale) -- far exceeds the 6-8 recommended for a coherent type system
- No centralized type scale definition -- sizes are chosen ad-hoc per component

### Pillar 5: Spacing (2/4)

**Strengths:**
- `tokens.css` defines a clear spacing scale: `--sp-xs` (4px), `--sp-sm` (8px), `--sp-md` (12px), `--sp-lg` (16px), `--sp-xl` (24px), `--sp-2xl` (32px), `--sp-3xl` (48px)
- Layout tokens for sidebar width (260px/56px) and bottom nav height (64px) are properly defined
- `ContentContainer` enforces consistent page width (`max-w-4xl` narrow / `max-w-6xl` wide)
- Page-level padding is consistently `p-6 max-[768px]:p-4`

**Issues:**
- **441 arbitrary pixel spacing values** found across 96 files, heavily competing with Tailwind scale usage
- Top arbitrary values: `gap-[10px]` (27 uses), `gap-[8px]` (21), `px-[14px]` (17), `py-[8px]` (13), `px-[12px]` (12)
- The declared `--sp-*` tokens are barely used in component code -- components use raw `[Npx]` values instead
- Non-standard gaps appear: `gap-[14px]`, `py-[7px]`, `px-[6px]` don't align to any 4px/8px grid
- Mix of systems: some components use Tailwind scale (`gap-2`, `p-4`), others use arbitrary px (`gap-[8px]`, `p-[16px]`), and some use CSS custom properties -- three competing approaches
- `CommentInput.tsx:90` uses 5 different spacing values in one className: `pt-[12px]`, `pt-[8px]`, `pb-[4px]`

### Pillar 6: Experience Design (4/4)

**Strengths:**
- **Loading states:** 119 references across 36 files. `LoadingSkeleton` component used consistently for data-loading states. Loading indicators on buttons (`isPending`, `isLoading` checks).
- **Error states:** 77 references across 26 files. Error handling in `FolderView.tsx`, `SupportChat.tsx`, `TaskComments.tsx`. Toast notifications for all action failures with specific German messages.
- **Empty states:** 25 references across 22 files. `EmptyState` component with contextual messages and optional icons. Covers tasks, comments, files, folders, notifications, and messages.
- **Disabled states:** 14 files implement disabled styling with `cursor-not-allowed` and `opacity-50`. Form buttons properly disabled during submission (`isPending`).
- **Confirmation dialogs:** `ConfirmDialog` used for destructive actions (cancel task, put on hold) with clear German messaging and `destructive` prop for red styling.
- **Optimistic updates:** Comment posting uses optimistic UI with error rollback.
- **Realtime subscriptions:** Data stays fresh via Supabase Realtime with 30s polling fallback.
- **Mobile UX:** Swipe gestures for sidebar, dedicated bottom nav, responsive padding, keyboard-aware comment input.
- **URL-based state:** Task detail sheet uses `?taskId=xxx` for deep-linking and back-button support.
- **Auto-scroll:** Support chat and comments auto-scroll to latest message.

---

## Registry Safety

Registry audit: shadcn/ui is initialized (components.json present). No third-party registries configured -- only shadcn official components used. No flags.

---

## Files Audited

### Layout (5 files)
- `src/shared/components/layout/AppShell.tsx`
- `src/shared/components/layout/Sidebar.tsx`
- `src/shared/components/layout/MobileHeader.tsx`
- `src/shared/components/layout/BottomNav.tsx`
- `src/shared/components/layout/ContentContainer.tsx`

### Tickets Module (14 files)
- `src/modules/tickets/components/TaskCard.tsx`
- `src/modules/tickets/components/TaskList.tsx`
- `src/modules/tickets/components/TaskDetail.tsx`
- `src/modules/tickets/components/TaskActions.tsx`
- `src/modules/tickets/components/TaskFilters.tsx`
- `src/modules/tickets/components/TaskFilterPanel.tsx`
- `src/modules/tickets/components/CommentInput.tsx`
- `src/modules/tickets/components/SupportChat.tsx`
- `src/modules/tickets/components/CreditBadge.tsx`
- `src/modules/tickets/components/CreditApproval.tsx`
- `src/modules/tickets/components/NotificationBell.tsx`
- `src/modules/tickets/components/NewTicketDialog.tsx`
- `src/modules/tickets/components/PriorityIcon.tsx`
- `src/modules/tickets/lib/dictionary.ts`

### Projects Module (3 files)
- `src/modules/projects/pages/UebersichtPage.tsx`
- `src/modules/projects/pages/DateienPage.tsx`
- `src/modules/projects/components/files/FolderView.tsx`

### Shared Components (4 files)
- `src/shared/components/common/StatusBadge.tsx`
- `src/shared/components/common/EmptyState.tsx`
- `src/shared/components/konto/ProfileSection.tsx`
- `src/shared/components/konto/NotificationSection.tsx`

### Pages (3 files)
- `src/shared/pages/KontoPage.tsx`
- `src/modules/tickets/pages/TicketsPage.tsx`
- `src/modules/tickets/pages/SupportPage.tsx`

### Design System (2 files)
- `src/shared/styles/tokens.css`
- `src/modules/tickets/lib/status-dictionary.ts`

### Flagged for English strings (3 files)
- `src/modules/projects/components/overview/ProjectMemorySheet.tsx`
- `src/modules/projects/components/overview/ProjectContextAdminPanel.tsx`
- `src/modules/projects/components/overview/ProjectContextSection.tsx`
