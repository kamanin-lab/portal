# Codebase Concerns

**Analysis Date:** 2026-03-26

## Tech Debt

### Large File Complexity — useNextcloudFiles Hook

**Files:** `src/modules/projects/hooks/useNextcloudFiles.ts` (302 lines)

**Issue:** Hook combines file listing, uploading, folder creation, and chunked uploads in a single 302-line module. Multiple fetch functions handle similar response shapes (ListResponse, UploadResponse) with duplicated error handling logic. File type detection and size formatting are embedded. This creates tight coupling between fetch logic and mutation handlers.

**Impact:**
- Difficult to test individual file operations in isolation
- Changes to response handling require touching multiple locations
- Error recovery patterns are not reusable
- Component consuming this hook receives a large interface with many derived values

**Fix approach:**
- Extract response normalization into dedicated utility functions: `normalizeListResponse()`, `normalizeUploadResponse()`
- Extract file type detection into `src/modules/projects/lib/file-type-detection.ts`
- Extract size formatting into shared `src/shared/lib/format.ts`
- Split into focused hooks: `useFileList()`, `useFileUpload()`, `useFolderCreation()`
- Create `src/modules/projects/lib/nextcloud-errors.ts` for centralized error mapping

### Memory Store Test Adapter Pattern

**Files:** `src/modules/projects/lib/memory-store.ts` (296 lines, lines 35-296)

**Issue:** Global `memoryTestAdapter` variable is used for test injection instead of dependency injection. The test adapter allows bypassing Supabase entirely, creating two execution paths: one for tests, one for production. Adapter is installed/uninstalled manually in tests with no cleanup guarantee.

**Impact:**
- Tests run against different code paths than production
- Adapter leaks between test suites if `uninstallMemoryTestAdapter()` fails or is forgotten
- Hard to verify actual Supabase integration is working
- Mixing test concerns with production code

**Fix approach:**
- Remove global adapter, pass testAdapter as optional parameter to exported functions
- Create factory function: `createMemoryStore(supabaseClient?, testAdapter?)` returning an object with methods
- Update all callers to use the factory
- Run integration tests against actual Supabase instance (self-hosted test DB)
- Keep unit tests with adapter if needed, but export both adapters and real implementation

### Large Type File — ProjectTaskCacheRow

**Files:** `src/modules/projects/types/project.ts` (212 lines)

**Issue:** Single file contains database row types, UI types, and transformation target types. ProjectTaskCacheRow (94-110+) is incomplete in visible portion. This mixing causes confusion about which types represent database state vs. UI state vs. API responses.

**Impact:**
- Difficult to trace where data comes from and where it goes
- Changes to cache schema may accidentally break UI type contracts
- No clear source-of-truth for what fields are available at each layer

**Fix approach:**
- Split into three files:
  - `src/modules/projects/types/database.ts` — ProjectConfigRow, ChapterConfigRow, ProjectTaskCacheRow, StepEnrichmentRow
  - `src/modules/projects/types/ui.ts` — Project, Chapter, Step, Update, FileItem, Message, ProjectTask
  - Keep `src/modules/projects/types/project.ts` as barrel export
- Update imports in all consuming files

### No Transaction/Atomicity in Task Status Updates

**Files:** `supabase/functions/update-task-status/index.ts`

**Issue:** Updates task_cache status field without transactional guarantee. If ClickUp API succeeds but Supabase update fails, cache becomes stale. If the function retries, ClickUp may reject (409 conflict) while cache is inconsistent.

**Impact:**
- Cache can diverge from ClickUp source-of-truth
- Users see outdated status after UI update while background sync corrects it (jarring)
- No audit trail of partial failures

**Fix approach:**
- Wrap Supabase update in transaction (upsert + SELECT returning)
- If Supabase fails, return 500 without retrying ClickUp call
- Add `sync_error` field to task_cache to mark stale entries
- Implement manual cache correction Edge Function

---

## Known Bugs

### comment_cache Realtime "mismatch" Errors

**Symptom:** Realtime subscriptions on `comment_cache` periodically fail with "mismatch" error, poisoning the entire WebSocket connection. task_cache Realtime then stops receiving updates until page reload.

**Files:**
- `src/modules/tickets/hooks/useTaskComments.ts` (line 141-142 comment documents the issue)
- `src/modules/tickets/hooks/useUnreadCounts.ts` (line 110-111 documents the issue)

