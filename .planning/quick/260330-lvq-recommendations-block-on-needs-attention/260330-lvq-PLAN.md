---
phase: quick-260330-lvq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/functions/update-task-status/index.ts
  - supabase/functions/_shared/clickup-contract.ts
  - src/modules/tickets/types/tasks.ts
  - src/modules/tickets/lib/dictionary.ts
  - src/modules/tickets/hooks/useTaskActions.ts
  - src/modules/tickets/hooks/useRecommendations.ts
  - src/modules/tickets/components/RecommendationCard.tsx
  - src/modules/tickets/components/RecommendationActions.tsx
  - src/modules/tickets/components/RecommendationsBlock.tsx
  - src/modules/tickets/pages/TicketsPage.tsx
autonomous: true
requirements: [REC-01]

must_haves:
  truths:
    - "Recommendations block appears below main task list on Needs Attention tab only"
    - "Recommendations show tasks tagged 'recommendation' with status TO DO"
    - "Accept flow removes recommendation tag, adds ticket tag, sets status READY, sets due_date"
    - "Decline flow sets status CANCELED with optional comment"
    - "Block disappears when no recommendations exist"
  artifacts:
    - path: "supabase/functions/update-task-status/index.ts"
      provides: "accept_recommendation and decline_recommendation actions with tag management"
      contains: "accept_recommendation"
    - path: "src/modules/tickets/hooks/useRecommendations.ts"
      provides: "Filter tasks by recommendation tag + TO DO status"
      exports: ["useRecommendations"]
    - path: "src/modules/tickets/components/RecommendationsBlock.tsx"
      provides: "Section with header, divider, recommendation cards"
      exports: ["RecommendationsBlock"]
    - path: "src/modules/tickets/components/RecommendationCard.tsx"
      provides: "Individual recommendation card with lightbulb icon, credits, actions"
      exports: ["RecommendationCard"]
    - path: "src/modules/tickets/components/RecommendationActions.tsx"
      provides: "Accept modal (datepicker) and Decline modal (optional comment)"
      exports: ["RecommendationActions"]
  key_links:
    - from: "src/modules/tickets/pages/TicketsPage.tsx"
      to: "RecommendationsBlock"
      via: "Rendered below TaskList only when filter === 'attention'"
      pattern: "filter === 'attention'"
    - from: "RecommendationActions"
      to: "update-task-status Edge Function"
      via: "useTaskActions.performAction with accept_recommendation/decline_recommendation"
      pattern: "accept_recommendation|decline_recommendation"
    - from: "useRecommendations"
      to: "useClickUpTasks"
      via: "Filters existing task data by tag + status"
      pattern: "tag.*recommendation.*to do"
---

<objective>
Add a Recommendations block to the Needs Attention tab in TicketsPage. Agency-created recommendations (tasks tagged `recommendation` with status `TO DO`) appear in a visually separated section below the main task list. Clients can Accept (datepicker for due date, tag swap, status to READY) or Decline (optional comment, status to CANCELED).

Purpose: Enable proactive agency-to-client recommendations workflow without a separate page.
Output: Edge Function extensions + 4 new components + 1 new hook + TicketsPage integration.
</objective>

<execution_context>
@.claude/agents/implementation-agent.md
</execution_context>

<context>
@CLAUDE.md
@docs/ideas/recommendations.md

<interfaces>
<!-- Key types and contracts the executor needs -->

From src/modules/tickets/types/tasks.ts:
```typescript
export type TaskAction = 'approve' | 'request_changes' | 'put_on_hold' | 'resume' | 'cancel' | 'approve_credits';

export interface ClickUpTask {
  id: string;
  clickup_id: string;
  name: string;
  description: string;
  status: string;
  tags: Array<{ name: string; color: string; background: string }>;
  credits?: number | null;
  due_date: string | null;
  // ... (full interface in types/tasks.ts)
}
```

From src/modules/tickets/hooks/useTaskActions.ts:
```typescript
export function useTaskActions(options?: UseTaskActionsOptions): {
  performAction: (taskId: string, action: TaskAction, comment?: string) => Promise<UpdateTaskStatusResponse>;
  isLoading: boolean;
  // ... named helpers
}
```

