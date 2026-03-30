---
phase: 3
slug: ai-enrichment
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test:coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test:coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | ENRICH-01 | unit | `npm run test -- computeContentHash` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | ENRICH-01 | integration | Manual — Supabase upsert verification | N/A | ⬜ pending |
| 03-02-01 | 02 | 2 | ENRICH-03 | unit | `npm run test -- DynamicHero` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | ENRICH-04 | unit | `npm run test -- extractMilestoneOrder` | Partial | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `src/modules/projects/__tests__/DynamicHero.test.tsx` — stubs for ENRICH-03 (whyItMatters vs description fallback)
- [ ] Add `computeContentHash` test in Edge Function test or utility test — covers ENRICH-01 hash logic

*Existing `memory-access.test.ts` covers isMemoryOperator gate — no new test needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Upsert overwrites existing enrichment on content change | ENRICH-01 | Requires live Supabase DB + Edge Function invocation | 1. Change task name in ClickUp 2. Trigger sync 3. Verify step_enrichment row updated |
| OPENROUTER_API_KEY env var present in Coolify | ENRICH-01 | Infrastructure prerequisite | Check Coolify dashboard → Supabase service → env vars |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
