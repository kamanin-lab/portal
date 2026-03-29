# Ticket Module Audit Report

**Date:** 2026-03-11
**Source:** `g:/01_OPUS/Projects/PORTAL/tickets/src/`
**Target:** `kamanin-portal/src/modules/tickets/`
**Auditor:** Claude Code (Step 1 of ticket-integration)

---

## Pre-analysis Verification

### ✅ Router leak check
```
grep -rn "useNavigate|useParams|useLocation|from 'react-router" tickets/src/hooks/
```
**Result: CLEAN — zero matches.** No hook imports from react-router. Hooks are fully portable.

### ✅ React 19-only API check
```
grep -rn "use(|useFormStatus|useOptimistic|useActionState" tickets/src/hooks/
```
**Result: CLEAN — zero matches.** No React 19 API usage. Integration with portal (React 19) is safe.

### ⚠️ constants.ts credential check
```
grep -n "supabase|http|apikey|anon|service_role|VITE_" tickets/src/lib/constants.ts
```
**Result:** Line 3: `export const PRODUCTION_URL = 'https://portal.kamanin.at';`
Assessment: A public URL, not a credential. No API keys found. Safe to copy (strip the URL or adapt).

---

## Section 1: Files to REUSE

Copy to `src/modules/tickets/hooks/` and refactor imports as noted.

### Hooks

| Hook | Actual purpose | Import changes |
|------|---------------|----------------|
| `useClickUpTasks.ts` | Fetches `task_cache`, Realtime subscription, background refresh, force refresh. Exports `ClickUpTask` interface (must move to types). | `@/integrations/supabase/client` → `@/shared/lib/supabase`; `@/contexts/AuthContext` (useAuthContext) → `@/shared/hooks/useAuth` |
| `useTaskComments.ts` | Reads `comment_cache`, Realtime sub, 30s polling, manual refetch. Exports `useTaskComments` + `usePostComment`. | supabase, `@/hooks/use-toast` → portal toast, `@/components/CommentInput` (FileData) → extract type to `types/tasks.ts`, `@/lib/logger` → local |
| `useTaskActions.ts` | Mutations via `update-task-status` Edge Function. German toast messages inline. | supabase, `@/hooks/use-toast` → portal toast |
| `useCreateTask.ts` | Creates task via `create-clickup-task` Edge Function. Full optimistic update with rollback. | supabase, `@/hooks/use-toast`, `@/hooks/useClickUpTasks` → local, `@/contexts/AuthContext` → `@/shared/hooks/useAuth` |
| `useSupportTaskChat.ts` | Thin wrapper: reads `profile.support_task_id`, delegates to `useTaskComments`. Returns `isConfigured` flag. | `@/hooks/useAuth` → `@/shared/hooks/useAuth`; `@/hooks/useTaskComments` → local; `@/components/CommentInput` (FileData) → local types |
| `useNotifications.ts` | Reads `notifications` table, Realtime INSERT sub. Mark read / mark all read mutations. | supabase, `@/lib/logger` → local |
| `useUnreadCounts.ts` | Reads `read_receipts` + `comment_cache`. 3 Realtime subscriptions (support, comments, receipts). Optimistic mark-as-read. Fallback 30s polling. | supabase, `@/lib/logger` → local |
| `useSingleTask.ts` | Fetches single task via `fetch-single-task` Edge Function. Used for deep-link access (e.g., from email). | supabase, `@/hooks/useClickUpTasks` (ClickUpTask type) → local types, `@/lib/logger` → local |

### Lib

| File | Purpose | Action |
|------|---------|--------|
| `lib/logger.ts` | Structured logging utility with levels, sanitization, context. | REUSE as-is → `src/shared/lib/logger.ts` (shared across modules) |
| `lib/constants.ts` | `PRODUCTION_URL` + Zod password schema + `PASSWORD_RULES`. | PARTIAL reuse → strip `PRODUCTION_URL` (already in `.env`); keep `passwordSchema` only if needed (portal already has login flow) |

### Types

