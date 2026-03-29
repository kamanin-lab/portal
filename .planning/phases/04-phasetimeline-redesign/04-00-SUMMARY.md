---
phase: 04-phasetimeline-redesign
plan: "00"
subsystem: testing
tags: [vitest, react-testing-library, phasetimeline, motion, radix-ui]

requires: []
provides:
  - PhaseTimeline.test.tsx with 10 test.todo stubs covering TIMELINE-01 through TIMELINE-05
  - Mock setup for useBreakpoint, motion/react, @radix-ui/react-tooltip
  - makeProject/makeChapter/makeStep factory functions for PhaseTimeline tests
affects:
  - 04-phasetimeline-redesign/04-01
  - 04-phasetimeline-redesign/04-02

tech-stack:
  added: []
  patterns:
    - "test.todo stubs as Wave 0 behavioral contract (RED state before implementation)"
    - "filterMotionProps helper strips motion-specific props from DOM elements in tests"
    - "makeProject factory with 4-chapter structure covering completed/current/upcoming states"

key-files:
  created:
    - src/modules/projects/__tests__/PhaseTimeline.test.tsx
  modified: []

key-decisions:
  - "All 10 stubs use test.todo (not test.skip) so vitest reports them as pending-todo, not skipped — clearer RED signal"
  - "filterMotionProps helper extracted as named function to avoid DOM prop warnings when motion mock spreads props"

patterns-established:
  - "Wave 0 test scaffold pattern: stubs-first file created before any component implementation"
  - "motion/react mock: motion.div/span strip animation props via filterMotionProps, AnimatePresence renders children directly"

requirements-completed: [TIMELINE-01, TIMELINE-02, TIMELINE-03, TIMELINE-04, TIMELINE-05]

duration: 5min
completed: 2026-03-29
---

# Phase 04 Plan 00: PhaseTimeline Test Scaffold Summary

**Wave 0 test scaffold with 10 test.todo stubs covering all 5 TIMELINE requirements — mocks for motion/react, useBreakpoint, and @radix-ui/react-tooltip, plus makeProject/makeChapter/makeStep factories**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-29T19:20:50Z
- **Completed:** 2026-03-29T19:21:50Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `PhaseTimeline.test.tsx` with complete mock infrastructure for jsdom environment
- Implemented `filterMotionProps` helper to prevent DOM prop warnings when motion mock spreads onto native elements
- Built `makeProject` factory with 4-chapter structure covering all three chapter states (completed, current, upcoming)
- Declared 10 `test.todo` stubs across 5 describe blocks, one per TIMELINE requirement

## Task Commits

1. **Task 1: Create PhaseTimeline.test.tsx with failing stubs for TIMELINE-01 through TIMELINE-05** - `a7c3b7f` (test)

## Files Created/Modified

- `src/modules/projects/__tests__/PhaseTimeline.test.tsx` - Wave 0 test scaffold with mocks, factories, and 10 test.todo stubs for all TIMELINE requirements

## Decisions Made

- Used `test.todo` rather than `test.skip` — vitest distinguishes them distinctly (todo = declared intent, skip = suppressed). The todo signal is more meaningful for RED-state tracking.
- `filterMotionProps` implemented as a named top-level helper rather than inline lambda to keep mock blocks readable.
- Factory defaults set to sensible values so future test authors only need to override what's relevant per test.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `PhaseTimeline.test.tsx` is the behavioral contract for Plans 01 and 02.
- Plan 01 will redesign `PhaseTimeline.tsx` and `PhaseNode.tsx` — test stubs TIMELINE-01, TIMELINE-02, TIMELINE-03 should be filled in during that plan.
- Plan 02 will add mobile swipe view and tooltips — test stubs TIMELINE-04, TIMELINE-05 should be filled in during that plan.
- No blockers.

---
*Phase: 04-phasetimeline-redesign*
*Completed: 2026-03-29*
