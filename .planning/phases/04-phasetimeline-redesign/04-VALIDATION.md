---
phase: 4
slug: phasetimeline-redesign
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-29
---

# Phase 4 — Validation Strategy

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
| 04-00-01 | 00 | 0 | ALL | scaffold | `npm run test -- PhaseTimeline` | Created in W0 | ⬜ pending |
| 04-01-01 | 01 | 1 | TIMELINE-01, TIMELINE-02 | unit | `npm run test -- PhaseTimeline` | ✅ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | TIMELINE-01, TIMELINE-03, TIMELINE-05 | unit | `npm run test -- PhaseTimeline` | ✅ W0 | ⬜ pending |
| 04-02-01 | 02 | 2 | ALL | unit | `npm run test -- PhaseTimeline` | ✅ W0 | ⬜ pending |
| 04-02-02 | 02 | 2 | TIMELINE-01 thru TIMELINE-05 | unit | `npm run test -- PhaseTimeline` | ✅ W0 | ⬜ pending |
| 04-02-03 | 02 | 2 | TIMELINE-03 | visual | Manual -- Motion spring transitions | N/A | ⬜ pending |

---

## Wave 0 Requirements

- [x] `src/modules/projects/__tests__/PhaseTimeline.test.tsx` -- created in Plan 00 with test.todo stubs for TIMELINE-01 through TIMELINE-05
- [x] Mock setup for `motion/react` -- AnimatePresence does not animate in jsdom; tests check rendered structure/aria, not animation values
- [x] Mock setup for `@radix-ui/react-tooltip` -- renders children directly for content verification
- [x] Mock setup for `useBreakpoint` -- toggleable between desktop and mobile modes

*Wave 0 plan (04-00-PLAN.md) creates the test scaffold before any implementation begins.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Motion spring transitions smooth | TIMELINE-03 | Visual animation quality cannot be unit tested | Open project, click through phases, verify no instant jumps |
| Mobile prev/next navigation feel | TIMELINE-04 | Requires actual mobile viewport interaction | Open on phone or use browser DevTools mobile, tap navigation |

**Note:** TIMELINE-03 has an automated proxy test in Plan 02 Task 1 that verifies AnimatePresence renders state labels correctly. The manual verification covers visual spring quality, which the proxy cannot assess.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (post-revision)
