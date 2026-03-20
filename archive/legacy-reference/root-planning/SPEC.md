# KAMANIN Portal — Design & Component Spec

Reference document. Claude Code reads this when building components.
Visual source of truth: `kamanin-portal-prototype.html`

---

## 1. Design Tokens (tokens.css)

```css
:root {
  /* Surface */
  --bg: #FAFAF9;
  --surface: #FFFFFF;
  --surface-hover: #F5F5F4;
  --surface-active: #EFEDEB;
  --surface-elevated: #FFFFFF;
  --sidebar-bg: #1A1247;
  --sidebar-hover: #2B1878;
  --sidebar-active: #3A2888;

  /* Text */
  --text-primary: #333333;
  --text-secondary: #555555;
  --text-tertiary: #999999;
  --text-inverse: #FAFAF9;
  --text-sidebar: #A8A0C4;
  --text-sidebar-active: #FFFFFF;

  /* Accent (Brand Indigo) */
  --accent: #2B1878;
  --accent-light: #EEEAFF;
  --accent-hover: #1F1059;

  /* Brand CTA (Orange) */
  --cta: #FF8730;
  --cta-hover: #E6751A;
  --cta-light: #FFF3E8;

  /* Status */
  --committed: #16A34A;
  --committed-bg: #F0FDF4;
  --awaiting: #EA580C;
  --awaiting-bg: #FFF7ED;
  --upcoming: #9CA3AF;
  --upcoming-bg: #F9FAFB;

  /* Phase Colors */
  --phase-1: #7C3AED;       /* Konzept (violet) */
  --phase-1-light: #F5F3FF;
  --phase-1-mid: #EDE9FE;
  --phase-1-text: #6D28D9;

  --phase-2: #2563EB;       /* Struktur (blue) */
  --phase-2-light: #EFF6FF;
  --phase-2-mid: #DBEAFE;
  --phase-2-text: #1D4ED8;

  --phase-3: #D97706;       /* Design (amber) */
  --phase-3-light: #FFFBEB;
  --phase-3-mid: #FEF3C7;
  --phase-3-text: #B45309;

  --phase-4: #059669;       /* Entwicklung (emerald) */
  --phase-4-light: #ECFDF5;
  --phase-4-mid: #D1FAE5;
  --phase-4-text: #047857;

  /* Border */
  --border: #E5E5E5;
  --border-light: #F0F0F0;

  /* Radius */
  --r-sm: 6px;
  --r-md: 10px;
  --r-lg: 14px;
  --r-xl: 18px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 2px 8px rgba(0,0,0,0.06);
  --shadow-lg: 0 4px 24px rgba(0,0,0,0.08);
  --shadow-xl: 0 8px 40px rgba(0,0,0,0.12);

  /* Spacing */
  --sp-xs: 4px;
  --sp-sm: 8px;
  --sp-md: 12px;
  --sp-lg: 16px;
  --sp-xl: 24px;
  --sp-2xl: 32px;
  --sp-3xl: 48px;

  /* Layout */
  --sidebar-w: 260px;
  --sidebar-collapsed-w: 56px;
  --bottomnav-h: 64px;
}
```

Map to Tailwind via `tailwind.config.ts` `extend.colors` and `extend.spacing`.

---

## 2. Sidebar (AppShell)

**Desktop:**
- Collapsed: 56px wide, icons only
- Hover-expand: 260px wide, labels appear
- Transition: 0.2s ease
- Background: #1C1C1C
- No notification badges in sidebar — badges only on quick action cards

**Navigation items (top to bottom):**
1. Logo (KAMANIN mark)
2. Separator
3. Übersicht (home icon)
4. Aufgaben (tasks icon)
5. Nachrichten (messages icon)
6. Dateien (files icon)
7. Separator
8. Module-specific sub-navigation (chapters for Project Experience)
9. Separator
10. Hilfe (help icon)
11. Footer: client avatar + name + role

**Mobile:**
- Sidebar hidden by default
- Hamburger opens as full overlay (280px, slides left)
- Bottom nav: Home, Aufgaben, Chat, Dateien (64px height)
- Mobile header: hamburger + page title (52px height)

---

## 3. Project Experience — Overview Page

5-section architecture (DO NOT change order):

```
1. ov-header          — project name + subtitle
2. context-strip      — phase timeline + narrative + team status line
3. ov-hero            — dynamic hero (priority cascade)
4. ov-quick-actions   — 3 action cards with inline counters
5. ov-tabs            — Updates / Dateien / Nachrichten
```

### 3.1 PhaseTimeline

Horizontal stepper, 4 phase nodes + connectors.

**Container:** white surface, 1px border-light, rounded-md, padding 8px 6px.