**Trigger:** Unknown—appears to be a self-hosted Supabase bug with REPLICA IDENTITY FULL on comment_cache. Occurs intermittently after syncing multiple comments.

**Workaround:** Both hooks use 10s polling instead of Realtime. `useTaskComments.ts` polls every 10s, `useUnreadCounts.ts` polls every 15s. This is effective but introduces network overhead and stale data windows.

**Permanent fix:** Either (a) upgrade self-hosted Supabase to latest version with bug fix, (b) enable Realtime on production Supabase (cloud-hosted) and use that for subscriptions, or (c) implement server-sent events (SSE) fallback from Edge Function instead of relying on Realtime.

### Task Name Overflow in TaskCard

**Symptom:** Long task names (>60 chars) without spaces can overflow card width on mobile. No text truncation.

**Files:** `src/modules/tickets/components/TaskCard.tsx`

**Current state:** Component renders task.name directly without `line-clamp` class or `overflow-hidden`.

**Fix approach:** Add `line-clamp-2` and `overflow-hidden` to task name container. Test with actual ClickUp data (names can be 200+ chars).

---

## Security Considerations

### Session Storage via localStorage

**Files:** `src/shared/lib/supabase.ts` (line 17)

**Risk:** Supabase Auth session tokens are stored in localStorage. Tokens remain valid for token lifetime even if user navigates away. localStorage is vulnerable to XSS attacks if any third-party script is loaded.

**Current mitigation:**
- No inline event handlers in React components (CSP friendly)
- No third-party analytics scripts loaded
- TypeScript strict mode prevents implicit `any` assignments

**Recommendations:**
- Consider moving to sessionStorage for shorter token lifetime (clears on browser close)
- Implement Content-Security-Policy headers on vercel.json to restrict script sources
- Add HttpOnly cookie storage if Supabase supports it (requires backend middleware)
- Audit all npm dependencies for XSS vulnerabilities (`npm audit`)

### API Token Exposure Prevention

**Files:** `supabase/functions/_shared/clickup-contract.ts`, Edge Function routing

**Current state:** ClickUp API token is never sent to client—all API calls proxied through Edge Functions. No token in `.env` files committed to git.

**Assessment:** SECURE — architecture correctly isolates secrets server-side.

### RLS Enforcement

**Files:** Database schema, all read operations

**Current state:** All Supabase queries use RLS-enforced tables (profile_id filtering). No direct access to raw ClickUp data or shared tables.

**Assessment:** SECURE — but verify RLS policies are enabled in production Supabase instance.

---

## Performance Bottlenecks

### Full Task List in Memory

**Problem:** `useClickUpTasks()` fetches and caches ALL tasks matching user's ClickUp lists in browser memory. No pagination or virtual scrolling.

**Files:** `src/modules/tickets/hooks/useClickUpTasks.ts` (line 182-197)

**Current capacity:** Tested with ~200 tasks. Performance degrades with >500 tasks (React rendering, array operations).

**Cause:** React Query caches entire array. TaskList filters array client-side. No server-side filtering by status/date.

**Improvement path:**
1. Short term: Add virtual scrolling to TaskList (react-window or TanStack Virtual)
2. Medium term: Implement server-side filtering in Edge Function (fetch only tasks matching current filter)
3. Long term: Cursor-based pagination with lazy loading on scroll

### Realtime Polling Fallback Causes Extra Network Requests

**Problem:** Both task_cache and comment_cache fallback to polling (30s and 10s respectively) because Realtime is unreliable on self-hosted Supabase. Users with >10 tasks see constant re-fetches.

**Files:**
- `src/modules/tickets/hooks/useClickUpTasks.ts` (line 174-180 polling)
- `src/modules/tickets/hooks/useTaskComments.ts` (line 143-147 polling)

**Current impact:** Minor (30-60 requests/hour per user), but scales poorly with user count.

**Improvement path:**
- Upgrade self-hosted Supabase to latest version (may fix Realtime bug)
- Implement Edge Function SSE endpoint for comment updates instead of polling
- Use Supabase Cloud (managed) for Realtime instead of self-hosted

### File Chunking Without Progress Feedback

**Problem:** `useNextcloudFiles()` uploads files in chunks but doesn't expose progress to UI. Users uploading 50MB+ files see no feedback.

**Files:** `src/modules/projects/components/files/FileUpload.tsx`

