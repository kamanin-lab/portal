---
phase: quick
plan: 260403-euc
type: execute
wave: 1
depends_on: []
files_modified:
  - src/modules/projects/components/steps/StepActionBar.tsx
  - src/modules/projects/hooks/useProject.ts
  - src/modules/projects/components/overview/DynamicHero.tsx
autonomous: true
requirements: [BUG-realtime-after-freigeben, BUG-open-task-button]

must_haves:
  truths:
    - "After Freigeben or Änderungen anfordern, the CTA card immediately updates to show the next task or changes hero state"
    - "The sheet closes after Freigeben/Änderungen and the hero no longer shows the just-approved task"
    - "Non-CLIENT REVIEW tasks shown in DynamicHero (priority 2/3) have an Öffnen button to open the step detail"
    - "Realtime subscription on project_task_cache still fires and refreshes project data when webhook arrives"
  artifacts:
    - path: "src/modules/projects/components/steps/StepActionBar.tsx"
      provides: "Optimistic cache update for project query after approve/request_changes"
    - path: "src/modules/projects/hooks/useProject.ts"
      provides: "Realtime subscription + optimistic update support"
    - path: "src/modules/projects/components/overview/DynamicHero.tsx"
      provides: "Öffnen button for non-CLIENT REVIEW hero states"
  key_links:
    - from: "src/modules/projects/components/steps/StepActionBar.tsx"
      to: "['project', projectId] query cache"
      via: "queryClient.setQueryData optimistic patch"
      pattern: "queryClient\\.setQueryData.*project"
    - from: "src/modules/projects/hooks/useProject.ts"
      to: "project_task_cache realtime"
      via: "supabase.channel postgres_changes"
      pattern: "project_task_cache"
---

<objective>
Fix two bugs in the projects module:

1. **Realtime not updating after Freigeben/Änderungen anfordern** — After a user approves or requests changes on a CLIENT REVIEW task, the CTA card (DynamicHero) still shows the same task because there's no optimistic update. The webhook-triggered DB update arrives ~1-3 seconds later, but by then the user sees stale UI. Add optimistic cache patching to immediately reflect the status change in the project query data.

2. **Add Öffnen button for non-CLIENT REVIEW hero states** — When DynamicHero shows an upcoming step (priority 3) or "needs attention" state (priority 2), there's no button to open the step detail. Add an "Öffnen" action.

Purpose: Make the project review flow feel instant and provide navigation to step details from all hero states.
Output: Fixed StepActionBar with optimistic update, DynamicHero with Öffnen button for all actionable states.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@src/modules/projects/hooks/useProject.ts
@src/modules/projects/components/steps/StepActionBar.tsx
@src/modules/projects/components/overview/DynamicHero.tsx
@src/modules/projects/components/overview/OverviewPage.tsx
@src/modules/projects/lib/transforms-project.ts
@src/modules/projects/lib/overview-interpretation.ts
@src/modules/projects/types/project.ts
@src/modules/tickets/hooks/useTaskActions.ts (reference for optimistic update pattern)

<interfaces>
<!-- Key types and contracts the executor needs -->

From src/modules/projects/types/project.ts (relevant subset):
- `Step.status: StepStatus` — values: 'awaiting_input' | 'committed' | 'upcoming_locked'
- `Step.isClientReview: boolean` — derived from `rawStatus.toLowerCase() === 'client review'`
- `Step.rawStatus: string` — raw ClickUp status string
- `Project` — contains `chapters: Chapter[]`, each with `steps: Step[]`

From src/modules/projects/lib/transforms-project.ts:
- `transformToProject(...)` returns `Project` — line 143: `isClientReview: rawStatus.toLowerCase() === 'client review'`
- Line 125: `stepStatus = mapStepStatus(rawStatus)` where 'client review' → 'awaiting_input', 'approved'/'complete' → 'committed'

From src/modules/projects/lib/overview-interpretation.ts:
- `resolveAttentionItems()` filters on `step.isClientReview` (line 64) to build attention list
- `primaryAttention` = first attention item (sorted by milestoneOrder, then chapter order)
- DynamicHero uses `primaryAttention` for priority 1 hero content

