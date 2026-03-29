# Phase 3: AI Enrichment - Research

**Researched:** 2026-03-29
**Domain:** Supabase Edge Functions (Deno), OpenRouter API, React component enrichment display, hash-based change detection, Supabase ALTER TABLE migrations
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Re-enrichment Change Detection (ENRICH-01)**
- D-01: Hash both task `name` AND `description` to detect changes. Store hash in a new `content_hash` column on `step_enrichment`.
- D-02: On sync, compare current hash with stored hash. If different → include task in re-enrichment batch (overwrite existing enrichment).
- D-03: Change the `ignoreDuplicates: true` upsert to a full upsert (update on conflict) so re-enrichment actually overwrites stale content.
- D-04: Add `last_enriched_at` timestamp column to `step_enrichment` for debugging/auditing.

**AI Model Switch (CRITICAL)**
- D-05: Switch enrichment from Claude Haiku (`ANTHROPIC_API_KEY`) to GPT-4o-mini via OpenRouter (`OPENROUTER_API_KEY`). OpenRouter endpoint: `https://openrouter.ai/api/v1/chat/completions`. Model: `openai/gpt-4o-mini`.
- D-06: `OPENROUTER_API_KEY` must be added to Coolify Supabase env vars manually (prerequisite, not automated). Plan should include a prerequisite note.
- D-07: Remove the `ANTHROPIC_API_KEY` dependency from `fetch-project-tasks`. The key may still be used by other functions — only remove from the enrichment call path.

**sort_order Population (ENRICH-04)**
- D-11: Edge Function (`fetch-project-tasks`) extracts `milestone_order` from ClickUp custom field and writes it to `step_enrichment.sort_order` during upsert. Single source of truth at sync time.
- D-12: The transform already sorts by `enrichment.sort_order` (falling back to 999, then name) — no frontend change needed for ordering once Edge Function populates the field.

### Claude's Discretion
- Exact placement of "Neu generieren" admin button (StepOverviewTab recommended by audit)
- Which DynamicHero priority levels get enrichment text (P1 and/or P3)
- OpenRouter API call structure (compatible with OpenAI chat completions format)
- Whether to batch re-enrichment calls or process individually
- Error handling strategy for OpenRouter failures (existing pattern: warn + skip)

### Deferred Ideas (OUT OF SCOPE)
- ClickUp webhook-triggered enrichment refresh — manual + sync-time is sufficient
- AI model upgrade beyond GPT-4o-mini
- Enrichment quality scoring or confidence metrics
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ENRICH-01 | Step enrichment re-generates when task name/description changes (hash-based detection) | Hash algorithm documented, upsert pattern defined, `content_hash` column DDL provided |
| ENRICH-02 | Operator can manually trigger re-enrichment per step via admin UI | `isMemoryOperator` gate pattern documented, button placement in StepOverviewTab, supabase.functions.invoke pattern confirmed |
| ENRICH-03 | DynamicHero shows AI-generated whyItMatters text when available | Exact code lines identified (DynamicHero.tsx:49 and :89), fallback pattern defined |
| ENRICH-04 | step_enrichment.sort_order is populated from milestone_order custom field | `extractMilestoneOrder()` and `parseMilestoneOrder()` already exist in transforms-project.ts — reuse in Edge Function |
</phase_requirements>

---

## Summary

Phase 3 is a contained set of fixes to the AI enrichment lifecycle. All four requirements address the same root pattern: the current enrichment system is write-once (new tasks only), never surfaces its content prominently, and never writes the sort order it already knows how to read. No new database tables or frontend architecture is needed — only targeted edits to existing files.