**Node states:**

| State | Dot | Label | State label |
|-------|-----|-------|-------------|
| completed | Green filled, white ✓ | Primary color | "Abgeschlossen" |
| current | Blue filled, white center circle, 2.4s pulse | Blue bold | "Aktuell" |
| upcoming | Grey border-only, subtle – dash at 50% opacity | Tertiary color | — |

**Connectors:** 28px × 2px. Default: border color, opacity 0.4. After completed: committed green, opacity 1.
**Mobile (< 768px):** 2×2 grid, connectors hidden.

### 3.2 DynamicHero (Priority Cascade)

Shows ONE thing. Phase-tinted background.

| Priority | Condition | Eyebrow | CTA | --hero-tint |
|----------|-----------|---------|-----|-------------|
| 1 | `awaiting_input` step exists | "NÄCHSTER SCHRITT" + pulse | **Öffnen & prüfen →** + ghost "Nachricht senden" | Phase light color |
| 2 | tasks need attention | "JETZT WICHTIG" + pulse | **Aufgaben öffnen →** | #FFFBEB (amber) |
| 3 | next `upcoming_locked` step | "IN VORBEREITUNG" + zap | ghost "Nachricht senden" | Phase light color |
| 4 | all complete | "ALLES ERLEDIGT" + check | — | Phase light color |

**CSS critical:**
- Background: `var(--hero-tint)`
- Border: phase-tinted via `color-mix(in srgb, var(--hero-phase), transparent 82%)`
- Top accent line: 4px height, gradient from phase main to 40% transparent
- Shadow: `0 1px 4px rgba(0,0,0,0.04), 0 6px 20px rgba(0,0,0,0.03)`
- Summary: no border-top, opacity 0.7
- Spacing: eyebrow→title 8px, title→desc 10px, desc→CTA 18px, padding 28px 32px 22px

### 3.3 QuickActions

3-column grid:

| Card | Accent | Bg | Icon | Counter |
|------|--------|-----|------|---------|
| Aufgaben öffnen | #D97706 | #FFFBEB | tasks | Amber pill if needsAttention > 0 |
| Nachricht senden | #7C3AED | #F5F3FF | messages | Violet pill if unread > 0 |
| Datei hochladen | #2563EB | #EFF6FF | upload | — |

Counter pill: 18px height, min-width 18px, 10px font, bold 700, border-radius 9px.
Mobile: 2-col (3rd full-width). At 420px: single column.

### 3.4 OverviewTabs

Tabs: Updates (default) | Dateien | Nachrichten