| File | Purpose | Action |
|------|---------|--------|
| `types/index.ts` | `TaskStatus`, `TaskPriority`, `Task`, `UserProfile`, `AuthState` | REUSE `TaskStatus`, `TaskPriority`, `Task` → `src/modules/tickets/types/tasks.ts`. Discard `UserProfile` and `AuthState` (use portal's `Profile` from `common.ts`). |

---

## Section 2: Files to DISCARD

These already exist in the portal. Do NOT copy.

| Lovable file | Portal equivalent |
|-------------|-------------------|
| `integrations/supabase/client.ts` | `src/shared/lib/supabase.ts` |
| `contexts/AuthContext.tsx` | `src/shared/hooks/useAuth.ts` |
| `hooks/useAuth.ts` (re-export of AuthContext) | `src/shared/hooks/useAuth.ts` |
| `hooks/use-toast.ts` | Needs portal-specific solution (see §5) |
| `hooks/use-mobile.tsx` | `src/shared/hooks/useBreakpoint.ts` |
| All `components/ui/*` (50+ shadcn components) | Portal uses lean Radix UI + CSS tokens |
| `App.tsx`, `main.tsx` | `src/App.tsx`, `src/main.tsx` |
| `pages/Auth.tsx`, `pages/CheckEmail.tsx`, etc. | `src/shared/pages/LoginPage.tsx` |
| `components/Header.tsx`, `components/Footer.tsx` | `src/shared/components/layout/AppShell.tsx` |
| `components/ProtectedRoute.tsx` | `src/app/ProtectedRoute.tsx` |
| `components/NavLink.tsx` | `src/shared/components/layout/Sidebar.tsx` |
| `data/mockData.ts` | Not needed (portal has live Supabase data) |
| `lib/utils.ts` (cn helper only) | `src/shared/lib/utils.ts` |

---

## Section 3: Files to REBUILD FROM SCRATCH

These components are Lovable-generated UI. They serve as **functional reference only** — understand what they do, rebuild how they look using `tokens.css` + portal patterns.

| Lovable component | Portal replacement | Rebuild reason |
|-------------------|--------------------|---------------|
| `TaskCard.tsx` | `components/TaskCard.tsx` | Tailwind v3 classes, shadcn Card dependency, no tokens |
| `TaskDetailSheet.tsx` | `components/TaskDetail.tsx` | Side-sheet pattern → full page; shadcn Sheet dependency |
| `StatusFilter.tsx` + `TaskFiltersDropdown.tsx` | `components/TaskFilters.tsx` | Two separate components merged; shadcn DropdownMenu dep |
| `CommentInput.tsx` | `components/CommentInput.tsx` | shadcn Textarea dep; `FileData` type must move to types |
| `CommentAttachments.tsx` | Inline in `CommentInput.tsx` | Too small for separate component |
| `SupportChatSheet.tsx` | `components/SupportChat.tsx` | Side-sheet → full page; shadcn dep |
| `NotificationBell.tsx` | `components/NotificationBell.tsx` | shadcn Popover dep; needs portal header integration |
| `CreateTaskDialog.tsx` | `components/NewTicketDialog.tsx` | Rename to match German UX ("Neue Anfrage"); remove priority field (clients shouldn't set priority) |
| `RecentMessages.tsx` | Not needed | Dashboard widget; portal has dedicated Support page |
| `TaskSearchInput.tsx` | Inline in `TicketsPage.tsx` | Too simple for separate component |
| `LinkifiedText.tsx` | Inline in `CommentInput.tsx` | Single-use utility |
| `FeedbackDialog.tsx` | Not needed | Portal has support chat instead |
| `ErrorBoundary.tsx` | Not needed (React 19 handles this differently) | — |

---

## Section 4: Shared Components — Cross-Module Analysis

### MessageBubble
- **Lovable:** `CommentInput.tsx` renders inline bubble-like comment items
- **Projects module:** `StepDetail.tsx` lines 279–324 has full message bubble rendering; `MessagesPage.tsx` lines 46–75 has 95% identical code
- **Decision: CREATE shared** — `src/shared/components/common/MessageBubble.tsx`
- **Interface:** `{ role: 'team' | 'client', content: string, senderName: string, timestamp: string, avatarUrl?: string }`
- Step 2.8 will also refactor existing projects module duplicates to use this component.

### StatusBadge
- **Lovable:** Status displayed as colored text + dot inline in `TaskCard.tsx`
- **Projects module:** `StepDetail.tsx` lines 103–114 has inline `StepStatusPill`; no shared badge exists
- **Decision: CREATE shared** — `src/shared/components/common/StatusBadge.tsx`
- **Interface:** `{ status: string, variant?: 'project' | 'ticket', size?: 'sm' | 'md' }`

### EmptyState
- **Lovable:** Various "No tasks found" inline messages
- **Projects module:** 4+ occurrences of plain inline text (`StepDetail.tsx` lines 253, 282; `OverviewTabs.tsx` lines 65, 98)
- **Decision: CREATE shared** — `src/shared/components/common/EmptyState.tsx`
- **Interface:** `{ message: string, icon?: React.ReactNode }`

### LoadingSkeleton
- **Lovable:** shadcn Skeleton component used inline
- **Projects module:** NONE — no loading states exist yet
- **Decision: CREATE shared** — `src/shared/components/common/LoadingSkeleton.tsx`
- **Interface:** `{ lines?: number, height?: string, className?: string }`

### ConfirmDialog
- **Lovable:** shadcn AlertDialog used in `CreateTaskDialog.tsx` for cancel confirmation
- **Projects module:** NONE — approval buttons in `StepDetail.tsx` are inline with no dialog
- **Decision: CREATE shared** — `src/shared/components/common/ConfirmDialog.tsx`
- Wraps Radix AlertDialog (already in portal dependencies)
- **Interface:** `{ open: boolean, title: string, message: string, confirmLabel: string, onConfirm: () => void, onCancel: () => void, destructive?: boolean }`

### FileAttachment / FileRow
- **Lovable:** `CommentAttachments.tsx` renders ClickUp attachment URLs with file type icons
- **Projects module:** `OverviewTabs.tsx` has file list for Nextcloud files (different shape: `{ name, type, size, uploadedAt }`)
- **Decision: SEPARATE** — ticket attachments have `{ url, title, type?, size? }` from ClickUp; project files have Nextcloud metadata. Too different to merge.

---

## Section 5: Conflicts & Risks

### 1. Toast notification system (MEDIUM RISK)
**Problem:** Lovable uses two patterns simultaneously:
- `useTaskComments.ts` and `useCreateTask.ts`: `import { toast } from '@/hooks/use-toast'` (functional call)
- `useTaskActions.ts`: `import { useToast } from '@/hooks/use-toast'` (hook pattern)

Portal currently has no toast system. **Resolution:** Add Sonner to the portal (`npm install sonner`), add `<Toaster />` to `App.tsx`, replace all `toast({title, description, variant})` calls with `sonner.toast()` / `sonner.toast.error()`. This requires touching toast calls in every ported hook.

### 2. `FileData` type coupling (LOW RISK)
**Problem:** `useTaskComments.ts` and `useSupportTaskChat.ts` import `FileData` from `@/components/CommentInput`. A UI component's type leaks into the data layer.
**Resolution:** Move `FileData` interface to `src/modules/tickets/types/tasks.ts` and import from there in both the hook and the component.

### 3. `ClickUpTask` type ownership (LOW RISK)
**Problem:** `ClickUpTask` interface is defined in `useClickUpTasks.ts` and imported by `useSingleTask.ts` and `useCreateTask.ts`. When we move the type to `types/tasks.ts`, these cross-imports must be updated.
**Resolution:** Move `ClickUpTask` and `CachedTask` interfaces to `types/tasks.ts` as part of Step 2.

### 4. `UserProfile` vs `Profile` naming collision (LOW RISK)
**Problem:** Tickets' `types/index.ts` exports `UserProfile` (camelCase fields, no `support_task_id`). Portal's `common.ts` has `Profile` (snake_case fields, has `support_task_id`).
**Resolution:** Discard `UserProfile` entirely. All hooks that use auth data reference the portal's `Profile` via `useAuth()`. The `Task` interface's `createdByUserId` and `createdByName` fields are already strings — no type conflict.

### 5. `useAuthContext` vs `useAuth` naming (LOW RISK)
**Problem:** Lovable hooks use `useAuthContext` (from `contexts/AuthContext`). Portal exports `useAuth`.
**Verification:** Both provide `{ user, profile, session, isLoading, isAuthenticated }`. Shapes are compatible.
**Resolution:** Replace `useAuthContext` with `useAuth` in all ported hooks. Single text replace per file.

### 6. Supabase Realtime channel naming (INFO)
**No risk**, but note: `useClickUpTasks` uses channel `task-cache-updates-${userId}`. If multiple tabs are open, channels are deduplicated by name — this is the correct pattern.

### 7. React 19 vs React 18 (NO RISK)
All 8 hooks use standard React 18 APIs only (`useState`, `useEffect`, `useCallback`, `useRef`). No React 19-specific code. Integration is clean.

### 8. Router version (NO RISK)
Zero hook files import from react-router-dom. Confirmed clean.

---

## Staging Data State

**To be verified in Step 1.5 before proceeding to Step 2.**

Required checks:
- `SELECT count(*) FROM task_cache` — must be > 0, or trigger `fetch-clickup-tasks`
- `SELECT id, full_name, support_task_id FROM profiles LIMIT 5` — `support_task_id` must not be NULL for `useSupportTaskChat` to work

---

## Summary Counts

| Category | Count |
|----------|-------|
| Hooks to REUSE | 8 |
| Lib files to REUSE | 1 (logger.ts → shared) |
| Types to REUSE | 3 interfaces (TaskStatus, TaskPriority, Task) |
| Files to DISCARD | 15+ |
| Components to REBUILD | 9 |
| Shared components to CREATE | 5 (MessageBubble, StatusBadge, EmptyState, LoadingSkeleton, ConfirmDialog) |
| Risks | 2 medium, 4 low, 2 none |