From src/modules/projects/hooks/useProject.ts:
- Query key: `['project', projectId]`
- Query returns `Project | null`
- Realtime subscription on `project_task_cache` filtered by `project_config_id`

From src/modules/tickets/hooks/useTaskActions.ts:
- `onSuccess` calls `options?.onSuccess?.()` — StepActionBar uses this to invalidate project query
- `useTaskActions` does NOT optimistically update `['project', *]` cache — only `['clickup-tasks']`
- The Edge Function `update-task-status` returns `{ success, newStatus, message }`
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add optimistic project cache update to StepActionBar after Freigeben/Änderungen</name>
  <files>src/modules/projects/components/steps/StepActionBar.tsx</files>
  <action>
The root cause: when user clicks "Freigeben", `useTaskActions.approveTask()` calls the `update-task-status` Edge Function which updates ClickUp via API. The ClickUp webhook then fires back asynchronously (1-3s delay) and updates `project_task_cache`. But `StepActionBar.onSuccess` immediately invalidates `['project', projectId]` — which refetches from `project_task_cache` that hasn't been updated yet. Result: stale data, CTA card shows same task.

**Fix:** In the `onSuccess` callback of `useTaskActions`, BEFORE invalidating the project query, apply an optimistic patch to the `['project', projectId]` cache data using `queryClient.setQueryData`. The patch should:

1. For `approve` action: Find the step with matching `clickupTaskId === taskId` and update its `rawStatus` to `'approved'`, `status` to `'committed'`, and `isClientReview` to `false`.
2. For `request_changes` action: Find the step with matching `clickupTaskId === taskId` and update its `rawStatus` to `'in progress'`, `status` to `'upcoming_locked'`, and `isClientReview` to `false`.

Implementation approach:
```typescript
const { approveTask, requestChanges, isLoading } = useTaskActions({
  onSuccess: () => {
    // Optimistic patch: update step status in project cache immediately
    // This prevents the stale CTA card while waiting for webhook → DB update
    queryClient.setQueryData(['project', projectId], (old: Project | null | undefined) => {
      if (!old) return old;
      return {
        ...old,
        chapters: old.chapters.map(ch => ({
          ...ch,
          steps: ch.steps.map(step => {
            if (step.clickupTaskId !== taskId) return step;
            // Determine new status based on which action was taken
            const isApprove = activeAction === 'approve';
            return {
              ...step,
              rawStatus: isApprove ? 'approved' : 'in progress',
              status: isApprove ? 'committed' as const : 'upcoming_locked' as const,
              isClientReview: false,
            };
          }),
        })),
        // Recalculate tasksSummary
        tasksSummary: {
          ...old.tasksSummary,
          needsAttention: old.chapters.reduce((count, ch) =>
            count + ch.steps.filter(s =>
              s.clickupTaskId === taskId ? false : s.status === 'awaiting_input'
            ).length, 0),
        },
      };
    });

    // Still invalidate to get the "real" data once webhook updates DB
    queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    setActiveAction(null);
    setCommentText('');
    onSuccess?.();
  },
  // ... existing toastLabels
});
```

Import `Project` type at the top: `import type { Project } from '../../types/project';`

The key insight is capturing `activeAction` in the closure — since `activeAction` is state that gets reset in the same callback, read it before resetting. Move the optimistic patch BEFORE `setActiveAction(null)`.

Do NOT modify `useTaskActions.ts` — the optimistic patch belongs in StepActionBar because it knows the projectId and the Project query structure. The tickets module uses a different optimistic pattern for `['clickup-tasks']` which is unrelated.
  </action>
  <verify>
    <automated>cd G:/01_OPUS/Projects/PORTAL && npm run build 2>&1 | tail -5</automated>
  </verify>
  <done>After clicking Freigeben or Änderungen anfragen in the step sheet, the DynamicHero immediately updates — the approved/changed task disappears from the CTA card and the next CLIENT REVIEW task (or a different hero state) appears without waiting for the webhook roundtrip. The invalidateQueries call still fires to sync with real DB data once the webhook arrives.</done>
