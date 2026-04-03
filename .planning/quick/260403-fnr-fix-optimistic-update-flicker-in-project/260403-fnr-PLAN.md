---
phase: quick
plan: 260403-fnr
type: execute
wave: 1
depends_on: []
files_modified:
  - src/modules/projects/components/steps/StepActionBar.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "After Freigeben/Aenderungen anfragen, the hero CTA card updates immediately and does NOT flicker back to the old status"
    - "After Freigeben with a comment, the comment appears in StepDetail message history within seconds (not 10s polling delay)"
  artifacts:
    - path: "src/modules/projects/components/steps/StepActionBar.tsx"
      provides: "Fixed onSuccess callback with cancelQueries + comments invalidation"
      contains: "cancelQueries"
  key_links:
    - from: "StepActionBar.tsx onSuccess"
      to: "['project', projectId] query"
      via: "cancelQueries before setQueryData prevents in-flight refetch overwrite"
    - from: "StepActionBar.tsx onSuccess"
      to: "['task-comments', taskId] query"
      via: "invalidateQueries triggers immediate comment refetch from comment_cache"
---

<objective>
Fix optimistic update flicker in the projects module after Freigeben/Aenderungen anfragen actions.

Purpose: After a client approves or requests changes on a step, the hero CTA card flickers back to the old status for 15-20 seconds because `invalidateQueries` refetches from `project_task_cache` which hasn't been updated yet (only updated via webhook). Additionally, posted comments don't appear immediately because the wrong query key is invalidated.

Output: StepActionBar.tsx with corrected onSuccess — optimistic state persists until realtime webhook sync, and comments appear immediately.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/260403-fnr-fix-optimistic-update-flicker-in-project/260403-fnr-RESEARCH.md
@src/modules/projects/components/steps/StepActionBar.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix onSuccess callback in StepActionBar</name>
  <files>src/modules/projects/components/steps/StepActionBar.tsx</files>
  <action>
In `StepActionBar.tsx`, modify the `onSuccess` callback passed to `useTaskActions` (line 20):

1. Make the callback `async`: change `onSuccess: () => {` to `onSuccess: async () => {`

2. ADD `await queryClient.cancelQueries({ queryKey: ['project', projectId] })` BEFORE the `queryClient.setQueryData` call (before line 25). This cancels any in-flight refetch that could overwrite the optimistic state.

3. REPLACE `queryClient.invalidateQueries({ queryKey: ['project', projectId] })` (line 55) with `queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] })`. This stops the premature project refetch (which returns stale data from `project_task_cache`) and instead triggers an immediate refetch of comments from `comment_cache` (which already has the new comment written by the Edge Function).

The realtime subscription in `useProject.ts` handles eventual sync when the webhook fires — no manual project invalidation needed.

Note on async typing: `async () => void` is assignable to `() => void` in TypeScript (Promise is assignable to void). No type changes needed in `useTaskActions`.
  </action>
  <verify>
    <automated>cd /g/01_OPUS/Projects/PORTAL && npm run build 2>&1 | tail -5</automated>
  </verify>
  <done>
- `onSuccess` is async
- `cancelQueries` called and awaited before `setQueryData`
- `invalidateQueries` targets `['task-comments', taskId]` instead of `['project', projectId]`
- Build succeeds with no errors
  </done>
</task>

</tasks>

<verification>
- `npm run build` passes without errors
- Manual test: Navigate to a project step in CLIENT REVIEW status, click Freigeben, confirm the hero card updates to "approved" state and does NOT flicker back
</verification>

<success_criteria>
- StepActionBar optimistic update persists until webhook-driven realtime sync (no flicker)
- Comments posted during approve/request_changes appear immediately in the message history
- Production build succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/260403-fnr-fix-optimistic-update-flicker-in-project/260403-fnr-SUMMARY.md`
</output>
