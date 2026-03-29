# Deferred Items — Phase 04 PhaseTimeline Redesign

## Pre-existing Build Errors (Out of Scope for 04-01)

**File:** `src/modules/projects/__tests__/PhaseTimeline.test.tsx`

**Errors:**
- `TS6133: 'PhaseTimeline' is declared but its value is never read` (line 3)
- `TS6133: 'makeProject' is declared but its value is never read` (line 91)
- `TS6133: '_render' is declared but its value is never read` (line 150)

**Root cause:** These are stub test declarations from plan 04-00 (TDD red phase). The tests use `test.todo()` which doesn't reference the imports, triggering `noUnusedLocals` in `tsc -b` build mode.

**Resolution:** These errors will be resolved naturally when plan 04-02 implements PhaseTimeline and the `test.todo` stubs are converted to real tests that use `PhaseTimeline`, `makeProject`, and `render`.

**Impact:** `npm run build` fails via `tsc -b`. `npx tsc --noEmit` passes. Production Vercel build will fail until 04-02 resolves this.

**Discovered during:** Plan 04-01, Task 2 verification.
