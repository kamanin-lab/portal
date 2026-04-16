---
phase: 6
slug: triage-agent
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (installed, `vitest.config.ts` at root) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test:coverage` |
| **Estimated runtime** | ~10 seconds |

**Note:** Vitest runs against `src/**/*.{test,spec}.{ts,tsx}` only — it does NOT execute Deno Edge Function code. TRIAGE-01, TRIAGE-02, TRIAGE-06 are manual-only (DB/API/file inspection). TRIAGE-03, TRIAGE-04, TRIAGE-05 have unit-testable logic extracted into `src/__tests__/`.

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test:coverage`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | TRIAGE-01 | manual-only | SQL inspection via Supabase dashboard | n/a | ⬜ pending |
| 06-01-02 | 01 | 1 | TRIAGE-04 | manual-only | File inspection: `ls supabase/functions/_shared/skills/triage_agent.md` | n/a | ⬜ pending |
| 06-01-03 | 01 | 1 | TRIAGE-04 | unit | `npm run test -- src/__tests__/wp-audit.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | TRIAGE-02 | manual-only (integration) | `supabase functions serve triage-agent` locally | n/a | ⬜ pending |
| 06-03-01 | 03 | 3 | TRIAGE-03 | unit | `npm run test -- src/__tests__/triage-webhook.test.ts` | ❌ W0 | ⬜ pending |
| 06-03-02 | 03 | 3 | TRIAGE-05 | unit | `npm run test -- src/__tests__/triage-hitl.test.ts` | ❌ W0 | ⬜ pending |
| 06-03-03 | 03 | 3 | TRIAGE-03 | manual-only | File inspection: `grep -n "handleTaskCreated\|handleTriageHitl" supabase/functions/clickup-webhook/index.ts` | n/a | ⬜ pending |
| 06-04-01 | 04 | 4 | TRIAGE-06 | manual-only | `grep "TRIAGE_ENABLED_LIST_IDS\|WP_MCP_USER\|WP_MCP_APP_PASS" supabase/functions/.env.example` | n/a | ⬜ pending |
| 06-04-02 | 04 | 4 | TRIAGE-06 | manual-only | File inspection: `ls docs/agent-setup/triage-agent-setup.md` | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/triage-hitl.test.ts` — HITL regex pattern tests for TRIAGE-05 (pure string matching, no external deps)
- [ ] `src/__tests__/triage-webhook.test.ts` — list filter + taskCreated routing logic for TRIAGE-03
- [ ] `src/__tests__/wp-audit.test.ts` — `fetchWpSiteAudit` null-return behavior (fetch mock) for TRIAGE-04

*(Existing `src/test/setup.ts` and `src/__tests__/clickup-contract.test.ts` are sufficient infrastructure — no new conftest/setup needed)*

**Wave 0 must be completed in Plan 06-01 or as a separate Wave 0 plan before Plan 06-02 executes.**

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| DB migration creates `agent_jobs` table with correct schema | TRIAGE-01 | Requires live DB connection, not testable in jsdom | Check Supabase table editor: verify columns (id, clickup_task_id, status check constraint, output jsonb, hitl_action check, model_used default 'anthropic/claude-haiku-4-5') |
| triage-agent calls OpenRouter and posts [Triage] comment | TRIAGE-02 | Full E2E requires live OpenRouter key + ClickUp task | Run `supabase functions serve`, create test task in monitored list, verify comment appears in ClickUp within 15s |
| wp_mcp_url set → site context line appears | TRIAGE-04 | Requires live WordPress site with Maxi AI Core | Set wp_mcp_url for test profile, create task, verify comment contains "Site context:" line |
| .env.example contains all required secrets | TRIAGE-06 | File content check, no logic | `grep -c "TRIAGE_ENABLED_LIST_IDS\|WP_MCP_USER\|WP_MCP_APP_PASS\|OPENROUTER_API_KEY" supabase/functions/.env.example` → expect 4 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (triage-hitl.test.ts, triage-webhook.test.ts, wp-audit.test.ts)
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
