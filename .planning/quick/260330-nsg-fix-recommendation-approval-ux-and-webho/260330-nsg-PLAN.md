---
phase: quick-260330-nsg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/modules/tickets/components/RecommendationApproval.tsx
  - src/modules/tickets/components/TaskDetail.tsx
  - supabase/functions/update-task-status/index.ts
  - supabase/functions/clickup-webhook/index.ts
autonomous: true
requirements: [BUG-1, BUG-2, BUG-3, BUG-4]

must_haves:
  truths:
    - "After accept/decline recommendation, the TaskDetailSheet closes automatically"
    - "Recommendation block disappears when task no longer has the recommendation tag"
    - "Date picker has a German label explaining its purpose"
    - "Accept recommendation posts an auto-comment to ClickUp and caches it"
    - "taskTagUpdated webhook event triggers recommendation notification + email"
  artifacts:
    - path: "src/modules/tickets/components/RecommendationApproval.tsx"
      provides: "onClose prop, date label, close-on-success"
    - path: "src/modules/tickets/components/TaskDetail.tsx"
      provides: "Passes onClose to RecommendationApproval"
    - path: "supabase/functions/update-task-status/index.ts"
      provides: "Auto-comment for accept_recommendation"
    - path: "supabase/functions/clickup-webhook/index.ts"
      provides: "taskTagUpdated event handler"
  key_links:
    - from: "TaskDetail.tsx"
      to: "RecommendationApproval.tsx"
      via: "onClose prop"
      pattern: "onClose={onClose}"
    - from: "update-task-status/index.ts"
      to: "ClickUp API + comment_cache"
      via: "POST comment + upsert cache"
      pattern: "accept_recommendation.*comment"
    - from: "clickup-webhook/index.ts"
      to: "notifications + sendMailjetEmail"
      via: "taskTagUpdated handler"
      pattern: "taskTagUpdated.*recommendation"
---

<objective>
Fix four bugs in the recommendation approval flow: (1) sheet not closing after accept/decline, (2) missing date picker label, (3) no auto-comment on accept, (4) webhook ignoring taskTagUpdated events.

Purpose: Complete the recommendation UX so it works end-to-end like the credit approval flow.
Output: 4 bug fixes across 4 files, frontend + 2 Edge Functions.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@src/modules/tickets/components/TaskDetail.tsx
@src/modules/tickets/components/RecommendationApproval.tsx
@src/modules/tickets/hooks/useTaskActions.ts
@src/modules/tickets/components/TaskDetailSheet.tsx
@supabase/functions/update-task-status/index.ts
@supabase/functions/clickup-webhook/index.ts

<interfaces>
<!-- TaskDetailSheet passes onClose to TaskDetail -->
From src/modules/tickets/components/TaskDetailSheet.tsx:
```typescript
// Line 65 — TaskDetail receives onClose
<TaskDetail task={task} onClose={onClose} onRead={() => markAsRead(`task:${task.clickup_id}`)} />
```

From src/modules/tickets/components/TaskDetail.tsx:
```typescript
interface Props {
  task: ClickUpTask;
  onClose?: () => void;
  onRead?: () => void;
}
// Line 48 — currently destructures: { task, onRead } — DOES NOT use onClose
export function TaskDetail({ task, onRead }: Props) {
```

From src/modules/tickets/hooks/useTaskActions.ts:
```typescript
interface UseTaskActionsOptions {
  onSuccess?: () => void;  // ← called after ANY successful mutation
  toastLabels?: Partial<Record<TaskAction, { success: string; error: string }>>;
}
```

From supabase/functions/update-task-status/index.ts:
```typescript
// Lines 402-495: approve_credits auto-comment pattern — use as template for accept_recommendation
// Key: fetch profile.full_name, resolve thread, POST comment, upsert comment_cache
```