The most complex work is ENRICH-01: change detection requires a `content_hash` column (new DB migration), a hash function in the Edge Function (Deno's `crypto.subtle.digest` is available), and flipping `ignoreDuplicates: true` to a proper `merge` upsert. The model swap (Anthropic Haiku → GPT-4o-mini via OpenRouter) is mechanical — the OpenRouter endpoint is OpenAI chat completions compatible and the project already uses it in `scripts/openrouter-review.cjs`.

ENRICH-02 (admin button) uses the established `isMemoryOperator` gate from `lib/memory-access.ts`. The button calls `supabase.functions.invoke('fetch-project-tasks')` with a `forceReenrich: true` flag — or alternatively can call the function without a flag and rely on hash detection catching changes if the operator clears the hash first. The cleanest approach is a dedicated `force_reenrich_task_id` parameter.

ENRICH-03 requires two 1-line changes in DynamicHero.tsx: P1 (client review) and P3 (upcoming step) `description` fields replace `step.description` with `step.whyItMatters || step.description`.

ENRICH-04 requires the Edge Function to extract `milestone_order` from the task's custom fields and write it to `step_enrichment.sort_order` during upsert. The extraction logic (`parseMilestoneOrder`) already exists in `transforms-project.ts` but is not yet shared with the Edge Function.

**Primary recommendation:** Execute in sequence: DB migration first → Edge Function changes → Frontend changes. Each can be independently tested before proceeding.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | `2.47.10` (pinned) | DB writes from Edge Function, RLS-bypassing service client | Already in use, pinned in all Edge Functions |
| OpenRouter API | `openai/gpt-4o-mini` | AI enrichment generation | D-05 locked decision; same endpoint as `openrouter-review.cjs` |
| Deno `crypto.subtle` | Built-in | SHA-256 hashing for change detection | Available in all Deno Edge Function runtimes, no import needed |
| React Query (`@tanstack/react-query`) | project standard | Cache invalidation after re-enrichment mutation | Already in useProject hook |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sonner` | `^2.0.7` | Toast notifications for re-enrichment success/failure | ENRICH-02 button feedback |
| `isMemoryOperator` (local) | — | Gate admin features by email allowlist | ENRICH-02 operator button visibility |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `crypto.subtle.digest` (Deno built-in) | `btoa(name+description)` | SHA-256 is more collision-resistant; btoa is simpler but theoretically less safe for content comparison at scale |
| Force-flag parameter | Clear hash first | Force-flag is cleaner and doesn't require a separate DB write before calling the function |

---

## Architecture Patterns

### Recommended Project Structure

No new files needed. All changes are edits to existing files:

```
supabase/functions/fetch-project-tasks/index.ts   ← ENRICH-01, ENRICH-04 (Edge Function)
src/modules/projects/components/overview/DynamicHero.tsx   ← ENRICH-03 (2-line change)
src/modules/projects/components/steps/StepOverviewTab.tsx  ← ENRICH-02 (operator button)
supabase/migrations/YYYYMMDD_step_enrichment_columns.sql   ← NEW migration file
src/modules/projects/types/project.ts             ← StepEnrichmentRow type update
```

### Pattern 1: SHA-256 Content Hash (Deno)

**What:** Compute a deterministic hash from task `name` + `description` to detect content changes since last enrichment.

**When to use:** At the start of each sync cycle in `fetch-project-tasks`, before deciding which tasks need re-enrichment.

```typescript
// Source: Deno built-in crypto API (available in all Deno Edge Functions)
async function computeContentHash(name: string, description: string): Promise<string> {
  const content = `${name}::${description}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32); // 32 hex chars, sufficient
}
```

### Pattern 2: Hash-Based Re-enrichment Gate

**What:** Query existing enrichments including their `content_hash`, then compare against computed hashes to build the re-enrichment batch.

**When to use:** Replace the current `enrichedTaskIds` Set with a richer structure.

```typescript
// BEFORE (write-once, ignores content changes):
const { data: existingEnrichments } = await supabaseService
  .from("step_enrichment")
  .select("clickup_task_id");
const enrichedTaskIds = new Set((existingEnrichments || []).map(e => e.clickup_task_id));
// ...
if (!enrichedTaskIds.has(task.id)) { /* enrich */ }

// AFTER (hash-aware, triggers re-enrichment on content change):
const { data: existingEnrichments } = await supabaseService
  .from("step_enrichment")
  .select("clickup_task_id, content_hash");
const enrichmentHashMap = new Map<string, string>(
  (existingEnrichments || []).map(e => [e.clickup_task_id, e.content_hash ?? ""])
);
// ...
const currentHash = await computeContentHash(task.name, task.description || "");
const storedHash = enrichmentHashMap.get(task.id);
if (!storedHash || storedHash !== currentHash) {
  tasksForEnrichment.push({ clickup_id: task.id, name: task.name, description: task.description || "", contentHash: currentHash });
}
```

### Pattern 3: Full Upsert with Hash + sort_order + last_enriched_at

**What:** Replace the `ignoreDuplicates: true` upsert with a merge upsert that writes all fields on conflict.

```typescript
// BEFORE — ignoreDuplicates silently skips re-enrichment:
await supabaseService.from("step_enrichment").upsert(
  enrichments.map(e => ({
    clickup_task_id: e.clickup_task_id,
    why_it_matters: e.why_it_matters,
    what_becomes_fixed: e.what_becomes_fixed,
  })),
  { onConflict: "clickup_task_id", ignoreDuplicates: true }
);

// AFTER — full merge upsert:
await supabaseService.from("step_enrichment").upsert(
  enrichments.map(e => ({
    clickup_task_id: e.clickup_task_id,
    why_it_matters: e.why_it_matters,
    what_becomes_fixed: e.what_becomes_fixed,
    sort_order: e.sort_order,
    content_hash: e.contentHash,
    last_enriched_at: new Date().toISOString(),
  })),
  { onConflict: "clickup_task_id" }  // no ignoreDuplicates → performs UPDATE on conflict
);
```

### Pattern 4: OpenRouter API Call (Deno Edge Function)

**What:** Replace the Anthropic API call with OpenRouter using the OpenAI-compatible chat completions format.

**When to use:** In `generateStepEnrichment()`, swap the entire API call body.

```typescript
// Source: scripts/openrouter-review.cjs + OpenRouter docs (openai-compatible)
async function generateStepEnrichment(
  tasks: Array<{ clickup_id: string; name: string; description: string; contentHash: string }>,
  log: ReturnType<typeof createLogger>
): Promise<Array<{ clickup_task_id: string; why_it_matters: string; what_becomes_fixed: string; contentHash: string }>> {
  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) {
    log.debug("No OPENROUTER_API_KEY — skipping AI enrichment");
    return [];
  }

  const prompt = `...`; // Keep existing German prompt, no changes needed

  const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openrouterKey}`,
      "HTTP-Referer": "https://portal.kamanin.at",
      "X-Title": "KAMANIN Portal Enrichment",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      max_tokens: 4000,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    }),
  }, 30000);

  // Response shape: data.choices[0].message.content (NOT data.content[0].text like Anthropic)
  const data = await response.json();
  let text = data.choices?.[0]?.message?.content || "";
  // ... rest of parsing is identical
}
```

**Critical difference from Anthropic format:**
- Anthropic: `data.content[0].text`
- OpenRouter (OpenAI-compatible): `data.choices[0].message.content`

### Pattern 5: Operator Re-enrichment Button (ENRICH-02)

**What:** Admin-only button in StepOverviewTab that triggers re-enrichment for a single step by invoking `fetch-project-tasks` with a force flag.

**When to use:** When operator wants to refresh enrichment without waiting for next sync cycle.

```typescript
// Source: isMemoryOperator pattern from src/modules/projects/lib/memory-access.ts
import { isMemoryOperator } from '../../lib/memory-access';
import { useAuth } from '@/shared/hooks/useAuth';
import { supabase } from '@/shared/lib/supabase';
import { toast } from 'sonner';