**Update items:** Type icon (26×26 rounded box), title + time on baseline.
- file → blue bg (#EFF6FF), upload icon
- status → green bg (#ECFDF5), check icon
- message → violet bg (#F5F3FF), messages icon

Mobile: time stacks below title.

---

## 4. Project Experience — Other Pages

### Step Detail (3 tabs)

**Übersicht:** Step title + status badge, description, expandable "Warum ist das wichtig?" and "Was wird danach festgelegt?", linked tasks.
**Dateien:** File list with type icons, name, size, date, author.
**Diskussion:** Message thread. Team = left grey bubble. Client = right blue bubble.

### Tasks (bridge page)

Tasks grouped by status: "Needs attention" (orange header), "In progress" (blue header). Each: title, status badge, linked step.

### Files (phase folder view)

4 phase folders (Konzept, Struktur, Design, Entwicklung) with file count. Table: icon, name, phase badge, size, date. Filters: phase, type.

### Messages (aggregated)

Messages from all steps, grouped by step. Header = step name, then thread.

---

## 5. Tasks/Support Module — UI Spec

### TasksPage (dashboard)

**Filter bar:** "Wartet auf Sie" (default when applicable) | Alle | In Bearbeitung | Erledigt
**Task list:** Grouped by portal status. Newest first within group.

### TaskCard

```
┌──────────────────────────────────────────────┐
│  [StatusDot] Task title                      │
│  Portal status badge          Letzte Aktivität│
│  (if linked step: step name in tertiary)     │
└──────────────────────────────────────────────┘
```

- Surface card, 1px border, rounded-md, hover surface-hover
- Status badge uses portal status color mapping
- Last activity: relative time (vor 2 Stunden)

### TaskDetailPage

```
┌──────────────────────────────────────────────┐
│  ← Zurück                                    │
│                                              │
│  Task title                                  │
│  Status: [badge]    Erstellt: [date]         │
│                                              │
│  ┌─ Actions ─────────────────────────────┐   │
│  │ [Freigeben] [Änderungen anfordern]    │   │ ← only if "Needs Your Attention"
│  └───────────────────────────────────────┘   │
│  ┌─ Secondary ───────────────────────────┐   │
│  │ Pausieren · Abbrechen                 │   │ ← ghost links, subtle
│  └───────────────────────────────────────┘   │
│                                              │
│  ── Kommentare ──                            │
│  [Comment thread]                            │
│  [Comment input + attachment button]         │
│                                              │
│  ── Dateien ──                               │
│  [Attachment list]                           │
└──────────────────────────────────────────────┘
```

**Action buttons:**
- Primary (Approve/Request Changes): filled, prominent, only on "Needs Your Attention"
- Secondary (Hold/Cancel/Resume): ghost/outline, same weight as nav links
- Hold + Cancel require confirmation dialog with optional comment
- All actions call `update-task-status` Edge Function

**Comment thread:**
- Reads from `comment_cache.display_text` (stripped of prefixes)
- Team comments: left-aligned, grey bg
- Client comments: right-aligned, blue bg
- New comment: textarea + "Senden" button + attachment icon
- Post via `post-task-comment` Edge Function

### SupportPage

- Uses `profiles.support_task_id` as the ClickUp task context
- Same comment UI as task detail
- Header: "Support" with team availability indicator
- Separate from task notifications (explicitly excluded from dashboard feed)

### NotificationsFeed

- Bell icon in header with unread count badge
- Dropdown or page: list of notifications from `notifications` table
- Types: `team_reply`, `status_change`
- Mark as read on view (update `read_receipts`)
- Click → navigate to relevant task

---

## 6. Status ↔ Action ↔ Edge Function Mapping

| Portal Action | ClickUp Status | Edge Function | Confirmation? | Optional Comment? |
|--------------|----------------|---------------|---------------|-------------------|
| Freigeben | APPROVED | update-task-status | No | Yes |
| Änderungen anfordern | REWORK | update-task-status | No | Yes |
| Pausieren | ON HOLD | update-task-status | Yes | Yes |
| Fortsetzen | TO DO | update-task-status | Yes | Yes |
| Abbrechen | CANCELED | update-task-status | Yes | Yes |

---

## 7. Notification Matrix (reference)

| Event | Email | Bell | Condition |
|-------|-------|------|-----------|
| Task → Client Review | Yes | Yes | task visible in portal |
| Task → Complete | Yes | Yes | deduplicated |
| Task → In Progress | No | Yes (once) | first transition only |
| Team comment @client: | Yes | Yes | prefix stripped in display |
| Reply in client thread | Yes | Yes | thread context checked |
| Support chat from team | Yes | Yes | via support_task_id |

---

## 8. TypeScript Interfaces

### Project Experience types

```typescript
type StepStatus = 'committed' | 'awaiting_input' | 'upcoming_locked';
type ChapterStatus = 'completed' | 'current' | 'upcoming';

interface Project {
  id: string;
  name: string;
  type: string;
  client: string;
  clientInitials: string;
  startDate: string;
  targetDate: string;
  tasksSummary: { needsAttention: number; inProgress: number; total: number };
  tasks: Task[];
  updates: Update[];
  teamWorkingOn: { task: string; eta: string; lastUpdate: string };
  chapters: Chapter[];
}

interface Chapter {
  id: string;
  title: string;
  order: number;              // 1-4, maps to phase colors
  narrative: string;
  nextNarrative: string;
  steps: Step[];
}

interface Step {
  id: string;
  title: string;
  status: StepStatus;
  updatedAt: string | null;
  taskIds: string[];
  description: string;
  whyItMatters: string;
  whatBecomesFixed: string;
  files: FileItem[];
  messages: Message[];
}

interface ProjectTask {
  id: string;
  title: string;
  status: 'needs-attention' | 'in-progress';
  stepId: string;
}

interface Update {
  text: string;
  time: string;
  type: 'file' | 'status' | 'message';
}

interface FileItem {
  name: string;
  size: string;
  date: string;
  type: 'pdf' | 'img' | 'jpg' | 'png' | 'svg' | 'doc';
  author: string;
}

interface Message {
  author: string;
  role: 'team' | 'client';
  text: string;
  time: string;
}
```

### Helper functions (translate from prototype)

```typescript
function getNextCheckpoint(project: Project): { step: Step; chapter: Chapter } | null
function getNextUpcomingStep(project: Project): { step: Step; chapter: Chapter } | null
function getCurrentChapter(project: Project): Chapter | null
function isChapterCompleted(chapter: Chapter): boolean
function getChapterStatus(chapter: Chapter, project: Project): ChapterStatus
function getChapterProgress(chapter: Chapter): string
function getPhaseColor(chapter: Chapter): { main: string; light: string; mid: string; text: string }
function generateNarrative(project: Project): string
function getTasksForStep(stepId: string, project: Project): ProjectTask[]
```

---

## 9. Mock Data

Project "Praxis Dr. Weber" — exact from prototype:
- Chapter 1 "Konzept": step 1 committed, step 2 awaiting_input
- Chapter 2 "Struktur": steps 3-4 upcoming_locked
- Chapter 3 "Design": step 5 upcoming_locked
- Chapter 4 "Entwicklung": steps 6-7 upcoming_locked
- 3 tasks need attention, 2 in progress
- 4 updates in feed
- Team working on "Sitemap-Entwurf", ETA "Donnerstag"

Hero should show Priority 1 (awaiting_input exists).

---

## 10. Component Trees

### Project Experience

```
modules/projects/
├── components/
│   ├── overview/
│   │   ├── OverviewPage.tsx        # Assembles all 5 sections
│   │   ├── ContextStrip.tsx        # Phase timeline + narrative + team line
│   │   ├── PhaseTimeline.tsx       # 4-phase horizontal stepper
│   │   ├── PhaseNode.tsx           # Single node (completed/current/upcoming)
│   │   ├── DynamicHero.tsx         # Priority cascade hero card
│   │   ├── QuickActions.tsx        # 3 action cards with counters
│   │   ├── OverviewTabs.tsx        # Updates / Dateien / Nachrichten tabs
│   │   ├── UpdatesFeed.tsx         # Update items
│   │   └── UpdateItem.tsx          # Single update row
│   ├── steps/
│   │   ├── StepsPage.tsx
│   │   ├── StepDetail.tsx          # Full step detail (3 tabs)
│   │   ├── StepOverviewTab.tsx
│   │   ├── StepFilesTab.tsx
│   │   └── StepDiscussionTab.tsx
│   ├── tasks/TasksPage.tsx, TaskCard.tsx
│   ├── files/FilesPage.tsx, FileRow.tsx
│   ├── messages/MessagesPage.tsx, MessageBubble.tsx
│   └── help/HelpPage.tsx
├── hooks/useProject.ts, useChapterHelpers.ts, useHeroPriority.ts
├── lib/phase-colors.ts, mock-data.ts, helpers.ts
├── types/project.ts
└── pages/ProjectPage.tsx
```

### Tasks/Support

```
modules/tasks/
├── components/
│   ├── TaskList.tsx
│   ├── TaskCard.tsx
│   ├── TaskDetail.tsx
│   ├── TaskComments.tsx
│   ├── TaskActions.tsx        # Approve, Request Changes, Hold, Cancel
│   ├── TaskFilters.tsx
│   ├── SupportChat.tsx
│   └── NotificationsFeed.tsx
├── hooks/
│   ├── useTasks.ts            # task_cache via React Query + Realtime
│   ├── useTaskComments.ts     # comment_cache
│   ├── useTaskActions.ts      # Edge Function mutations
│   ├── useNotifications.ts    # notifications + read_receipts
│   └── useSupportChat.ts      # support_task_id context
├── lib/
│   ├── status-mapping.ts      # ClickUp → Portal mapping
│   └── transforms.ts          # transformCachedTask
├── types/tasks.ts
└── pages/TasksPage.tsx, TaskDetailPage.tsx, SupportPage.tsx
```

---

## 11. Responsive Breakpoints

| Breakpoint | Layout |
|-----------|--------|
| > 1100px | Full desktop: collapsed sidebar + full overview |
| 768–1100px | Tablet: tighter padding, hero title 20px, QA 2-col |
| < 768px | Mobile: no sidebar, mobile header + bottom nav, 2×2 timeline, 2-col QA |
| < 420px | Small phone: 1-col QA, hero 16px title, tighter padding |

---

## 12. UI Labels (German only)

Navigation: Übersicht, Aufgaben, Nachrichten, Dateien, Hilfe
Hero eyebrows: Nächster Schritt, Jetzt wichtig, In Vorbereitung, Alles erledigt
Hero CTAs: Öffnen & prüfen, Nachricht senden, Datei hochladen, Aufgaben öffnen
Quick actions: Offene Punkte ansehen, Direkt ans Team, Neue Unterlagen senden
Step statuses: Bestätigt, Wartet auf Sie, Bald
Phase labels: Abgeschlossen, Aktuell
Step detail: Warum ist das wichtig?, Was wird danach festgelegt?
Links: Alle Dateien öffnen, Alle Nachrichten
Task actions: Freigeben, Änderungen anfordern, Pausieren, Fortsetzen, Abbrechen
Task filters: Wartet auf Sie, Alle, In Bearbeitung, Erledigt
