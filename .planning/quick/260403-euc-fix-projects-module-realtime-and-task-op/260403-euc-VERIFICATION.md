---
phase: quick-260403-euc
verified: 2026-04-03T00:00:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Quick Task 260403-euc: Fix Projects Module Realtime + Task Open Button — Verification Report

**Task Goal:** Fix projects module realtime and task open button — optimistic update after Freigeben/Änderungen, and Öffnen button for non-CLIENT REVIEW hero states
**Verified:** 2026-04-03
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After Freigeben or Änderungen anfordern, the CTA card immediately updates to show the next task or changes hero state | VERIFIED | `StepActionBar.tsx` lines 24–52: `queryClient.setQueryData(['project', projectId], ...)` optimistic patch fires before `invalidateQueries`. Captures `activeAction` in `currentAction` before reset. Sets `rawStatus`, `status`, `isClientReview: false`, and recalculates `tasksSummary.needsAttention`. |
| 2 | The sheet closes after Freigeben/Änderungen and the hero no longer shows the just-approved task | VERIFIED | `StepDetail.tsx` line 56 passes `onSuccess={onClose}` to `StepActionBar`. The optimistic patch sets `isClientReview: false` and `status` to `committed`/`upcoming_locked`, which removes the step from `primaryAttention` (filtered by `isClientReview` in `overview-interpretation.ts`). |
| 3 | Non-CLIENT REVIEW tasks shown in DynamicHero (priority 2/3) have an Öffnen button to open the step detail | VERIFIED | `DynamicHero.tsx` lines 83–86: priority 3 block defines `ghostCta: { label: 'Aufgabe öffnen', onClick: () => onOpenStep?.(upcomingStep.step.id) }`. Render path at lines 142–161 handles `ghostCta`. `onOpenStep={openStep}` wired at `OverviewPage.tsx` line 78. |
| 4 | Realtime subscription on project_task_cache still fires and refreshes project data when webhook arrives | VERIFIED | `useProject.ts` lines 119–131: `supabase.channel('project-tasks-${projectId}')` subscribes to `postgres_changes` on `project_task_cache` filtered by `project_config_id`. Debounced 300ms via `realtimeDebounceRef`, calls `queryClient.refetchQueries({ queryKey: ['project', projectId] })`. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/modules/projects/components/steps/StepActionBar.tsx` | Optimistic cache update for project query after approve/request_changes | VERIFIED | 153 lines. `queryClient.setQueryData` at line 25. `StepStatus` type imported. Both approve and request_changes paths handled. |
| `src/modules/projects/hooks/useProject.ts` | Realtime subscription + optimistic update support | VERIFIED | 171 lines. Realtime subscription at lines 119–131. `useQueryClient` imported and used. |
| `src/modules/projects/components/overview/DynamicHero.tsx` | Öffnen button for non-CLIENT REVIEW hero states | VERIFIED | 171 lines. `ghostCta` defined in `HeroContent` interface (line 28). Set for priority 3 at lines 83–86. Rendered at lines 153–160. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `StepActionBar.tsx` | `['project', projectId]` query cache | `queryClient.setQueryData` optimistic patch | WIRED | Line 25: `queryClient.setQueryData(['project', projectId], ...)` confirmed via grep |
| `useProject.ts` | `project_task_cache` realtime | `supabase.channel postgres_changes` | WIRED | Line 124: `table: 'project_task_cache'` confirmed via grep; filter by `project_config_id` at line 125 |
| `DynamicHero.tsx` | `openStep()` in `OverviewPage` | `onOpenStep` prop + `ghostCta.onClick` | WIRED | `OverviewPage.tsx` line 78: `onOpenStep={openStep}`. `ghostCta.onClick` calls `onOpenStep?.(upcomingStep.step.id)` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `StepActionBar.tsx` | `old: Project` in setQueryData | `['project', projectId]` TanStack Query cache, populated by `fetchProjectData` from Supabase | Yes — Supabase queries on `project_config`, `chapter_config`, `project_task_cache`, `step_enrichment` | FLOWING |
| `DynamicHero.tsx` | `upcomingStep.step.id` | `overview.nextMeaningfulStep` from `interpretProjectOverview(project)` | Yes — derived from real project data passed as prop from `UebersichtPage` via `useProject` | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Build produces no TypeScript errors | `npm run build` | `built in 11.84s` — no errors | PASS |
| Commit 26a1600 exists (StepActionBar optimistic patch) | `git log --oneline` | `26a1600 fix(quick-260403-euc): optimistic project cache update after Freigeben/Änderungen` | PASS |
| Commit 22e29ad exists (DynamicHero ghostCta) | `git log --oneline` | `22e29ad feat(quick-260403-euc): add Aufgabe öffnen ghost button to DynamicHero priority 3` | PASS |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| BUG-realtime-after-freigeben | CTA card updates immediately after Freigeben/Änderungen without waiting for webhook | SATISFIED | Optimistic `setQueryData` patch in `StepActionBar.tsx` + `invalidateQueries` still fires for eventual consistency |
| BUG-open-task-button | Non-CLIENT REVIEW hero states need Öffnen button | SATISFIED | Priority 3 `ghostCta` in `DynamicHero.tsx` with label "Aufgabe öffnen" wired to `onOpenStep` |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found | — | — |

No TODOs, placeholders, empty returns, or stub patterns detected in the modified files.

### Human Verification Required

#### 1. Freigeben optimistic update feel

**Test:** Log in as test user, open a project where a task is in CLIENT REVIEW. Open the step sheet, click "Freigeben". Observe the DynamicHero card.
**Expected:** The CTA card instantly transitions away from the just-approved task (no 1-3 second stale state). If another CLIENT REVIEW task exists, it should appear immediately.
**Why human:** Timing behavior (optimistic update latency) cannot be verified statically.

#### 2. Priority 3 Öffnen button opens correct sheet

**Test:** Find a project where no task is in CLIENT REVIEW but an upcoming step exists (status `upcoming_locked`). Observe DynamicHero shows "IN VORBEREITUNG". Click "Aufgabe öffnen".
**Expected:** StepSheet opens for that specific step.
**Why human:** Requires a specific project state (priority 3 hero condition) and sheet open behavior.

### Gaps Summary

No gaps. All 4 observable truths are verified against the actual codebase. Both artifacts are substantive, correctly wired, and data flows through them. The build passes cleanly with no TypeScript errors.

---

_Verified: 2026-04-03_
_Verifier: Claude (gsd-verifier)_
