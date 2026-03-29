---
phase: 05-data-unification-polish
plan: 00
subsystem: testing
tags: [vitest, test-stubs, wave-0, tdd, nextcloud, motion, react]

# Dependency graph
requires:
  - phase: 04-phasetimeline-redesign
    provides: PhaseTimeline component and test patterns (filterMotionProps, test.todo convention)
provides:
  - Wave 0 test scaffolds for DATA-02 (FilesTab + StepFilesTab)
  - Wave 0 test scaffolds for DATA-03 (OverviewTabs tab transitions)
  - Wave 0 test scaffold extension for DATA-04 (PhaseTimeline skeleton)
affects: [05-01, 05-02, 05-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "test.todo over test.skip for Wave 0 RED stubs (established in Phase 04-00, continued here)"
    - "vi.mock for useNextcloudFiles hook isolates Supabase Edge Function calls in tests"

key-files:
  created:
    - src/modules/projects/__tests__/FilesTab.test.tsx
    - src/modules/projects/__tests__/StepFilesTab.test.tsx
    - src/modules/projects/__tests__/OverviewTabs.test.tsx
  modified:
    - src/modules/projects/__tests__/PhaseTimeline.test.tsx

key-decisions:
  - "vi.mock path for useNextcloudFiles uses relative path '../../hooks/useNextcloudFiles' matching test file location in __tests__ subfolder"

patterns-established:
  - "Wave 0 scaffold: create test file with vi.mock declarations + test.todo stubs before any implementation begins"

requirements-completed: [DATA-02, DATA-03, DATA-04]

# Metrics
duration: 8min
completed: 2026-03-29
---

# Phase 5 Plan 00: Wave 0 Test Scaffolds Summary

**10 test.todo stubs across 4 files providing RED targets for DATA-02 (FilesTab/StepFilesTab Nextcloud integration), DATA-03 (OverviewTabs tab transitions), and DATA-04 (PhaseTimeline skeleton)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-29T22:13:16Z
- **Completed:** 2026-03-29T22:21:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created FilesTab.test.tsx with 6 test.todo stubs covering Nextcloud file rendering, folder filtering, download click, empty state, and loading skeleton
- Created StepFilesTab.test.tsx with 4 test.todo stubs covering path construction, file rendering, empty state, and loading state
- Created OverviewTabs.test.tsx with 3 test.todo stubs for tab triggers, AnimatePresence wrapping, and tab-switching animation
- Extended PhaseTimeline.test.tsx with 1 new test.todo for skeleton rendering when isLoading=true (DATA-04)
- All 6 test files in __tests__ folder pass vitest (33 passed, 14 todo)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create FilesTab and StepFilesTab test stubs** - `ea8810f` (test)
2. **Task 2: Create OverviewTabs test stubs and extend PhaseTimeline test** - `5afe6a1` (test)

**Plan metadata:** pending docs commit

## Files Created/Modified
- `src/modules/projects/__tests__/FilesTab.test.tsx` - Wave 0 test stubs for DATA-02 FilesTab (6 todo stubs)
- `src/modules/projects/__tests__/StepFilesTab.test.tsx` - Wave 0 test stubs for DATA-02 StepFilesTab (4 todo stubs)
- `src/modules/projects/__tests__/OverviewTabs.test.tsx` - Wave 0 test stubs for DATA-03 OverviewTabs (3 todo stubs)
- `src/modules/projects/__tests__/PhaseTimeline.test.tsx` - Extended with 1 DATA-04 skeleton todo stub

## Decisions Made
- Used relative mock path `'../../hooks/useNextcloudFiles'` — consistent with the `__tests__/` folder depth
- OverviewTabs mocks reference sub-component paths relative to test file (`'../components/overview/...'`) to match vi.mock resolution

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
All 14 test.todo stubs in the __tests__ folder are intentional Wave 0 scaffolds. They are RED targets for Wave 1 implementation plans (05-01 through 05-03). Not blocking — this plan's goal is the scaffolds themselves.

## Next Phase Readiness
- Wave 0 scaffolds complete — Wave 1 implementation plans (05-01, 05-02, 05-03) can now start with clear RED targets
- FilesTab and StepFilesTab need Nextcloud data integration (DATA-02, covered by 05-01)
- OverviewTabs needs AnimatePresence tab transitions (DATA-03, covered by 05-02)
- PhaseTimeline needs isLoading skeleton prop (DATA-04, covered by 05-03)

## Self-Check: PASSED

- FOUND: src/modules/projects/__tests__/FilesTab.test.tsx
- FOUND: src/modules/projects/__tests__/StepFilesTab.test.tsx
- FOUND: src/modules/projects/__tests__/OverviewTabs.test.tsx
- FOUND: src/modules/projects/__tests__/PhaseTimeline.test.tsx
- FOUND: .planning/phases/05-data-unification-polish/05-00-SUMMARY.md
- FOUND commit: ea8810f (Task 1)
- FOUND commit: 5afe6a1 (Task 2)

---
*Phase: 05-data-unification-polish*
*Completed: 2026-03-29*
