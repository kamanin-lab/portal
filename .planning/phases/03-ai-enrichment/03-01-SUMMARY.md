---
phase: 03-ai-enrichment
plan: "01"
subsystem: projects-module
tags:
  - ai-enrichment
  - edge-functions
  - openrouter
  - supabase
  - tdd
dependency_graph:
  requires: []
  provides:
    - step_enrichment.content_hash (change detection column)
    - step_enrichment.last_enriched_at (timestamp column)
    - OpenRouter GPT-4o-mini enrichment pipeline
    - hash-based re-enrichment on task content change
    - sort_order populated from milestone_order ClickUp field
    - DynamicHero P1/P3 AI enrichment display
  affects:
    - supabase/functions/fetch-project-tasks/index.ts
    - src/modules/projects/types/project.ts
    - src/modules/projects/components/overview/DynamicHero.tsx
tech_stack:
  added:
    - OpenRouter API (GPT-4o-mini via https://openrouter.ai/api/v1/chat/completions)
    - Web Crypto API (crypto.subtle.digest SHA-256) for content hashing
  patterns:
    - Hash-based change detection (content_hash comparison before AI call)
    - TDD (RED then GREEN) for DynamicHero enrichment display
    - Full upsert on conflict (replaces write-once ignoreDuplicates pattern)
key_files:
  created:
    - supabase/migrations/20260329_step_enrichment_change_detection.sql
    - src/modules/projects/__tests__/DynamicHero.test.tsx
  modified:
    - src/modules/projects/types/project.ts (StepEnrichmentRow interface)
    - supabase/functions/fetch-project-tasks/index.ts (full enrichment pipeline rewrite)
    - src/modules/projects/components/overview/DynamicHero.tsx (whyItMatters fallback)
    - src/modules/projects/__tests__/overview-interpretation.test.ts (fixture update)
    - src/modules/projects/__tests__/transforms-project.test.ts (fixture update)
decisions:
  - "Use OpenRouter GPT-4o-mini instead of Anthropic Claude Haiku per user decision (D-05, D-07)"
  - "content_hash = first 32 hex chars of SHA-256(name::description) — sufficient for change detection"
  - "parseMilestoneOrder duplicated in Edge Function (cannot import from src/)"
  - "sort_order updated for ALL tasks at sync time, not just re-enriched ones"
metrics:
  duration_seconds: 441
  completed_date: "2026-03-29"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 7
---

# Phase 03 Plan 01: AI Enrichment Lifecycle Fix Summary

**One-liner:** Hash-based re-enrichment with GPT-4o-mini via OpenRouter, sort_order from milestone_order, and DynamicHero AI text surfacing with description fallback.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | DB migration and StepEnrichmentRow type update | df09b1e | `supabase/migrations/20260329_step_enrichment_change_detection.sql`, `src/modules/projects/types/project.ts` |
| 2 | Edge Function overhaul | 6b88fe3 | `supabase/functions/fetch-project-tasks/index.ts` |
| 3 (RED) | DynamicHero failing tests | 6ace64f | `src/modules/projects/__tests__/DynamicHero.test.tsx` |
| 3 (GREEN) | DynamicHero enrichment display | 7fe3419 | `src/modules/projects/components/overview/DynamicHero.tsx` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed existing test fixtures missing new StepEnrichmentRow fields**
- **Found during:** Task 1 (after adding `content_hash` and `last_enriched_at` to interface)
- **Issue:** TypeScript build failed — `overview-interpretation.test.ts` and `transforms-project.test.ts` had inline `StepEnrichmentRow` objects without the new required fields
- **Fix:** Added `content_hash: null` and `last_enriched_at: null` to both test fixtures in both files
- **Files modified:** `src/modules/projects/__tests__/overview-interpretation.test.ts`, `src/modules/projects/__tests__/transforms-project.test.ts`
- **Commit:** df09b1e

## Success Criteria Verification

- [x] Edge Function generates fresh AI enrichment when task name or description changes (hash-based detection via `computeContentHash` + `enrichmentHashMap`)
- [x] AI enrichment uses GPT-4o-mini via OpenRouter (not Claude Haiku via Anthropic)
- [x] step_enrichment.sort_order is populated from milestone_order ClickUp custom field at sync time
- [x] Upsert overwrites existing enrichment rows on conflict (no ignoreDuplicates)
- [x] DynamicHero P1 and P3 cards show AI whyItMatters text with description fallback
- [x] All tests pass (4 new DynamicHero tests pass, 80 existing tests pass), build succeeds

## Known Stubs

None — all functionality is wired end-to-end.

## Deferred Issues

- `src/modules/tickets/__tests__/support-chat.test.tsx` — 2 pre-existing test failures (unrelated to this plan, existed before changes). Out of scope.

## Self-Check: PASSED