</task>

<task type="auto">
  <name>Task 2: Add Öffnen button to DynamicHero for non-CLIENT REVIEW states</name>
  <files>src/modules/projects/components/overview/DynamicHero.tsx</files>
  <action>
Currently DynamicHero shows:
- Priority 1 (CLIENT REVIEW): "Öffnen & prüfen →" button → `onOpenStep(primaryAttention.stepId)` — this works correctly
- Priority 2 (needsAttention > 0): "Aufgabe erstellen" button → `onCreateTask()` — no way to open existing tasks
- Priority 3 (upcoming step): No CTA at all — no way to see step details
- Priority 4 (all done): No CTA needed

**Changes:**

For priority 3 (upcoming step, line 72-84): Add a `ghostCta` button to open the step detail sheet:
```typescript
ghostCta: {
  label: 'Aufgabe öffnen',
  onClick: () => onOpenStep ? onOpenStep(upcomingStep.step.id) : undefined,
},
```
Note: `upcomingStep.step` is a `StepWithChapter` — the step's `id` is the `clickup_id` which is what `openStep()` in OverviewPage expects (it sets `?stepId=xxx` which StepSheet uses to find the step via `getStepById`).

Wait — check the Step type. In `transforms-project.ts` line 137: `id: task.clickup_id`. And `getStepById` searches by step.id. So step.id IS the clickup_id. But `upcomingStep` from `getNextUpcomingStep()` returns `StepWithChapter` which has `.step.id`. This is correct.

Actually, let me re-check: `overview.nextMeaningfulStep?.step.status === 'upcoming_locked'` on line 35. The `nextMeaningfulStep` is of type `StepWithChapter | null`. So `upcomingStep.step.id` is the step id (= clickup_id).

But wait — `onOpenStep` calls `openStep(stepId)` in OverviewPage which sets `?stepId=xxx`. Then `StepSheet` gets `activeStepId = searchParams.get('stepId')` and passes to `StepDetail` which calls `getStepById(stepId, project)`. So yes, step.id is the correct value.

For the `upcomingStep` path, set:
```typescript
ghostCta: {
  label: 'Aufgabe öffnen',
  onClick: () => onOpenStep?.(upcomingStep.step.id),
},
```

This adds a subtle "Aufgabe öffnen" ghost button to the priority 3 hero card so users can view step details even when the task is not yet in CLIENT REVIEW.

Do NOT add a CTA to priority 4 (all done) — there's nothing to open.
Do NOT change priority 1 — it already has "Öffnen & prüfen →".
Priority 2 already has "Aufgabe erstellen" which is correct for that state (multiple tasks need attention, no single obvious one to open).

All UI text in German per architecture rules.
  </action>
  <verify>
    <automated>cd G:/01_OPUS/Projects/PORTAL && npm run build 2>&1 | tail -5</automated>
  </verify>
  <done>DynamicHero priority 3 (upcoming/in-preparation step) shows a ghost-styled "Aufgabe öffnen" button that opens the StepSheet for that step. Priority 1 still shows "Öffnen & prüfen →". Priority 2 still shows "Aufgabe erstellen". Priority 4 has no CTA.</done>
</task>

</tasks>

<verification>
1. `npm run build` completes without errors
2. `npm run lint` passes (or has no new errors)
3. Manual: Log in as test user → open project → if a task is in CLIENT REVIEW, click "Öffnen & prüfen" → click "Freigeben" → hero card should immediately update (not wait 1-3s for webhook)
4. Manual: If hero shows priority 3 (upcoming step), the "Aufgabe öffnen" button should appear and open the step sheet
</verification>

<success_criteria>
- Freigeben/Änderungen instantly updates the DynamicHero CTA card via optimistic cache patch
- Non-CLIENT REVIEW hero states (priority 3) have an "Aufgabe öffnen" ghost button
- No regressions in tickets module (useTaskActions unchanged)
- Build passes cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/260403-euc-fix-projects-module-realtime-and-task-op/260403-euc-SUMMARY.md`
</output>
