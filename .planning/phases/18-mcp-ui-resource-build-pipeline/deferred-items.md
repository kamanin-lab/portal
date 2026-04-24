# Phase 18 — Deferred Items

Items discovered during execution that are out of scope for the current plan.

## From Plan 18-03 execution (2026-04-24)

### [18-02 regression] vite.base.ts tsc error

**File:** `G:/01_OPUS/Projects/mcp-poc/widgets/shared/vite.base.ts:43`
**Error:**
```
error TS2322: Type 'OutputAsset | OutputChunk | undefined' is not assignable to type 'OutputAsset | OutputChunk'.
  Type 'undefined' is not assignable to type 'OutputAsset | OutputChunk'.
```

**Context:** Pre-existing from Plan 18-02 (commit `ce6db86`). `noUncheckedIndexedAccess: true` in `tsconfig.widgets.json` makes `bundle[outFileName] = asset` tighten the return of the preceding `delete`-assignment chain. Build still works at runtime (Plan 02's verification was against `tsc -p tsconfig.widgets.json --noEmit` which must have been green at commit time — possibly a TS version diff after `npm install` in Plan 03 brought in transitive update).

**Not in scope for 18-03** (Scope Boundary rule): this error is not caused by the current plan's changes (widgets/shared/widget-tokens.ts, types.ts, hooks/useHostTokens.ts, __tests__). Recorded here for Plan 18-04 or a later polish pass.

**Suggested fix (1 line):**
```typescript
const asset = bundle[key]
if (!asset) continue
delete bundle[key]
```

## 18-05 Deferred — Pre-existing typecheck issues (not caused by Plan 05)

- `widgets/shared/hooks/__tests__/useHostTokens.test.ts:67:28` — TS2532 Object is possibly 'undefined' (introduced in commit 4e79acf, Plan 18-03)
- `widgets/shared/vite.base.ts:43:9` — TS2322 OutputAsset|OutputChunk|undefined vs OutputAsset|OutputChunk (introduced Plan 18-02)
- Both errors present before Plan 05 started (verified via git stash). Out of scope per GSD Rule: only auto-fix issues directly caused by current task.