From supabase/functions/clickup-webhook/index.ts:
```typescript
// Lines 1328-1406: existing taskUpdated + tag handler for recommendation
// This works for taskUpdated events with historyItem.field === "tag"
// But ClickUp sends taskTagUpdated as a SEPARATE event type — no historyItem
// The taskTagUpdated payload has: { event, task_id, webhook_id, tag_name }
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix frontend — onClose prop, date label, tag-based visibility</name>
  <files>
    src/modules/tickets/components/RecommendationApproval.tsx
    src/modules/tickets/components/TaskDetail.tsx
  </files>
  <action>
**RecommendationApproval.tsx:**

1. Add `onClose?: () => void` to the Props interface.

2. Pass `onSuccess: onClose` into `useTaskActions({ onSuccess: onClose })`. This leverages the existing `onSuccess` callback in the hook — when accept/decline mutation succeeds, the hook calls `options.onSuccess()` which closes the sheet. No manual `.then()` needed.

3. Add a label before the `<input type="date">` in the `mode === 'accepting'` block:
   ```tsx
   <p className="text-xs text-text-tertiary">Bis wann soll das erledigt werden?</p>
   ```
   Place it immediately before the date input, inside the same `space-y-2.5` container.

**TaskDetail.tsx:**

1. Destructure `onClose` in the component signature: `{ task, onClose, onRead }`.

2. Pass `onClose` to RecommendationApproval:
   ```tsx
   <RecommendationApproval taskId={task.clickup_id} credits={task.credits} onClose={onClose} />
   ```

Note: The recommendation block already disappears reactively — after accept, the Edge Function removes the `recommendation` tag and updates `task_cache`. TanStack Query invalidation (already in `useTaskActions.onSuccess`) refetches the task list, and `isRecommendation` re-evaluates to `false`. If the sheet closes immediately via `onClose`, the user won't even see the block disappear — the sheet closes first. No additional logic needed.
  </action>
  <verify>
    <automated>cd /g/01_OPUS/Projects/PORTAL && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>
    - RecommendationApproval accepts and uses onClose prop
    - TaskDetail passes onClose to RecommendationApproval
    - Date picker has "Bis wann soll das erledigt werden?" label above it
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Add auto-comment for accept_recommendation + handle taskTagUpdated webhook</name>
  <files>
    supabase/functions/update-task-status/index.ts
    supabase/functions/clickup-webhook/index.ts
  </files>
  <action>
**update-task-status/index.ts — Add auto-comment for accept_recommendation (Bug 3):**

After the existing `accept_recommendation` block (line ~400, after tag swap logic), add an auto-comment block modeled exactly on the `approve_credits` pattern (lines 402-495):

1. Create a `supabaseAdmin` client using service role key.
2. Fetch `profile.full_name` from profiles table using the authenticated `supabase` client.
3. Compute `fullName` and `firstName` (same pattern as approve_credits).
4. Format the due date as DD.MM.YYYY:
   ```typescript
   const dueDateFormatted = new Date(dueDate).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
   ```
5. Build comment texts:
   - `clickupAutoComment`: `"${fullName} (via Client Portal):\n\nEmpfehlung angenommen. Erledigen bis: ${dueDateFormatted}"`
   - `displayText`: `"Empfehlung angenommen. Erledigen bis: ${dueDateFormatted}"`
6. Resolve active public thread via `resolveActivePublicThread(taskId, clickupApiToken, log)`.
7. POST comment to ClickUp (thread reply or top-level, same logic as approve_credits).
8. On success, upsert into `comment_cache` with identical shape to approve_credits block:
   ```typescript
   {
     clickup_comment_id: autoCommentData.id,
     task_id: taskId,
     profile_id: userId,
     comment_text: clickupAutoComment,
     display_text: displayText,
     author_id: 0,
     author_name: firstName,
     author_email: userEmail,
     author_avatar: null,
     clickup_created_at: new Date().toISOString(),
     last_synced: new Date().toISOString(),
     is_from_portal: true,
   }
   ```
   Use `onConflict: "clickup_comment_id,profile_id"`.

Place this NEW block right after the existing accept_recommendation tag-swap block (after the "Added ticket tag" log line, before the `approve_credits` block).

**clickup-webhook/index.ts — Handle taskTagUpdated event (Bug 4):**

Add a new event handler block BEFORE the final "Ignoring event type" fallback (before line 1800). The handler:

1. Check: `if (payload.event === "taskTagUpdated" && taskId && isValidTaskId(taskId))`

2. The `taskTagUpdated` payload structure differs from `taskUpdated` — it has NO `history_items`. Instead it has `tag_name` directly on the payload. However, the ClickUpWebhookPayload interface does not currently include `tag_name`. Access it via: `(payload as any).tag_name as string | undefined`.

3. Extract `tagName` from payload. If not `"recommendation"`, return 200 with "tag event ignored".

4. To determine add vs remove: fetch the task from ClickUp API, check if `recommendation` tag is currently present in the task's tags array. If the tag IS present, it was added. If NOT present, it was removed — skip notification.

5. If tag was added AND task is visible (`fetchTaskForVisibilityCheck`):
   - Resolve profile IDs via `findProfilesForTask(supabase, taskId, taskInfo.listId, log)`
   - Insert bell notifications (type: `"new_recommendation"`, title: `"Neue Empfehlung"`, message: same pattern as existing lines 1359-1366)
   - Send email to each profile where `shouldSendEmail(p, "new_recommendation")` is true (same pattern as existing lines 1375-1389)
   - Return 200 with `{ success: true, type: "recommendation_tag_handled" }`

6. If tag was removed or task not visible, return 200 with appropriate skip message.

This is essentially a copy of the existing recommendation logic from lines 1334-1397, but triggered by the `taskTagUpdated` event type instead of `taskUpdated` with `historyItem.field === "tag"`. Keep the existing `taskUpdated` handler too — belt and suspenders, both paths are idempotent via notification dedup.

Note: Add `tag_name?: string;` to the `ClickUpWebhookPayload` interface (around line 116) so the type is properly declared instead of using `as any`.
  </action>
  <verify>
    <automated>cd /g/01_OPUS/Projects/PORTAL && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>
    - accept_recommendation posts auto-comment to ClickUp with formatted date
    - Auto-comment is cached in comment_cache for instant UI display
    - taskTagUpdated event is handled (not ignored) in clickup-webhook
    - Recommendation tag addition triggers bell notification + email
    - Tag removal is detected (via API check) and skipped gracefully
    - Both Edge Functions have no TypeScript errors
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes for frontend changes
2. Manual test: open a recommendation task in TaskDetailSheet, click "Annehmen", set date, confirm — sheet should close
3. Manual test: after accept, check ClickUp task comments — auto-comment with formatted date should appear
4. Manual test: add `recommendation` tag to a task in ClickUp — client should receive bell notification and email
</verification>

<success_criteria>
- Sheet closes after successful accept or decline of recommendation
- Date picker has descriptive German label
- Auto-comment appears in ClickUp and comment_cache after accepting recommendation
- taskTagUpdated webhook events trigger notification pipeline for recommendation tags
- All TypeScript compiles clean
</success_criteria>

<output>
After completion, create `.planning/quick/260330-nsg-fix-recommendation-approval-ux-and-webho/260330-nsg-SUMMARY.md`
</output>