From src/modules/tickets/lib/status-mapping.ts:
```typescript
export function mapStatus(clickupStatus: string): TaskStatus;
```

From supabase/functions/_shared/clickup-contract.ts:
```typescript
const STATUS_ALIASES: Record<string, string[]>; // maps action -> ClickUp status names
export function resolveStatusForAction(action: string, availableStatuses: Array<{ status: string }>): { status: string } | null;
```

From supabase/functions/update-task-status/index.ts:
```typescript
const VALID_ACTIONS = ["approve", "request_changes", "put_on_hold", "resume", "cancel", "approve_credits"];
// Body: { taskId, action, comment }
// Returns: { success, newStatus, message }
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend Edge Function + types for accept/decline recommendation</name>
  <files>
    supabase/functions/_shared/clickup-contract.ts,
    supabase/functions/update-task-status/index.ts,
    src/modules/tickets/types/tasks.ts,
    src/modules/tickets/lib/dictionary.ts,
    src/modules/tickets/hooks/useTaskActions.ts
  </files>
  <action>
    **1a. clickup-contract.ts** — Add STATUS_ALIASES entries:
    - `accept_recommendation`: aliases `["ready", "Ready", "READY"]` (same as approve_credits)
    - `decline_recommendation`: aliases `["canceled", "Canceled", "CANCELED", "cancelled", "Cancelled", "CANCELLED"]` (same as cancel)

    **1b. update-task-status/index.ts** — Extend to support recommendation actions:
    - Add `"accept_recommendation"` and `"decline_recommendation"` to VALID_ACTIONS array
    - After the status update PUT call succeeds, add a new block for `accept_recommendation`:
      1. Set `due_date` on the task: `PUT /task/{taskId}` with `{ due_date: body.dueDate }` (dueDate is Unix ms timestamp from body, REQUIRED for this action — validate its presence)
      2. Remove tag `recommendation`: `DELETE https://api.clickup.com/api/v2/task/{taskId}/tag/recommendation` (use fetchWithRetry)
      3. Add tag `ticket`: `POST https://api.clickup.com/api/v2/task/{taskId}/tag/ticket` (use fetchWithRetry)
      4. Log each step. Tag operations are best-effort — log errors but don't fail the whole request if a tag op fails (status change is the critical part)
    - For `decline_recommendation`:
      1. Status update to CANCELED already happens via the normal flow
      2. Comment posting already happens via the existing comment block (if comment is provided in body)
      3. No additional tag management needed — canceled tasks leave the active list regardless of tags
    - Update `ACTION_MESSAGES` with entries:
      - `accept_recommendation`: `"Recommendation accepted"`
      - `decline_recommendation`: `"Recommendation declined"`
    - Update task_cache after accept: also update `due_date` in the cache update at the end

    **1c. types/tasks.ts** — Extend TaskAction union:
    ```typescript
    export type TaskAction = 'approve' | 'request_changes' | 'put_on_hold' | 'resume' | 'cancel' | 'approve_credits' | 'accept_recommendation' | 'decline_recommendation';
    ```

    **1d. dictionary.ts** — Add German strings under `toasts`:
    ```typescript
    recommendAcceptSuccess: 'Empfehlung angenommen',
    recommendAcceptError: 'Empfehlung konnte nicht angenommen werden',
    recommendDeclineSuccess: 'Empfehlung abgelehnt',
    recommendDeclineError: 'Empfehlung konnte nicht abgelehnt werden',
    ```
    Add under `labels`:
    ```typescript
    recommendations: 'Empfehlungen',
    recommendationsSubtitle: 'Vorschlage unseres Teams',
    ```
    Add under `actions`:
    ```typescript
    accept: 'Annehmen',
    decline: 'Ablehnen',
    ```
    Add under `dialogs`:
    ```typescript
    acceptTitle: 'Empfehlung annehmen',
    acceptMessage: 'Bis wann soll das erledigt werden?',
    acceptConfirm: 'Annehmen',
    declineTitle: 'Empfehlung ablehnen',
    declineMessage: 'Mochten Sie einen Grund angeben? (optional)',
    declinePlaceholder: 'Grund fur Ablehnung...',
    declineConfirm: 'Ablehnen',
    ```

    **1e. useTaskActions.ts** — Add to ACTION_TOASTS:
    ```typescript
    accept_recommendation: { success: dict.toasts.recommendAcceptSuccess, error: dict.toasts.recommendAcceptError },
    decline_recommendation: { success: dict.toasts.recommendDeclineSuccess, error: dict.toasts.recommendDeclineError },
    ```
    Add named helpers:
    ```typescript
    acceptRecommendation: (taskId: string, dueDate?: number) => performAction(taskId, 'accept_recommendation'),
    declineRecommendation: (taskId: string, comment?: string) => performAction(taskId, 'decline_recommendation', comment),
    ```
    NOTE: The `dueDate` needs to be passed through the body. Extend `UpdateTaskStatusParams` to include optional `dueDate?: number` (Unix ms). Update `updateTaskStatus` function to include `dueDate` in the body when present. Update `performAction` signature to accept optional extra params.
  </action>
  <verify>
    <automated>npm run build</automated>
  </verify>
  <done>
    - `accept_recommendation` and `decline_recommendation` are valid actions in the Edge Function
    - Accept action: changes status to READY, sets due_date, removes recommendation tag, adds ticket tag
    - Decline action: changes status to CANCELED, posts optional comment
    - TypeScript types updated, dictionary has all German strings, useTaskActions exposes named helpers
    - Build passes with no type errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Build useRecommendations hook + RecommendationCard + RecommendationActions + RecommendationsBlock</name>
  <files>
    src/modules/tickets/hooks/useRecommendations.ts,
    src/modules/tickets/components/RecommendationCard.tsx,
    src/modules/tickets/components/RecommendationActions.tsx,
    src/modules/tickets/components/RecommendationsBlock.tsx
  </files>
  <action>
    **2a. useRecommendations.ts** — Simple derived hook:
    ```typescript
    import type { ClickUpTask } from '../types/tasks';

    export function useRecommendations(tasks: ClickUpTask[]) {
      const recommendations = tasks.filter(t =>
        t.tags?.some(tag => tag.name.toLowerCase() === 'recommendation') &&
        t.status.toLowerCase() === 'to do'
      );
      return { recommendations, count: recommendations.length };
    }
    ```
    No Supabase call needed — it filters existing task data from useClickUpTasks.

    **2b. RecommendationCard.tsx** — Single recommendation card (keep under 100 lines):
    - Use lightbulb emoji or `Idea01Icon` from `@hugeicons/core-free-icons` (check availability, fall back to emoji) as visual marker
    - Card layout similar to TaskCard but distinct (slightly different styling to visually separate from regular tasks):
      - Lightbulb icon + task name (title, max 2 lines)
      - Description preview (max 2 lines, line-clamp-2)
      - Bottom row: CreditBadge (reuse existing) + "Annehmen" button (accent/primary) + "Ablehnen" button (ghost/secondary)
    - Card background: subtle highlight (e.g., `bg-surface` with a thin left border in a warm/amber color like `var(--phase-3)` or similar)
    - Fixed height like TaskCard (152px) for grid consistency
    - Props: `task: ClickUpTask`, `onAccept: (task: ClickUpTask) => void`, `onDecline: (task: ClickUpTask) => void`
    - Clicking the card body (not buttons) should open task detail sheet via `onTaskClick`
    - Add `onTaskClick: (id: string) => void` prop

    **2c. RecommendationActions.tsx** — Accept and Decline modals (keep under 150 lines):
    - Uses shadcn AlertDialog pattern (import from `@/shared/components/ui/`)
    - State: `mode: 'accept' | 'decline' | null`, `selectedTask: ClickUpTask | null`
    - **Accept modal:**
      - Title: dict.dialogs.acceptTitle
      - Body: dict.dialogs.acceptMessage + a date input (`<input type="date" />` — simple native datepicker, no external lib needed). Default to 2 weeks from today.
      - Confirm button calls `useTaskActions().performAction(task.clickup_id, 'accept_recommendation')` with dueDate as Unix ms
      - On success: task disappears from recommendations (React Query invalidation handles this)
    - **Decline modal:**
      - Title: dict.dialogs.declineTitle
      - Body: dict.dialogs.declineMessage + optional Textarea (shadcn)
      - Confirm button calls `useTaskActions().performAction(task.clickup_id, 'decline_recommendation', comment)` with optional comment
    - Expose: `openAccept(task)`, `openDecline(task)`, and the rendered `<>` fragment with both dialogs
    - Use the `useTaskActions` hook internally for mutations

    **2d. RecommendationsBlock.tsx** — Section wrapper (keep under 80 lines):
    - Only renders when `recommendations.length > 0`
    - Visual divider at top: a thin horizontal rule with subtle label, e.g.:
      ```
      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-text-tertiary font-medium">{dict.labels.recommendations}</span>
        <div className="flex-1 h-px bg-border" />
      </div>
      ```
    - Section header: lightbulb icon + "Empfehlungen" (dict.labels.recommendations) + count badge
    - Subtitle: dict.labels.recommendationsSubtitle in text-text-tertiary
    - Grid of RecommendationCard components (same `grid grid-cols-1 md:grid-cols-2 gap-3` as TaskList)
    - Props: `recommendations: ClickUpTask[]`, `onTaskClick: (id: string) => void`
    - Renders RecommendationActions internally, passes openAccept/openDecline to cards
    - Use motion for card entrance animation (same cardVariants pattern from task-list-utils)
  </action>
  <verify>
    <automated>npm run build</automated>
  </verify>
  <done>
    - useRecommendations filters tasks by recommendation tag + TO DO status
    - RecommendationCard renders with lightbulb icon, title, description, credits, Accept/Decline buttons
    - RecommendationActions provides Accept (datepicker) and Decline (optional comment) modals
    - RecommendationsBlock wraps cards in a section with divider, only renders when recs exist
    - All components under line limits, all text from dictionary, build passes
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire RecommendationsBlock into TicketsPage Needs Attention tab</name>
  <files>
    src/modules/tickets/pages/TicketsPage.tsx
  </files>
  <action>
    In TicketsPage.tsx:
    1. Import `useRecommendations` and `RecommendationsBlock`
    2. Call `const { recommendations } = useRecommendations(tasks)` alongside existing hooks
    3. After the `<TaskList ... />` component (line ~156), add a conditional render:
       ```tsx
       {filter === 'attention' && recommendations.length > 0 && (
         <RecommendationsBlock
           recommendations={recommendations}
           onTaskClick={openTask}
         />
       )}
       ```
    4. This ensures the block ONLY appears on the "Ihre Ruckmeldung" (attention) tab and ONLY when recommendations exist.
    5. The block renders below the main task list with its own divider — no changes needed to TaskList itself.
    6. Verify TicketsPage stays under 200 lines (currently 168 lines, adding ~5 lines of imports + render = ~175 lines, well within limit).
  </action>
  <verify>
    <automated>npm run build</automated>
  </verify>
  <done>
    - RecommendationsBlock appears below task list on Needs Attention tab only
    - Block hidden on all other tabs (open, in_progress, done, etc.)
    - Block hidden when no recommendations exist
    - Clicking a recommendation card opens task detail sheet
    - Accept/Decline buttons trigger respective modals
    - TicketsPage remains under component line limit
  </done>
</task>

</tasks>

<verification>
1. `npm run build` — zero TypeScript errors, zero warnings
2. `npm run lint` — no new lint errors
3. Manual verification: Navigate to TicketsPage, check that Needs Attention tab shows recommendations block when recommendation-tagged TO DO tasks exist
4. Manual verification: Accept flow opens datepicker modal, submitting calls Edge Function correctly
5. Manual verification: Decline flow opens comment modal, submitting sets status to CANCELED
6. Manual verification: Other tabs (Open, In Progress, Done) do NOT show recommendations block
</verification>

<success_criteria>
- Recommendations block visible on Needs Attention tab when recommendation-tagged TO DO tasks exist
- Accept flow: due date picker -> removes recommendation tag, adds ticket tag, status READY, sets due_date
- Decline flow: optional comment -> status CANCELED, comment posted if provided
- Block disappears when all recommendations are accepted/declined
- No visual disruption to existing task list above the recommendations block
- All UI text in German
</success_criteria>

<output>
After completion, create `.planning/quick/260330-lvq-recommendations-block-on-needs-attention/260330-lvq-SUMMARY.md`
</output>
