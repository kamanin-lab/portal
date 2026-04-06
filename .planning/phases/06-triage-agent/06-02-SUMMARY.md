---
phase: 06-triage-agent
plan: "02"
subsystem: backend
tags: [agent, edge-functions, openrouter, clickup, deno, triage]

# Dependency graph
requires:
  - phase: 06-01
    provides:
      - agent_jobs table schema + RLS
      - supabase/functions/_shared/skills/triage_agent.md
      - supabase/functions/_shared/wp-audit.ts
provides:
  - supabase/functions/triage-agent/index.ts (complete Deno Edge Function)
  - AI triage pipeline: TriageInput → OpenRouter Haiku → [Triage] ClickUp comment → agent_jobs status
affects:
  - supabase/functions/clickup-webhook/index.ts (06-03 will invoke triage-agent)
  - supabase/functions/clickup-webhook/index.ts (06-03 will add HITL detection)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Local fetchWithTimeout (AbortController + setTimeout) — not shared, defined per-function
    - OpenRouter call pattern with required KAMANIN headers (HTTP-Referer, X-Title)
    - JSON parse with one retry (assistant message as constraint injection)
    - Always-terminal agent_jobs update (never left as 'running')
    - Global try/catch wrapper returning 200 (ClickUp must always get 200)
    - Service-role Supabase client in all Edge Functions (never anon key)
    - Deno.readTextFile with import.meta.url for skill file path resolution

key-files:
  created:
    - supabase/functions/triage-agent/index.ts
  modified: []

key-decisions:
  - "OPENROUTER_API_KEY used exclusively — zero references to ANTHROPIC_API_KEY in this function"
  - "callOpenRouter extracted as inner helper to avoid repeating 30s fetchWithTimeout headers twice (first call + retry)"
  - "parseTriageResponse extracted as inner helper — returns { parsed, inputTokens, outputTokens } for additive token accumulation across retry"
  - "Global error handler catches any unhandled exception, updates job to failed, returns 200 (ClickUp compatibility)"
  - "OPENROUTER_API_KEY absence handled as early CONFIG_ERROR failure (updates job to failed before returning)"

patterns-established:
  - "Retry pattern: base messages + assistant prefill 'Return ONLY valid JSON' as second attempt"
  - "Comment format: [Triage] prefix required — webhook HITL detection (Plan 06-03) uses this prefix"
  - "auditFetched flag tracks whether WP audit succeeded — shown in comment footer when true"
  - "cost_usd = inputTokens * 0.8/1M + outputTokens * 4.0/1M (Haiku pricing approximation)"

requirements-completed:
  - TRIAGE-02
  - TRIAGE-04

# Metrics
duration: 2min
completed: "2026-04-06"
---

# Phase 06 Plan 02: Triage Agent Edge Function Summary

**Complete Deno Edge Function: receives TriageInput, fetches optional WP audit, calls Claude Haiku via OpenRouter, posts structured [Triage] estimate comment to ClickUp, updates agent_jobs to awaiting_hitl or failed.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-06T20:41:28Z
- **Completed:** 2026-04-06T20:43:21Z
- **Tasks:** 1 of 1
- **Files created:** 1

## Accomplishments

- Full AI triage pipeline in a single 435-line Deno Edge Function
- OpenRouter-only (Claude Haiku): first call + JSON retry with explicit constraint injection
- WordPress site audit integration: non-blocking, null-safe, profile-driven WP MCP URL lookup
- agent_jobs always reaches terminal status — three failure paths all handled (config error, double JSON fail, ClickUp POST fail)
- [Triage] ClickUp comment with HITL instructions appended (enables Plan 06-03 HITL detection)
- Cost tracking: Haiku input + output token pricing accumulated across first call and retry

## Task Commits

1. **Task 1: Create triage-agent/index.ts Edge Function** - `8677f3e` (feat)

## Files Created/Modified

- `supabase/functions/triage-agent/index.ts` — Main Deno Edge Function: validates TriageInput, creates agent_jobs row, fetches WP audit, calls OpenRouter, posts [Triage] comment to ClickUp, updates agent_jobs to terminal status

## Decisions Made

- `callOpenRouter` extracted as inner helper (avoids repeating fetch headers in first call and retry)
- `parseTriageResponse` extracted as inner helper returning `{ parsed, inputTokens, outputTokens }` to support additive token accumulation across retry
- Global try/catch at outer handler level always returns HTTP 200 (ClickUp requires 200 even on failures)
- OPENROUTER_API_KEY absence is an early-exit CONFIG_ERROR (updates job to failed before returning 200)
- auditFetched flag stored in agent_jobs column and shown in comment footer only when true

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria met.

## Known Stubs

None — the function is a complete implementation. WordPress audit path returns null gracefully when credentials or URL are absent, but this is correct null-safe behavior (not a stub).

## Issues Encountered

None.

## User Setup Required

New env vars needed before `triage-agent` can be used in production:
- `TRIAGE_ENABLED_LIST_IDS` — comma-separated ClickUp list IDs (added by Plan 06-03)
- `WP_MCP_USER` — WordPress Application Password username (for WP audit)
- `WP_MCP_APP_PASS` — WordPress Application Password value (for WP audit)
- `OPENROUTER_API_KEY` — already exists in production (shared with fetch-project-tasks)
- `CLICKUP_API_TOKEN` — already exists in production

The function is deployable now but only invokable after Plan 06-03 wires the webhook.

## Next Phase Readiness

- `supabase/functions/triage-agent/index.ts` is complete and deployable
- Plan 06-03 (clickup-webhook extension) can now:
  1. Detect `taskCreated` events for monitored list IDs
  2. Fetch task details from ClickUp API
  3. Invoke `triage-agent` fire-and-forget (supabase.functions.invoke)
  4. Detect HITL replies (`[approve]`/`[reject]`) in `taskCommentPosted` handler
- No blockers for Plan 06-03

## Self-Check: PASSED

Files created:
- [x] supabase/functions/triage-agent/index.ts — EXISTS (435 lines)

Acceptance criteria verified:
- [x] openrouter.ai/api/v1/chat/completions endpoint present
- [x] OPENROUTER_API_KEY used (not ANTHROPIC_API_KEY)
- [x] anthropic/claude-haiku-4-5 model string present
- [x] [Triage] prefix in comment text
- [x] awaiting_hitl status path
- [x] status: 'failed' in 3+ places (config error, JSON fail, ClickUp fail, unhandled error)
- [x] fetchWpSiteAudit and formatAuditForPrompt imported and used
- [x] INPUT_COST_PER_TOKEN and OUTPUT_COST_PER_TOKEN constants
- [x] "Return ONLY valid JSON" retry instruction
- [x] SUPABASE_SERVICE_ROLE_KEY used (not SUPABASE_ANON_KEY)
- [x] triage_agent.md read via Deno.readTextFile with correct relative path

Commits verified:
- [x] 8677f3e — feat(06-02): create triage-agent Edge Function

---
*Phase: 06-triage-agent*
*Completed: 2026-04-06*
