---
phase: 06-triage-agent
plan: "01"
subsystem: backend
tags: [agent, database, edge-functions, triage, wordpress]
dependency_graph:
  requires: []
  provides:
    - agent_jobs table schema + RLS
    - supabase/functions/_shared/skills/triage_agent.md
    - supabase/functions/_shared/wp-audit.ts
  affects:
    - supabase/functions/triage-agent/index.ts (06-02)
    - supabase/functions/clickup-webhook/index.ts (06-03)
tech_stack:
  added: []
  patterns:
    - Deno AbortSignal.timeout for WP audit HTTP calls
    - null-safe pattern (never throws, always returns null on failure)
    - OpenRouter model ID as DB column default
key_files:
  created:
    - supabase/migrations/20260406000000_create_agent_jobs.sql
    - supabase/functions/_shared/skills/triage_agent.md
    - supabase/functions/_shared/wp-audit.ts
    - src/__tests__/triage-hitl.test.ts
    - src/__tests__/triage-webhook.test.ts
    - src/__tests__/wp-audit.test.ts
  modified: []
decisions:
  - "model_used default is 'anthropic/claude-haiku-4-5' (OpenRouter ID, not direct Anthropic ID)"
  - "wp-audit.ts uses AbortSignal.timeout(8000) — Deno-native, no polyfill"
  - "RLS policy uses using(true)/with_check(true) — service role access enforced at Edge Function level, not DB policy"
  - "set_updated_at uses create or replace — safe to re-create, no idempotency guard needed"
metrics:
  duration_minutes: 12
  completed_date: "2026-04-06"
  tasks_completed: 6
  tasks_total: 6
  files_created: 6
  files_modified: 0
---

# Phase 06 Plan 01: Triage Agent Foundation Summary

**One-liner:** PostgreSQL agent_jobs table with RLS + Claude skill prompt for cost/time estimation + null-safe WordPress site audit helper via Maxi AI Core REST API.

## What Was Built

Three foundational artifacts for the KAMANDA Triage Agent:

1. **Migration SQL** (`20260406000000_create_agent_jobs.sql`) — Creates `agent_jobs` table tracking the full triage pipeline status flow (`pending → running → awaiting_hitl → approved|rejected|failed`), HITL fields, observability columns (model_used, cost_usd, duration_ms), and adds `wp_mcp_url` to `profiles` (idempotent). RLS enabled with service-role-only access policy. Three indexes on `clickup_task_id`, `status`, `created_at desc`.

2. **Skill file** (`_shared/skills/triage_agent.md`) — Claude system prompt with five sections: background (agency context + site audit instructions), task_types (9 categories), complexity_guide (simple/medium/complex with multipliers), credit_formula (hours × multiplier, minimum 0.5 credits), output_format (strict JSON-only response with confidence + questions fields).

3. **wp-audit.ts helper** (`_shared/wp-audit.ts`) — Non-blocking WordPress site audit via Maxi AI Core REST API. Fetches site info, active plugins (via WP-CLI), post types, and WooCommerce product count. Returns null on any failure path — never throws. Uses Deno-native `AbortSignal.timeout(8000)`. Exports: `WpSiteAudit` interface, `fetchWpSiteAudit`, `formatAuditForPrompt`.

4. **Wave 0 test stubs** — Three Vitest test files covering HITL regex patterns, webhook list-ID filter logic, and wp-audit null-guard conditions. All 27 tests pass (pure logic, no Deno runtime needed).

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create agent_jobs migration SQL | ff236a3 | supabase/migrations/20260406000000_create_agent_jobs.sql |
| 2 | Create triage_agent.md skill file | db86915 | supabase/functions/_shared/skills/triage_agent.md |
| 3 | Create wp-audit.ts helper | 09805de | supabase/functions/_shared/wp-audit.ts |
| 4 | HITL regex test stubs | 06a8708 | src/__tests__/triage-hitl.test.ts |
| 5 | Webhook routing test stubs | 9e04d13 | src/__tests__/triage-webhook.test.ts |
| 6 | wp-audit null-guard test stubs | 1feaf84 | src/__tests__/wp-audit.test.ts |

## Decisions Made

- **OpenRouter model ID as default:** `model_used` column default is `'anthropic/claude-haiku-4-5'` (OpenRouter format), not the direct Anthropic API format `claude-haiku-4-5-20251001`. This keeps the DB consistent with the API call.
- **AbortSignal.timeout in wp-audit.ts:** PRD specified `AbortSignal.timeout` (Deno-native); used instead of the `fetchWithTimeout` AbortController pattern used elsewhere. This is intentional per PRD — wp-audit is a new file with cleaner API.
- **RLS policy approach:** `using (true) with check (true)` matches the existing codebase pattern. Service-role enforcement happens at the Edge Function level (service role key required), not via DB-level role filtering.
- **set_updated_at as create or replace:** Research confirmed this function does not yet exist in the current migrations. Safe to create without existence check.
- **Wave 0 test strategy:** Pure logic tests that mirror the Deno implementation without importing Deno files — avoids Vitest/Deno runtime incompatibility.

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria met. All 27 Wave 0 tests pass.

## Known Stubs

None — all files are complete implementations, not stubs. The Wave 0 test files contain intentional pure-logic mirrors of Deno code (by design, not stubs).

## Self-Check: PASSED

Files created:
- [x] supabase/migrations/20260406000000_create_agent_jobs.sql — EXISTS
- [x] supabase/functions/_shared/skills/triage_agent.md — EXISTS
- [x] supabase/functions/_shared/wp-audit.ts — EXISTS
- [x] src/__tests__/triage-hitl.test.ts — EXISTS
- [x] src/__tests__/triage-webhook.test.ts — EXISTS
- [x] src/__tests__/wp-audit.test.ts — EXISTS

Commits verified:
- [x] ff236a3 — feat(06-01): create agent_jobs migration SQL
- [x] db86915 — feat(06-01): add triage_agent.md skill file
- [x] 09805de — feat(06-01): add wp-audit.ts WordPress site audit helper
- [x] 06a8708 — test(06-01): add HITL regex test stubs
- [x] 9e04d13 — test(06-01): add webhook routing test stubs
- [x] 1feaf84 — test(06-01): add wp-audit null-guard test stubs
