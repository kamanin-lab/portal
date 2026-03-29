# Phase 3: AI Enrichment - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the AI enrichment lifecycle so enrichment stays current when ClickUp tasks change, surface enrichment content in the DynamicHero card, populate sort_order from milestone_order, and provide an operator button to force re-enrichment. No new enrichment fields — work with existing `why_it_matters` and `what_becomes_fixed`.

</domain>

<decisions>
## Implementation Decisions

### Re-enrichment Change Detection (ENRICH-01)
- **D-01:** Hash both task `name` AND `description` to detect changes. Store hash in a new `content_hash` column on `step_enrichment`.
- **D-02:** On sync, compare current hash with stored hash. If different → include task in re-enrichment batch (overwrite existing enrichment).
- **D-03:** Change the `ignoreDuplicates: true` upsert to a full upsert (update on conflict) so re-enrichment actually overwrites stale content.
- **D-04:** Add `last_enriched_at` timestamp column to `step_enrichment` for debugging/auditing.

### AI Model Switch (CRITICAL)
- **D-05:** Switch enrichment from Claude Haiku (`ANTHROPIC_API_KEY`) to GPT-4o-mini via OpenRouter (`OPENROUTER_API_KEY`). OpenRouter endpoint: `https://openrouter.ai/api/v1/chat/completions`. Model: `openai/gpt-4o-mini`.
- **D-06:** `OPENROUTER_API_KEY` must be added to Coolify Supabase env vars manually (prerequisite, not automated). Plan should include a prerequisite note.
- **D-07:** Remove the `ANTHROPIC_API_KEY` dependency from `fetch-project-tasks`. The key may still be used by other functions — only remove from the enrichment call path.

### Admin Re-enrichment UI (ENRICH-02)
- **D-08:** Claude's Discretion — the audit recommends a "Neu generieren" button on StepOverviewTab gated by `VITE_MEMORY_OPERATOR_EMAILS`. Exact placement and UX are up to Claude.

### DynamicHero Enrichment Display (ENRICH-03)
- **D-09:** When enrichment exists, `whyItMatters` replaces `step.description` in the DynamicHero card. Fallback to raw ClickUp description when no enrichment.
- **D-10:** Claude's Discretion on which hero priority levels (P1 client review, P3 upcoming) show enrichment vs. raw description. Both are reasonable candidates.

### sort_order Population (ENRICH-04)
- **D-11:** Edge Function (`fetch-project-tasks`) extracts `milestone_order` from ClickUp custom field and writes it to `step_enrichment.sort_order` during upsert. Single source of truth at sync time.
- **D-12:** The transform already sorts by `enrichment.sort_order` (falling back to 999, then name) — no frontend change needed for ordering once Edge Function populates the field.

### Claude's Discretion
- Exact placement of "Neu generieren" admin button (StepOverviewTab recommended by audit)
- Which DynamicHero priority levels get enrichment text (P1 and/or P3)
- OpenRouter API call structure (compatible with OpenAI chat completions format)
- Whether to batch re-enrichment calls or process individually
- Error handling strategy for OpenRouter failures (existing pattern: warn + skip)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Audit Document (PRD)
- `docs/audits/projects-module-audit.md` — Section 3.2 (AI Enrichment Limitations), Phase B implementation plan

### Edge Function (enrichment pipeline)
- `supabase/functions/fetch-project-tasks/index.ts` — `generateStepEnrichment()` function (lines 148-207), enrichment upsert (lines 411-438), enrichedTaskIds check (lines 305-308)

### Transform Layer (enrichment consumption)
- `src/modules/projects/lib/transforms-project.ts` — enrichmentMap construction (line 108), sort_order sorting (lines 125-132), whyItMatters/whatBecomesFixed mapping (lines 161-162)

### Frontend Components
- `src/modules/projects/components/overview/DynamicHero.tsx` — hero card description display (lines 49, 89)
- `src/modules/projects/components/steps/StepOverviewTab.tsx` — enrichment section rendering, admin button target

### Types
- `src/modules/projects/types/project.ts` — Step interface (whyItMatters, whatBecomesFixed, milestoneOrder fields)

### Existing Patterns
- `scripts/openrouter-review.cjs` — Reference for OpenRouter API key loading pattern from `.env.local`

### Database
- `docs/system-context/DATABASE_SCHEMA.md` — step_enrichment table schema

### ClickUp Integration
- `supabase/functions/_shared/clickup-contract.ts` — Custom field extraction helpers

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `generateStepEnrichment()` in fetch-project-tasks — current AI enrichment generator, needs model swap + hash logic
- `extractMilestoneOrder()` / `parseMilestoneOrder()` in transforms-project.ts — already parses milestone_order from ClickUp raw_data custom fields
- `VITE_MEMORY_OPERATOR_EMAILS` env var pattern — used in ProjectContextAdminPanel for operator-only features
- `fetchWithTimeout()` / `fetchWithRetry()` — existing retry logic in fetch-project-tasks for API calls

### Established Patterns
- Edge Function enrichment: batch by 10, upsert to step_enrichment table, service role client for writes
- Transform layer: enrichmentMap (Map<clickup_task_id, StepEnrichmentRow>), sorted chapters → sorted steps within chapters
- Admin gating: check user email against VITE_MEMORY_OPERATOR_EMAILS list, show/hide UI accordingly

### Integration Points
- `step_enrichment` table: new columns needed (content_hash, last_enriched_at)
- `fetch-project-tasks` Edge Function: swap AI call, add hash comparison, write sort_order
- `DynamicHero.tsx`: use step.whyItMatters instead of step.description (with fallback)
- `StepOverviewTab.tsx`: add operator-only re-enrichment button

</code_context>

<specifics>
## Specific Ideas

- The audit specifically recommends "Neu generieren" button text (German) for the re-enrichment trigger
- OpenRouter uses the OpenAI-compatible chat completions format — the prompt structure from Claude Haiku needs adapting to messages format
- The existing enrichment prompt is already in German — keep it in German for GPT-4o-mini
- `ignoreDuplicates: true` on the current upsert is the root cause of write-once behavior — changing to a proper upsert fixes ENRICH-01

</specifics>

<deferred>
## Deferred Ideas

- ClickUp webhook-triggered enrichment refresh — manual + sync-time is sufficient for now (Out of Scope per REQUIREMENTS.md)
- AI model upgrade beyond GPT-4o-mini — current model proven reliable
- Enrichment quality scoring or confidence metrics — no client demand

</deferred>

---

*Phase: 03-ai-enrichment*
*Context gathered: 2026-03-29*