**Current behavior:** Shows "Uploading..." state but no percentage or chunk count.

**Improvement path:**
1. Add progress callback to upload mutation: `onProgress: (uploaded: number, total: number) => void`
2. Expose chunk count in hook return: `uploadProgress: { current: number; total: number }`
3. Display percentage bar in upload UI

---

## Fragile Areas

### Memory Entry Validation Has No Rollback

**Component:** Project memory CRUD operations

**Files:** `src/modules/projects/lib/memory-store.ts` (line 205-227)

**Why fragile:** When `upsertMemoryEntry()` calls validation, if validation fails mid-operation after Supabase update succeeds, entry is left in inconsistent state. No rollback mechanism.

**Current behavior:** Throws error, caller must handle retry. Entry may be partially saved.

**Test coverage gaps:** No tests for validation failure scenarios.

**Safe modification:**
- Validate BEFORE invoking Supabase function
- Pass validated draft only, let Edge Function perform final validation
- Return validation errors explicitly

### Task Status Mapping Requires mapStatus() Calls

**Component:** Task filtering and display

**Files:** Scattered across `src/modules/tickets/` components

**Why fragile:** Architecture rule #8 requires converting task.status via `mapStatus()` before comparisons. Missing a single call causes silent bugs (filters fail, displays wrong label).

**Test coverage gaps:** No linting rule to enforce `mapStatus()` usage. Manual code review required.

**Safe modification:**
- Create type-safe wrapper: `type MappedStatus = ReturnType<typeof mapStatus>`
- Use discriminated union for status comparisons instead of string literals
- Add ESLint rule to forbid direct string comparison with status fields

### Project Overview Interpretation Has Complex Logic

**Component:** `DynamicHero`, `OverviewPage` hero state

**Files:** `src/modules/projects/lib/overview-interpretation.ts` (231 lines)

**Why fragile:** Interprets project step states and chapter progress by examining status, date, and custom fields. Multiple edge cases (upcoming_locked but no target date, completed status but unfinished steps, null portalCta). Logic not documented.

**Test coverage:** 205-line test file (`overview-interpretation.test.ts`) but edge cases are gaps.

**Safe modification:**
- Add inline documentation for each decision branch
- Create `isValidProjectState()` validator that checks preconditions
- Add schema validation test on load: assert projects always have valid states before rendering

---

## Scaling Limits

### Self-Hosted Supabase Realtime Instability

**Current capacity:** Stable with <10 concurrent Realtime connections. Degrades >20 concurrent users.

**Limit:** Unknown—self-hosted instance hasn't been load-tested.

**Scaling path:**
1. Benchmark current Coolify instance: concurrent connections, message throughput, memory
2. Option A: Upgrade Coolify server (more CPU/RAM) → Re-test
3. Option B: Switch to Supabase Cloud (managed) → Realtime becomes reliable
4. Option C: Implement custom WebSocket server on Coolify → Full control, more complexity

### Database Query Performance on Large task_cache Tables

**Current state:** task_cache has no indexes beyond primary key and (clickup_id, profile_id) unique constraint.

**Potential indexes missing:**
- `profile_id, is_visible, last_activity_at` — for listing visible tasks sorted by date
- `task_id` — for comment_cache join
- `created_at` — for time-range filtering

**Impact:** Queries with `order by last_activity_at` and filters may slow down as table grows (>50k tasks).

**Scaling path:**
- Profile slow queries in production: `SELECT pg_stat_statements`
- Add indexes for common filter combinations
- Implement query caching in Edge Functions if needed

---

## Dependencies at Risk

### Motion Library v12 Is New (Motion Adoption)

**Package:** `motion@12.x` (successor to Framer Motion)

**Risk:** Library is <6 months old. Third-party component libraries may not support Motion yet. Breaking changes possible.

**Impact:** If breaking changes occur, must update all animation code and possibly components using motion.

**Current usage:** GPU-accelerated animations, layout transitions, scroll effects throughout portal.

**Migration plan:**
- Maintain Framer Motion compatibility by isolating motion imports to `src/shared/components/motion/` wrappers
- Create adapter layer: `createMotionComponent()` that can switch between motion and framer-motion
- Pin motion to current minor version, test major upgrades in staging first

### shadcn/ui Selective Installation Pattern

**Package:** shadcn/ui (60+ components available, ~20 installed)

