# Deferred Items — Phase 19

Items discovered during execution that are out of scope for the current task and not caused by current changes.

## From Plan 19-01

### Pre-existing TypeScript errors in v1 App.tsx (out of scope)

`widgets/daily-briefing/src/App.tsx` reports 9 `TS2503: Cannot find namespace 'JSX'` errors when running `npx tsc --noEmit -p widgets/daily-briefing/tsconfig.json`. These are pre-existing in the v1 widget code (not introduced by Phase 19 plan 01).

- Lines: 12, 109, 260, 297, 326, 337, 420, 471, 521
- Cause: `JSX.Element` type annotations without `import type { JSX } from "react"` (React 19 stripped global JSX namespace).
- Disposition: Will be naturally resolved by D-19-11 (v1 App.tsx is replaced in-place by v2 in a later plan).
- Action: None taken in plan 01.

## From Plan 19-02

### Pre-existing TypeScript errors in shared Phase-18 files (out of scope)

`npx tsc --noEmit -p tsconfig.widgets.json` reports 2 errors not introduced by plan 19-02:

- `widgets/shared/hooks/__tests__/useHostTokens.test.ts(67,28): error TS2532: Object is possibly 'undefined'.` (from commit `4e79acf`, Phase 18-03).
- `widgets/shared/vite.base.ts(43,9): error TS2322: Type 'OutputAsset | OutputChunk | undefined' is not assignable to type 'OutputAsset | OutputChunk'.` (from commit `ce6db86`, Phase 18-02).

Disposition: Out of scope for plan 19-02 (files unmodified by this plan). Leave for a later Phase-18 hygiene pass or a Phase-19 verification plan.
Action: None taken.

