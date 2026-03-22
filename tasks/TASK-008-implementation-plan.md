# TASK-008: UI Component Unification — Implementation Plan

## Context
63 components audited. Most are correctly custom (portal-specific domain logic). But 7 areas have generic UI primitives that should use shadcn/ui for consistency, a11y, and less code. Also need to fix hardcoded colors and oversized components.

## Scope: 4 Batches

---

### Batch 1: Install shadcn/ui Base Components

**Run these commands:**
```bash
npx shadcn@latest init  # if not already initialized
npx shadcn@latest add button badge input textarea tabs skeleton avatar alert-dialog
```

This installs standardized components into `src/shared/components/ui/`.

**Customize to match portal theme:**
- All components must use existing CSS custom properties from `tokens.css`
- No new color scheme — adapt shadcn defaults to `--text-primary`, `--accent`, `--surface`, `--border` etc.
- Button variants: `default`, `outline`, `ghost`, `destructive` (map to portal patterns)

---

### Batch 2: Replace Custom Implementations

#### 2.1 ConfirmDialog → shadcn AlertDialog
**File:** `src/shared/components/common/ConfirmDialog.tsx` (111 lines)
- Replace with shadcn AlertDialog wrapper
- Keep the same props interface (`title`, `description`, `confirmLabel`, `onConfirm`, `destructive`)
- Remove hardcoded `#dc2626` — use `destructive` variant
- Target: ~40 lines

#### 2.2 LoadingSkeleton → shadcn Skeleton
**File:** `src/shared/components/common/LoadingSkeleton.tsx` (32 lines)
- Replace custom shimmer with shadcn Skeleton
- Keep the `lines` and `height` props interface
- Remove custom keyframe animation

#### 2.3 Tabs in OverviewTabs → shadcn Tabs
**File:** `src/modules/projects/components/overview/OverviewTabs.tsx` (64 lines)
- Replace manual tab buttons with `<Tabs>`, `<TabsList>`, `<TabsTrigger>`, `<TabsContent>`
- Keep existing content rendering unchanged
- Gains: keyboard navigation, a11y roles

#### 2.4 Tabs in StepDetail → shadcn Tabs
**File:** `src/modules/projects/components/steps/StepDetail.tsx` (247 lines)
- Replace manual tab switching with shadcn Tabs
- Also extract sub-components to get under 150 lines:
  - `StepOverviewTab.tsx` (~80 lines)
  - `StepFilesTab.tsx` (~40 lines)
  - `StepDiscussionTab.tsx` (~20 lines)
- StepDetail becomes orchestrator: ~80 lines

#### 2.5 Inline buttons → shadcn Button
**Across all components:**
- Replace inline `<button className="px-[14px] py-[8px] text-[13px]...">` with `<Button variant="default|outline|ghost">`
- Define portal-specific button sizes: `sm`, `default`, `lg`
- Key files: StepActionBar, QuickActions, TaskActions, DateienPage, all konto sections

#### 2.6 Inline inputs → shadcn Input + Textarea
**Key files:**
- TaskSearchBar → `<Input>` with search icon
- Konto sections (ProfileSection, PasswordSection) → `<Input>`
- CommentInput → `<Textarea>`
- CreateFolderInput → `<Input>`

#### 2.7 Avatar consolidation → shadcn Avatar
**Current:** Radix Avatar in AvatarUpload + inline initials circles in MessageBubble, SidebarUserFooter
- Create portal `<UserAvatar>` wrapper using shadcn Avatar
- Props: `name`, `avatarUrl`, `size` ('sm' | 'md' | 'lg')
- Fallback: colored initials circle

---

### Batch 3: Fix Hardcoded Colors

Replace ALL hardcoded hex colors with CSS custom properties:

| File | Hardcoded | Replace with |
|------|-----------|-------------|
| `ConfirmDialog.tsx` | `#dc2626` | `var(--destructive)` or Button destructive variant |
| `PriorityIcon.tsx` | Color record | CSS vars: `--priority-urgent`, `--priority-high`, etc. |
| `StatusBadge.tsx` | `#eff6ff`, etc. | Already uses some vars — complete the migration |
| `MessageBubble.tsx` | `#7C3AED`, `#fff` | `var(--accent)`, `var(--surface)` |
| `PhaseNode.tsx` | Various inline | Phase color vars already exist — use them |

Add any missing tokens to `tokens.css`.

---

### Batch 4: Oversized Component Extraction

#### 4.1 NewTicketDialog (243 → ~100 + sub-components)
Split into:
- `NewTicketDialog.tsx` — orchestrator (~80 lines)
- `TicketForm.tsx` — form fields for ticket mode (~80 lines)
- `ProjectTaskForm.tsx` — form fields for project mode (~80 lines)

#### 4.2 StepDetail (247 → ~80 + 3 tabs)
Already covered in Batch 2.4.

#### 4.3 UpdatesFeed (170 → ~80 + sub-component)
- Extract `StatusActivityItem` and `CommentActivityItem` into `ActivityItems.tsx`
- Extract `getStatusIcon` into shared helper

---

## Commit Structure

| Commit | Content |
|--------|---------|
| 1 | `npx shadcn add` + theme customization in `tokens.css` |
| 2 | ConfirmDialog + LoadingSkeleton → shadcn replacements |
| 3 | Tabs migration (OverviewTabs + StepDetail extraction) |
| 4 | Button + Input + Textarea + Avatar unification |
| 5 | Hardcoded colors → CSS custom properties |
| 6 | Oversized component extraction (NewTicketDialog, UpdatesFeed) |

## Verification

After each batch:
1. `npm run build` — clean
2. `npx vitest run` — all tests pass
3. Visual: open portal, check that all pages render correctly
4. No hardcoded hex colors in changed files (grep verification)
5. All new components < 150 lines