**Risk:** Installed components are copy-pasted into `src/shared/components/ui/`. Future shadcn/ui updates won't auto-apply. Manual updates required if upstream components change.

**Impact:** Security fixes or bug fixes in shadcn components must be manually merged. Components may diverge from shadcn versions.

**Current state:** Components frozen at installation date. No easy way to update.

**Mitigation plan:**
- Document shadcn version used at installation: add comment in each `ui/*.tsx` file
- Create script: `scripts/update-shadcn-component.ts` that shows diffs before merging
- Set reminder to audit shadcn releases quarterly

---

## Missing Critical Features

### No Error Recovery for Webhook Processing

**Problem:** If clickup-webhook Edge Function crashes, ClickUp continues sending webhooks but they're lost. No dead letter queue or retry mechanism.

**Files:** `supabase/functions/clickup-webhook/index.ts`

**Blocks:** Task status updates may be missed silently. Users don't know cache is stale.

**Fix:**
- Return 202 Accepted immediately, queue webhook for async processing
- Implement retry with exponential backoff (3 attempts over 5 minutes)
- Log failed webhooks to `webhook_failures` table for manual review

### No Soft Delete for Project Memory

**Problem:** Archiving memory entries sets `status: 'archived'` but soft-deletes don't exist. Entries remain in database, visible in queries unless explicitly filtered.

**Files:** `src/modules/projects/lib/memory-store.ts`, database schema

**Blocks:** Audit trail is incomplete. Cannot distinguish between "entry never created" and "entry created then deleted".

**Fix:**
- Add `deleted_at` field (nullable timestamptz) to project_memory_entries table
- Update RLS policy: filter WHERE `deleted_at IS NULL` by default
- Add helper function: `unarchiveMemoryEntry()` for recovery

### No Bulk Task Status Update

**Problem:** Users cannot update multiple task statuses at once. Must open each task individually.

**Files:** Task UI components, no bulk operation support

**Blocks:** Admin users waste time updating >5 tasks to same status.

**Fix:**
- Add checkbox selection mode to TaskList
- Create bulk update mutation in useTaskActions
- Add Edge Function for batch status updates with transaction

---

## Test Coverage Gaps

### No Component Integration Tests

**What's not tested:** Real data flow through component chains. Example: does TaskDetailSheet correctly trigger comment refetch when task status changes in background?

**Files:** `src/modules/tickets/__tests__/` (4 test files, all unit tests)

**Risk:** Refactoring or adding new data flow paths may break component integration without test visibility.

**Priority:** HIGH — would catch "Realtime not updating UI" type bugs early.

**Approach:**
- Add `vitest + @testing-library/react` integration tests
- Create mock Supabase client that simulates Realtime events
- Test: TaskDetailSheet opens → comment posted → UI updates without page refresh

### No Edge Function Tests

**What's not tested:** Edge Function error handling, timeout behavior, payload validation.

**Files:** `supabase/functions/*/index.ts` (16 functions, no test files)

**Risk:** Broken Edge Functions discovered in production (no staging environment for Edge Functions).

**Priority:** HIGH — Edge Functions are production-critical.

**Approach:**
- Add Edge Function test setup (Deno test runner or Jest with Deno preset)
- Mock Supabase client and ClickUp API
- Test: fetch-clickup-tasks with empty lists, rate limit, ClickUp 500 error

### No Performance Tests

**What's not tested:** Component render performance with realistic data (200+ tasks). Memory leaks in subscription cleanup.

**Files:** No vitest performance benchmarks

**Risk:** Performance degradation introduced silently. Only discovered when users complain.

**Priority:** MEDIUM — would prevent scaling issues.

**Approach:**
- Add vitest benchmarks for useClickUpTasks with varying task counts
- Add memory leak detector in useEffect cleanup tests
- Set performance budgets in CI (e.g., TaskList render time < 100ms for 200 tasks)

### No Accessibility Tests

**What's not tested:** Screen reader compatibility, keyboard navigation, color contrast.

**Files:** No accessibility test setup (axe, jest-axe)

**Risk:** Portal unusable for accessibility users. May violate WCAG 2.1 Level AA standards.

**Priority:** MEDIUM — would catch common a11y bugs early.

**Approach:**
- Add jest-axe to vitest config
- Add accessibility test file: `src/__tests__/accessibility.test.ts`
- Test: all interactive elements keyboard-navigable, color contrast >4.5:1

---

*Concerns audit: 2026-03-26*