// In StepOverviewTab component:
const { profile } = useAuth();
const [isReenriching, setIsReenriching] = useState(false);
const isOperator = isMemoryOperator(profile);

const handleReenrich = async () => {
  setIsReenriching(true);
  try {
    const { error } = await supabase.functions.invoke('fetch-project-tasks', {
      body: { force_reenrich_task_id: step.clickupTaskId }
    });
    if (error) throw error;
    toast.success('Neu generiert');
    // Invalidate query via queryClient passed as prop, or use window event
  } catch {
    toast.error('Generierung fehlgeschlagen. Bitte erneut versuchen.');
  } finally {
    setIsReenriching(false);
  }
};

// Render (only for operators):
{isOperator && (
  <button onClick={handleReenrich} disabled={isReenriching}>
    {isReenriching ? 'Wird generiert...' : 'Neu generieren'}
  </button>
)}
```

**Edge Function handling for `force_reenrich_task_id`:**
```typescript
// In Deno.serve handler, after auth validation:
const body = await req.json().catch(() => ({}));
const forceReenrichTaskId: string | null = body?.force_reenrich_task_id ?? null;

// When building tasksForEnrichment: if forceReenrichTaskId matches, skip hash check
if (forceReenrichTaskId === task.id || !storedHash || storedHash !== currentHash) {
  tasksForEnrichment.push(...);
}
```

### Pattern 6: DynamicHero Enrichment Display (ENRICH-03)

**What:** Two 1-line changes in DynamicHero.tsx — use `whyItMatters` with fallback to `description`.

```typescript
// BEFORE (DynamicHero.tsx line 49 — P1 client review):
description: primaryAttention.description,

