# Phase 3: AI Enrichment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 03-ai-enrichment
**Areas discussed:** Re-enrichment trigger, DynamicHero enrichment display, sort_order population

---

## Re-enrichment trigger

### Q1: What should trigger re-enrichment when a task changes?

| Option | Description | Selected |
|--------|-------------|----------|
| Hash name + description | Re-enrich when either task name OR description changes. Catches all meaningful content edits. | ✓ |
| Hash name only | Re-enrich only when task name changes. Simpler, cheaper, but misses description edits. | |
| You decide | Claude picks the best approach. | |

**User's choice:** Hash name + description
**Notes:** User added critical requirement — switch from Claude Haiku to GPT-4o-mini via OpenRouter. OpenRouter API key already exists in the project (.env.local). Do NOT use Anthropic API for enrichment.

### Q2: Where is the OPENROUTER_API_KEY for Edge Functions?

| Option | Description | Selected |
|--------|-------------|----------|
| Already on Coolify | Key already set as env var on Coolify Supabase service. | |
| Need to add it | Will add manually. Plan should note this as prerequisite. | ✓ |

**User's choice:** Need to add it
**Notes:** Manual Coolify env var setup required before deployment.

---

## DynamicHero enrichment display

### Q3: What should DynamicHero show when enrichment exists?

| Option | Description | Selected |
|--------|-------------|----------|
| whyItMatters replaces description | Show AI-generated text instead of raw ClickUp description. Falls back when no enrichment. | ✓ |
| whyItMatters first, description fallback | Same logic but with explicit fallback code. | |
| Show both | Show whyItMatters as main text + ClickUp description below. | |

**User's choice:** whyItMatters replaces description

### Q4: Which hero priority levels should show enrichment?

| Option | Description | Selected |
|--------|-------------|----------|
| Both P1 and P3 | Show whyItMatters on both client review and upcoming step cards. | |
| P1 only | Only primary attention card shows whyItMatters. | |
| You decide | Claude picks based on UX. | ✓ |

**User's choice:** You decide

---

## sort_order population

### Q5: Where should milestone_order → sort_order mapping happen?

| Option | Description | Selected |
|--------|-------------|----------|
| Edge Function writes at sync | fetch-project-tasks writes milestone_order to step_enrichment.sort_order. Single source of truth. | ✓ |
| You decide | Claude picks approach that fits architecture. | |

**User's choice:** Edge Function writes at sync

---

## Claude's Discretion

- Admin re-enrichment button placement and UX (ENRICH-02) — skipped by user, audit recommends StepOverviewTab
- DynamicHero priority level selection for enrichment text (P1 vs P3 vs both)
- OpenRouter API call structure details
- Batching and error handling for re-enrichment

## Deferred Ideas

None — discussion stayed within phase scope.
