---
phase: 04-phasetimeline-redesign
plan: "01"
subsystem: projects-module/overview
tags: [ui-components, animation, phase-timeline, tooltip, motion]
dependency_graph:
  requires: [04-00]
  provides: [tooltip.tsx, PhaseConnector.tsx, PhaseNode.tsx]
  affects: [PhaseTimeline.tsx, overview-module]
tech_stack:
  added: ["@radix-ui/react-tooltip (shadcn wrapper)"]
  patterns: ["Motion spring animations", "AnimatePresence state label transitions", "Radix Tooltip with portal", "Per-phase color system via getPhaseColor"]
key_files:
  created:
    - src/shared/components/ui/tooltip.tsx
    - src/modules/projects/components/overview/PhaseConnector.tsx
  modified:
    - src/modules/projects/components/overview/PhaseNode.tsx
decisions:
  - "Connector fill color uses LEFT (previous) chapter phase color — fill represents the phase whose completion leads into the next phase"
  - "Pulse animation implemented as separate wrapping motion.div to avoid conflicting with layout animation on the dot"
  - "PhaseNode under 150 lines achieved by keeping dot rendering inline (not a sub-component) since it needs access to color and status"
metrics:
  duration: "4m 19s"
  completed_date: "2026-03-29"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 1
---

# Phase 04 Plan 01: PhaseTimeline Building Blocks Summary

**One-liner:** Radix Tooltip wrapper, Motion spring-animated connector fill, and rewritten PhaseNode with per-phase colors and AnimatePresence state label transitions — no CSS keyframes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create tooltip.tsx and PhaseConnector.tsx | `1243c1b` | src/shared/components/ui/tooltip.tsx, src/modules/projects/components/overview/PhaseConnector.tsx |
| 2 | Rewrite PhaseNode.tsx with phase colors, Motion animations, tooltip | `9a15c3a` | src/modules/projects/components/overview/PhaseNode.tsx |

## What Was Built

### tooltip.tsx (NEW)
Shadcn-pattern wrapper around `@radix-ui/react-tooltip`. Exports four named exports: `TooltipProvider`, `Tooltip`, `TooltipTrigger`, `TooltipContent`. Content renders via `TooltipPrimitive.Portal` for z-index isolation. Styling uses portal CSS tokens (`--text-primary`, `--text-inverse`, `--r-sm`) with `max-w-[200px]` and `sideOffset={4}` default.

### PhaseConnector.tsx (NEW)
Animated connector bar between phase nodes. Two-layer structure: grey 28x2px base track + Motion-animated fill div. Fill percentage calculated from `getChapterProgress(chapter)`. Fill color uses the LEFT (previous) chapter's phase color — intentional design semantic. Spring transition `stiffness:200, damping:30` with `initial={{ width: 0 }}` entry animation. Under 30 lines.

### PhaseNode.tsx (REWRITTEN)
Complete rewrite satisfying TIMELINE-01, TIMELINE-03, TIMELINE-05:
- **Phase colors:** `getPhaseColor(chapter.order)` drives all color — dot background, border, text, current node background. All `--accent` references removed.
- **Node sizes:** completed/upcoming = 20px, current = 24px with 8px inner white dot.
- **Pulse animation:** Separate wrapping `motion.div` with `animate={{ scale: [1, 1.15, 1] }}` and `repeat: Infinity` — replaces CSS `phase-pulse` keyframes.
- **Dot animation:** `motion.div layout` with spring `stiffness:300, damping:30` for color transitions.
- **State labels:** `AnimatePresence mode="wait"` with `initial/animate/exit` y-offset transitions.
- **Tooltip:** Wraps button in `<Tooltip delayDuration={300}>` showing `chapter.narrative`. `showTooltip={false}` bypasses tooltip for mobile.
- 144 lines (under 150-line limit).

## Deviations from Plan

### Pre-existing Build Errors (Out of Scope)

The test stub file `src/modules/projects/__tests__/PhaseTimeline.test.tsx` from plan 04-00 has three unused variable errors (`PhaseTimeline`, `makeProject`, `_render`) that cause `npm run build` to fail via `tsc -b`. These errors existed before this plan's changes (confirmed by git stash verification). They are out-of-scope — the stub tests belong to plan 04-00's TDD red phase and will be resolved when PhaseTimeline is implemented in plan 04-02. Documented in deferred-items.

Note: `npx tsc --noEmit` (used for per-task verification) exits 0. Only `tsc -b` (build mode) surfaces these errors.

## Known Stubs

None — all components are fully wired to real data sources (`getPhaseColor`, `getChapterProgress`, `chapter.narrative`).

## Self-Check: PASSED

Files exist:
- FOUND: src/shared/components/ui/tooltip.tsx
- FOUND: src/modules/projects/components/overview/PhaseConnector.tsx
- FOUND: src/modules/projects/components/overview/PhaseNode.tsx (rewritten)

Commits exist:
- FOUND: 1243c1b (tooltip.tsx + PhaseConnector.tsx)
- FOUND: 9a15c3a (PhaseNode.tsx rewrite)

Acceptance criteria verified:
- tooltip.tsx exports TooltipProvider, Tooltip, TooltipTrigger, TooltipContent
- tooltip.tsx imports from @radix-ui/react-tooltip
- tooltip.tsx contains max-w-[200px] and sideOffset={4}
- PhaseConnector.tsx exports PhaseConnector
- PhaseConnector.tsx imports motion from motion/react
- PhaseConnector.tsx imports getChapterProgress and getPhaseColor
- PhaseConnector.tsx contains stiffness:200, damping:30, w-[28px] h-[2px]
- PhaseNode.tsx imports motion, AnimatePresence, getPhaseColor, Tooltip/TooltipTrigger/TooltipContent
- PhaseNode.tsx contains stiffness:300, damping:30, repeat:Infinity
- PhaseNode.tsx contains AnimatePresence, delayDuration={300}, chapter.narrative, showTooltip
- PhaseNode.tsx contains w-[20px], w-[24px], h-[20px], h-[24px]
- PhaseNode.tsx does NOT contain phase-pulse or --accent
- PhaseNode.tsx is 144 lines (under 150)
- TypeScript compiles with no errors (npx tsc --noEmit exits 0)