// AFTER:
description: primaryAttention.whyItMatters || primaryAttention.description,

// BEFORE (DynamicHero.tsx line 89 — P3 upcoming step):
description: upcomingStep.step.description,

// AFTER:
description: upcomingStep.step.whyItMatters || upcomingStep.step.description,
```

Note: `ProjectAttentionItem` type (in `project.ts`) already has a `whyItMatters` field. No type changes needed for the hero changes.

### Pattern 7: milestone_order Extraction in Edge Function (ENRICH-04)

**What:** Extract `milestone_order` from the ClickUp task's custom fields inside the Edge Function and write it to `step_enrichment.sort_order`.

**How:** The `parseMilestoneOrder()` logic already exists in `src/modules/projects/lib/transforms-project.ts` but is TypeScript/frontend code — it cannot be imported directly into the Deno Edge Function. The logic must be duplicated (it's 10 lines).

```typescript
// In fetch-project-tasks/index.ts, add:
function parseMilestoneOrder(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractMilestoneOrder(customFields: ClickUpCustomField[]): number | null {
  const field = customFields?.find(
    f => typeof f.name === 'string' && f.name.trim().toLowerCase() === 'milestone order'
  );
  return field ? parseMilestoneOrder(field.value) : null;
}

// Use during task processing (before building enrichments):
const milestoneOrder = extractMilestoneOrder(task.custom_fields || []);
// Include in enrichment item: sort_order: milestoneOrder ?? 0
```

### Anti-Patterns to Avoid

- **Relying on `ignoreDuplicates: true` for idempotency:** This was the root cause of write-once stale enrichment. Remove it entirely.
- **Querying step_enrichment without `content_hash`:** The hash comparison is the entire change-detection mechanism; omitting it from the SELECT query means always re-enriching everything.
- **Using `import.meta.env` inside Edge Functions:** Deno Edge Functions use `Deno.env.get()`, not Vite env vars.
- **Importing from `src/` inside Edge Functions:** `parseMilestoneOrder` lives in the frontend codebase. Copy the logic into the Edge Function rather than attempting a cross-environment import.
- **Blocking the full sync on a single enrichment failure:** Follow existing pattern — `catch` at the task level, `log.warn`, return empty array, continue with other tasks.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Operator email gate | Custom auth middleware | `isMemoryOperator()` in `lib/memory-access.ts` | Already implemented, tested, uses `VITE_MEMORY_OPERATOR_EMAILS` env var |
| API call retry/timeout | Custom retry loop | `fetchWithRetry()` / `fetchWithTimeout()` in `fetch-project-tasks/index.ts` | Already tested, exponential backoff, 10s default / configurable |
| Content hashing | Manual string comparison | `crypto.subtle.digest("SHA-256", ...)` (Deno built-in) | Cryptographic correctness, no imports needed |
| Toast notifications | Custom toast component | `sonner` (`import { toast } from "sonner"`) | Project standard per CLAUDE.md |
| Admin button state | Complex loading state | Simple `useState(false)` + `disabled` prop | Component-local mutation state, no global store needed |
| SHA-256 full 64-char hex | Use full 64-char | Truncate to 32 chars | 32 hex chars (128 bits) is more than sufficient for content change detection; saves DB storage |

**Key insight:** All infrastructure for this phase already exists. The work is connecting existing pieces, not building new ones.

---

## Runtime State Inventory

> Not applicable — this phase is not a rename/refactor/migration of existing identifiers. The only runtime state that changes is the `step_enrichment` table, which gains two new nullable columns via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Existing rows retain all current data; new columns default to NULL/now() until the next sync cycle populates them.

**Nothing found that requires data migration.** Existing `step_enrichment` rows with `content_hash = NULL` will be treated as "needs enrichment" on the next sync (because `storedHash` will be `""` which won't match any computed hash). This is the correct behavior — all existing enrichments will be re-evaluated on next sync.

---

## Common Pitfalls

### Pitfall 1: Anthropic vs OpenRouter Response Shape

**What goes wrong:** After swapping the API call, the response parsing still reads `data.content[0].text` (Anthropic format) instead of `data.choices[0].message.content` (OpenAI/OpenRouter format). The function silently returns `[]` for all enrichment batches.

**Why it happens:** The response body shape differs between APIs. The existing code was written for Anthropic.

**How to avoid:** The line `let text = data.content?.[0]?.text || "";` MUST be changed to `let text = data.choices?.[0]?.message?.content || "";`. This is the #1 most likely breakage point.

**Warning signs:** Edge Function logs show "Enrichment saved: 0" even when tasks are processed.

---

### Pitfall 2: `ignoreDuplicates: true` Still Present After Refactor

**What goes wrong:** The developer removes the hash check but forgets to remove `ignoreDuplicates: true` from the upsert call. Re-enrichment still silently fails.

**Why it happens:** It's a non-default option buried in the upsert options object, easy to overlook.

**How to avoid:** The upsert call should be `{ onConflict: "clickup_task_id" }` with no `ignoreDuplicates` key at all.

**Warning signs:** Hash changes are detected and tasks are added to the re-enrichment batch, but the database rows don't update.

---

### Pitfall 3: `OPENROUTER_API_KEY` Not Set in Coolify

**What goes wrong:** The Edge Function starts, detects no `OPENROUTER_API_KEY`, logs "skipping AI enrichment", and silently generates no enrichments. The function still returns 200. No error is surfaced.

**Why it happens:** D-06 explicitly states this is a manual prerequisite. If the Coolify env var is not added before testing the Edge Function, all enrichment is skipped without obvious failure.

**How to avoid:** The plan must include a prerequisite task: "Add `OPENROUTER_API_KEY` to Coolify Supabase env vars before deploying." This is a blocker for the function to work.

**Warning signs:** Logs show "No OPENROUTER_API_KEY — skipping AI enrichment" on first invocation after deploy.

---

### Pitfall 4: `content_hash` Column Missing from `StepEnrichmentRow` Type

**What goes wrong:** The TypeScript type in `src/modules/projects/types/project.ts` does not include `content_hash` and `last_enriched_at`. Querying these columns from Supabase returns them as `unknown` or causes TypeScript errors. The `useProject` hook may fail type checks.

**Why it happens:** The migration adds columns to the live DB, but the TypeScript row type is manually maintained and not auto-generated from schema.

**How to avoid:** Update `StepEnrichmentRow` in `project.ts` to add `content_hash: string | null` and `last_enriched_at: string | null`. The frontend only reads these fields for debugging; they can be optional.

**Warning signs:** TypeScript build errors when selecting `*` from `step_enrichment` if the type is strict.

---

### Pitfall 5: forceReenrich Path Triggers Full Sync

**What goes wrong:** The `force_reenrich_task_id` parameter is received, but the Edge Function still fetches all tasks from all ClickUp lists before processing the single target task. This is slow and unnecessary for an operator action.

**Why it happens:** The existing function always does a full list fetch. If `force_reenrich_task_id` is not handled as a fast-path, the operator button triggers a 30s+ full sync.

**How to avoid:** When `force_reenrich_task_id` is present, look up the task directly from `project_task_cache` instead of re-fetching from ClickUp. The task data (name, description) is already cached. Only the enrichment generation + upsert needs to run.

**Fast path:**
```typescript
if (forceReenrichTaskId) {
  const { data: cachedTask } = await supabaseService
    .from("project_task_cache")
    .select("clickup_id, name, description, raw_data")
    .eq("clickup_id", forceReenrichTaskId)
    .single();
  if (cachedTask) {
    const hash = await computeContentHash(cachedTask.name, cachedTask.description || "");
    const enrichments = await generateStepEnrichment([{ clickup_id: cachedTask.clickup_id, name: cachedTask.name, description: cachedTask.description || "", contentHash: hash }], log);
    const milestoneOrder = extractMilestoneOrder((cachedTask.raw_data as ClickUpTask)?.custom_fields || []);
    // upsert...
  }
  return new Response(JSON.stringify({ success: true, reEnriched: 1 }), ...);
}
```

---

### Pitfall 6: `queryClient` Not Available in StepOverviewTab for Cache Invalidation

**What goes wrong:** After a successful re-enrichment, the UI doesn't refresh to show new content because the StepOverviewTab cannot call `queryClient.invalidateQueries(['project', projectId])`.

**Why it happens:** StepOverviewTab doesn't receive `queryClient` or `projectId` as props — it only receives `step` and `projectId`. `queryClient` requires `useQueryClient()` import.

**How to avoid:** Use `useQueryClient()` directly inside StepOverviewTab (it's a React hook available anywhere in the React Query provider tree). This is the standard pattern.

```typescript
import { useQueryClient } from '@tanstack/react-query';
const queryClient = useQueryClient();
// After successful re-enrichment:
queryClient.invalidateQueries({ queryKey: ['project', projectId] });
```

---

## Code Examples

### DB Migration: Add content_hash + last_enriched_at

```sql
-- Source: Supabase migration pattern from supabase/migrations/
-- File: supabase/migrations/YYYYMMDD_step_enrichment_change_detection.sql

ALTER TABLE "public"."step_enrichment"
  ADD COLUMN IF NOT EXISTS "content_hash" text,
  ADD COLUMN IF NOT EXISTS "last_enriched_at" timestamptz;

-- No backfill needed: NULL content_hash treated as "needs re-enrichment" on next sync
-- Existing rows get content_hash populated on the next sync cycle automatically
```

### Updated StepEnrichmentRow Type

```typescript
// Source: src/modules/projects/types/project.ts
export interface StepEnrichmentRow {
  id: string;
  clickup_task_id: string;
  why_it_matters: string;
  what_becomes_fixed: string;
  sort_order: number;
  content_hash: string | null;       // NEW — for change detection
  last_enriched_at: string | null;   // NEW — for debugging/auditing
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ignoreDuplicates: true` on step_enrichment upsert | Full upsert with hash comparison | Phase 3 | Enrichment now refreshes when content changes |
| Claude Haiku (`ANTHROPIC_API_KEY`) | GPT-4o-mini via OpenRouter (`OPENROUTER_API_KEY`) | Phase 3 | Single API key dependency; uses project's existing OpenRouter account |
| sort_order always 0 | sort_order populated from milestone_order custom field | Phase 3 | Steps within chapters now sort by ClickUp milestone_order |
| whyItMatters only in StepOverviewTab | whyItMatters surfaced in DynamicHero hero card | Phase 3 | Most visible card on the page now shows AI content |

**Deprecated/outdated after this phase:**
- `ANTHROPIC_API_KEY` usage in `fetch-project-tasks/index.ts` — removed entirely from this function (key may remain for other functions)
- Write-once enrichment pattern — replaced with hash-based detection

---

## Open Questions

1. **Should `force_reenrich_task_id` also update `project_task_cache` from ClickUp, or only regenerate enrichment from cached data?**
   - What we know: The operator button intent is to refresh AI descriptions, not re-sync task data from ClickUp.
   - What's unclear: If the task description changed in ClickUp but wasn't synced yet, enrichment will re-generate from stale cached data.
   - Recommendation: Use cached data only for the force path (faster, simpler). If task data needs updating, the operator should trigger a full sync first. Document this limitation in the UI tooltip.

2. **Should `fetch-project-tasks` accept `projectId` to scope the full sync to one project?**
   - What we know: The function already receives `{ projectId }` in the background refresh call from `useProject.ts` (line 155) but doesn't use it — it syncs ALL projects the user has access to.
   - What's unclear: Was this intentional? Scoping would make the force path more targeted.
   - Recommendation: Out of scope for Phase 3. The force path fast-path (using `project_task_cache`) makes this irrelevant for ENRICH-02.

3. **Which DynamicHero priority levels should show whyItMatters?**
   - What we know: P1 (client review) and P3 (upcoming step) are the candidates per D-09/D-10.
   - Recommendation: Apply to both P1 and P3. P1 (client review) benefits most because it's the highest-urgency card — the AI "why it matters" text gives the client context for why their approval matters. P3 (upcoming) benefits because raw ClickUp descriptions are often empty for planned steps.
   - P2 and P4 use hardcoded German text (not step-specific), so enrichment doesn't apply.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Local dev | Yes | v24.11.1 | — |
| Supabase Edge Functions (Deno runtime) | ENRICH-01, ENRICH-02, ENRICH-04 | Yes (Coolify) | Supabase self-hosted | — |
| `OPENROUTER_API_KEY` in Coolify env | ENRICH-01, ENRICH-02 | UNVERIFIED — manual prerequisite (D-06) | — | None — blocks enrichment if missing |
| Supabase live DB (step_enrichment table) | All | Yes | Self-hosted | — |
| `VITE_MEMORY_OPERATOR_EMAILS` env var | ENRICH-02 | Yes (already used by ProjectContextAdminPanel) | — | Button hidden for all users if not set |

**Missing dependencies with no fallback:**
- `OPENROUTER_API_KEY` in Coolify Supabase env vars — must be added manually before deploying the updated Edge Function. This is a plan prerequisite, not a code task.

**Missing dependencies with fallback:**
- None beyond the above.

---

## Validation Architecture

`workflow.nyquist_validation` is not set in `.planning/config.json` — treating as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm run test` |
| Full suite command | `npm run test:coverage` |
| Environment | jsdom (React), globals: true |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ENRICH-01 | Hash generation and change detection logic | unit | `npm run test -- transforms-project` | Partial — `transforms-project.test.ts` exists but doesn't cover hash |
| ENRICH-01 | `ignoreDuplicates` removed — upsert writes on conflict | integration | Manual — Supabase not mockable in unit tests | N/A |
| ENRICH-02 | `isMemoryOperator` gate shows/hides button correctly | unit | `npm run test -- memory-access` | `memory-access.test.ts` exists (covers gate) |
| ENRICH-03 | DynamicHero uses `whyItMatters` when available, falls back to `description` | unit | `npm run test -- DynamicHero` | ❌ Wave 0 |
| ENRICH-04 | `extractMilestoneOrder` returns correct value from ClickUp custom fields | unit | `npm run test -- transforms-project` | Partial — `transforms-project.test.ts` may not cover this specifically |

### Sampling Rate
- **Per task commit:** `npm run test`
- **Per wave merge:** `npm run test:coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/modules/projects/__tests__/DynamicHero.test.tsx` — covers ENRICH-03 (whyItMatters vs description fallback for P1 and P3)
- [ ] Add `computeContentHash` hash function test in `transforms-project.test.ts` or a new `fetch-project-tasks.test.ts` — covers ENRICH-01 hash logic (can be extracted to a pure utility)

*(Existing `memory-access.test.ts` already covers the `isMemoryOperator` gate — no new test needed for ENRICH-02 gating)*

---

## Project Constraints (from CLAUDE.md)

| Constraint | Applies To Phase 3? |
|-----------|----------------------|
| All UI text in German | Yes — button label "Neu generieren", toast messages in German |
| Components < 150 lines | Yes — StepOverviewTab currently 93 lines; adding operator button must keep it under 150 |
| `shadcn/ui` for new UI primitives | Yes — if operator button needs a loading spinner, use shadcn Button with loading state |
| `sonner` for toasts (`import { toast } from "sonner"`) | Yes — ENRICH-02 success/error feedback |
| `@hugeicons/react` for icons | Yes — if operator button has an icon, use Hugeicons |
| Edge Functions proxy ALL ClickUp calls | Not applicable — Phase 3 Edge Function changes don't touch ClickUp writes |
| `ContentContainer width="narrow"` on all app pages | Not applicable — no new pages |
| Architecture Rule 4: top-level columns override raw_data | Not applicable — no task_cache changes |
| Post-code review: `node scripts/openrouter-review.cjs` | Yes — standard review step after implementation |

---

## Sources

### Primary (HIGH confidence)

- Direct source reading of `supabase/functions/fetch-project-tasks/index.ts` — full current enrichment implementation, upsert pattern, timeout values, AI call structure
- Direct source reading of `src/modules/projects/lib/transforms-project.ts` — `parseMilestoneOrder`, `extractMilestoneOrder`, enrichmentMap, sort logic
- Direct source reading of `src/modules/projects/components/overview/DynamicHero.tsx` — exact line numbers for description fields (lines 49, 89)
- Direct source reading of `src/modules/projects/components/steps/StepOverviewTab.tsx` — current structure, ExpandableSection component
- Direct source reading of `src/modules/projects/lib/memory-access.ts` — `isMemoryOperator` pattern
- Direct source reading of `archive/legacy-reference/schema_projects.sql` — `step_enrichment` table DDL (confirmed columns: id, clickup_task_id, why_it_matters, what_becomes_fixed, sort_order, created_at, updated_at)
- Direct source reading of `src/modules/projects/types/project.ts` — `StepEnrichmentRow` interface, `Step` interface, `ProjectAttentionItem`
- Direct source reading of `src/modules/projects/hooks/useProject.ts` — background refresh pattern, `supabase.functions.invoke` usage, queryClient.invalidateQueries
- Direct source reading of `scripts/openrouter-review.cjs` — OpenRouter endpoint, auth headers (`Bearer`, `HTTP-Referer`, `X-Title`), response shape (`data.choices[0].message.content`)
- Deno built-in `crypto.subtle` — available in all Deno environments including Supabase Edge Functions, no import needed

### Secondary (MEDIUM confidence)
- `docs/audits/projects-module-audit.md` sections 3.2.1–3.2.5 — verified source-of-truth for findings that CONTEXT.md decisions are based on
- `CLAUDE.md` — project constraints verified against all planned changes

### Tertiary (LOW confidence)
- None — all findings are from direct source code reading

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified in existing source code
- Architecture: HIGH — all patterns derived from existing working code in the same function/module
- Pitfalls: HIGH — pitfalls derived from direct reading of the bug (ignoreDuplicates, Anthropic response shape) rather than speculation
- DB migration: HIGH — step_enrichment schema confirmed from schema_projects.sql

**Research date:** 2026-03-29
**Valid until:** 2026-04-29 (stable stack — OpenRouter API, Supabase Deno runtime, React 19 + Vitest patterns do not change frequently)
