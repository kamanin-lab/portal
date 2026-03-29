# Phase 4: PhaseTimeline Redesign — Research

**Researched:** 2026-03-29
**Domain:** React component animation, responsive UI, progressive disclosure patterns
**Confidence:** HIGH

---

## Summary

Phase 4 redesigns two existing components — `PhaseTimeline.tsx` and `PhaseNode.tsx` — that already exist and render correctly, but lack several capabilities specified in the requirements: per-phase color differentiation, proportional connector fill, Motion spring transitions, mobile single-phase view, and hover tooltips.

The existing implementation is a working horizontal stepper using a fixed accent color for the active node and a fixed green for completed connectors. The redesign replaces this with phase-specific colors (cycling through `--phase-1` through `--phase-4`), animates connector fill proportionally to step completion, adds Motion layout transitions on state changes, collapses to a prev/next single-phase view on mobile (< 768px), and wraps each node in a Radix UI Tooltip showing `chapter.narrative`.

All dependencies are already installed: Motion v12.38.0, `@radix-ui/react-tooltip` v1.2.8, and the phase color tokens are defined in `tokens.css`. No new packages are needed. The `getChapterProgress` helper and `getPhaseColor` function already exist and can be reused. The `useBreakpoint` hook already provides `isMobile`.

**Primary recommendation:** Rewrite `PhaseTimeline.tsx` and `PhaseNode.tsx` in place. Extract a new `PhaseConnector.tsx` for the animated fill. Add a `shadcn/ui`-style `tooltip.tsx` wrapper around Radix, then use it in `PhaseNode`. Keep `ContextStrip.tsx` unchanged — it is the correct parent.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TIMELINE-01 | PhaseTimeline nodes 20-24px with clear state differentiation via phase colors | `getPhaseColor(chapter.order)` + `PHASE_COLORS` map already exist in `phase-colors.ts`. Node dot needs size upgrade (currently 14-15px). Each node gets its own phase color instead of using `--accent` for all current nodes. |
| TIMELINE-02 | Connector lines show partial completion fill (steps completed / total) | `getChapterProgress(chapter)` returns `"N/M"` string. Need to parse ratio, render two-layer div (background track + foreground fill with phase color). Motion `animate={{ width }}` on the fill layer. |
| TIMELINE-03 | State transitions use Motion spring animations (layout transitions, state label entry/exit) | `AnimatePresence` + `layout` prop for node size/color changes. `initial/animate/exit` on the state label span. Spring config: `type: "spring", stiffness: 300, damping: 30` per designer.md. |
| TIMELINE-04 | Mobile view (< 768px) collapses to single-phase with prev/next navigation | `useBreakpoint().isMobile` is available. Mobile renders one `PhaseNode` at a time, with prev/next arrow buttons and a step indicator ("2 / 4"). `AnimatePresence mode="wait"` animates between phases. |
| TIMELINE-05 | Tooltip on hover shows chapter narrative text | `chapter.narrative` field exists on `Chapter` type. `@radix-ui/react-tooltip` v1.2.8 is installed. Need to create `src/shared/components/ui/tooltip.tsx` (shadcn-style wrapper) or use Radix primitives directly in `PhaseNode`. |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| motion/react | 12.38.0 (installed) | Spring animations, layout transitions, AnimatePresence | CLAUDE.md mandates Motion for all animations |
| @radix-ui/react-tooltip | 1.2.8 (installed) | Accessible tooltip primitives | Already a dependency; no new install |
| tailwindcss | 4.2.1 (installed) | Responsive classes (`max-[768px]:`) | Project standard |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| useBreakpoint hook | project (exists) | `isMobile` flag for conditional layout | Single source of truth for mobile detection |
| getPhaseColor() | project (exists) | Maps `chapter.order` 1-4 to color object | Use everywhere instead of hardcoded colors |
| getChapterProgress() | project (exists) | Returns `"N/M"` string for step count | Parse to ratio for connector fill width |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Radix Tooltip | CSS title attribute | title= has no styling control, no animation — reject |
| Radix Tooltip | Custom hover div | More code, less accessible — reject |
| Motion animate | CSS transition | CLAUDE.md: use Motion, not CSS animations for interactive state changes |
| useBreakpoint | CSS-only responsive | JS needed for conditional JSX structure (single vs multi node), not just styling |

**Installation:** No new packages needed. All dependencies are installed.

---

## Architecture Patterns

### Recommended Project Structure

```
src/modules/projects/components/overview/
├── PhaseTimeline.tsx       # REWRITE: desktop multi-node + mobile single-node shell
├── PhaseNode.tsx           # REWRITE: 20-24px dot, phase color, Motion layout, Tooltip
├── PhaseConnector.tsx      # NEW: animated fill connector (extracted from inline div)
src/shared/components/ui/
└── tooltip.tsx             # NEW: shadcn-style wrapper around @radix-ui/react-tooltip
```

### Pattern 1: Phase-Colored Nodes with Motion Layout

**What:** Each `PhaseNode` uses `getPhaseColor(chapter.order)` to get its own color. The dot size changes between states (20px upcoming → 22px active → 20px completed). Motion `layout` prop animates size transitions.

**When to use:** All node state renders.

```typescript
// Source: Motion v12 layout prop pattern (verified in node_modules/framer-motion)
import { motion, AnimatePresence } from 'motion/react'
import { getPhaseColor } from '../../lib/phase-colors'

const color = getPhaseColor(chapter.order)

// Dot size by state
const dotSize = status === 'current' ? 22 : 20

<motion.div
  layout
  className="rounded-full flex items-center justify-center flex-shrink-0"
  style={{ width: dotSize, height: dotSize }}
  animate={{
    backgroundColor: status === 'completed' ? 'var(--committed)' :
                     status === 'current'   ? color.main :
                                              'var(--surface)',
    borderColor: status === 'upcoming' ? 'var(--border)' : color.main,
  }}
  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
>
```

### Pattern 2: Proportional Connector Fill

**What:** Two-layer div — background track (full width) + foreground fill (width as percentage of completed steps). Motion animates the fill width.

**When to use:** Connector between each pair of adjacent chapters.

```typescript
// Source: motion/react animate prop, verified in framer-motion exports
function PhaseConnector({ chapter, prevChapter, project }: ConnectorProps) {
  const progress = getChapterProgress(chapter) // "N/M"
  const [done, total] = progress.split('/').map(Number)
  const fillPct = total > 0 ? (done / total) * 100 : 0

  // Use the PREVIOUS chapter's color for the connector (leading into current chapter)
  const color = getPhaseColor(prevChapter.order)

  return (
    <div className="relative w-[28px] h-[2px] bg-[var(--border)] opacity-40 rounded-[1px] flex-shrink-0">
      <motion.div
        className="absolute top-0 left-0 h-full rounded-[1px]"
        style={{ backgroundColor: color.main }}
        initial={{ width: 0 }}
        animate={{ width: `${fillPct}%`, opacity: fillPct > 0 ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 30 }}
      />
    </div>
  )
}
```

### Pattern 3: State Label Entry/Exit Animation

**What:** The "Aktuell" / "Abgeschlossen" label below the chapter title animates in/out using `AnimatePresence`. This satisfies TIMELINE-03's "state label entry/exit" requirement.

**When to use:** Whenever `status` changes (React re-render driven by project data updates).

```typescript
// Source: AnimatePresence verified in framer-motion exports
<AnimatePresence mode="wait">
  {stateLabel && (
    <motion.span
      key={stateLabel}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.2 }}
      className="text-2xs font-semibold tracking-[0.03em] mt-0.5"
      style={{ color: status === 'completed' ? 'var(--committed)' : color.main }}
    >
      {stateLabel}
    </motion.span>
  )}
</AnimatePresence>
```

### Pattern 4: Mobile Single-Phase View

**What:** On `isMobile` (< 768px), render one phase at a time with a local `activeIndex` state, prev/next arrow buttons, and a page indicator. `AnimatePresence mode="wait"` slides the active node in from the correct direction.

**When to use:** `useBreakpoint().isMobile === true`.

```typescript
// Source: useBreakpoint hook (src/shared/hooks/useBreakpoint.ts, verified)
import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useBreakpoint } from '@/shared/hooks/useBreakpoint'

const { isMobile } = useBreakpoint()
const [activeIndex, setActiveIndex] = useState(() => {
  // Default to the current chapter's index
  return chapters.findIndex(ch => getChapterStatus(ch, project) === 'current') || 0
})
const [direction, setDirection] = useState<1 | -1>(1)

if (isMobile) {
  return (
    <div className="flex items-center gap-3 px-1.5 py-2 ...">
      <button onClick={() => { setDirection(-1); setActiveIndex(i => Math.max(0, i - 1)) }}>
        {/* prev arrow */}
      </button>

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={activeIndex}
          custom={direction}
          variants={{
            enter: (d) => ({ x: d * 40, opacity: 0 }),
            center: { x: 0, opacity: 1 },
            exit: (d) => ({ x: d * -40, opacity: 0 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="flex-1"
        >
          <PhaseNode chapter={chapters[activeIndex]} status={...} />
        </motion.div>
      </AnimatePresence>

      <button onClick={() => { setDirection(1); setActiveIndex(i => Math.min(chapters.length - 1, i + 1)) }}>
        {/* next arrow */}
      </button>
      {/* "2 / 4" indicator */}
    </div>
  )
}
```

### Pattern 5: Tooltip with Radix UI

**What:** `TooltipProvider` wraps the entire `PhaseTimeline`. Each `PhaseNode` is wrapped in `<Tooltip><TooltipTrigger asChild><button...></><TooltipContent>{chapter.narrative}</TooltipContent></Tooltip>`. The shadcn tooltip.tsx wrapper provides consistent styling.

**When to use:** All PhaseNode instances on desktop (tooltip is `delayDuration={300}` for feel).

```typescript
// Source: @radix-ui/react-tooltip v1.2.8 API (verified from type definitions)
// tooltip.tsx (shadcn wrapper)
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger
export const TooltipContent = React.forwardRef<...>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 overflow-hidden rounded-[var(--r-sm)] bg-[var(--text-primary)] px-3 py-1.5 text-xs text-[var(--text-inverse)] shadow-md max-w-[200px]',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))

// Usage in PhaseNode:
<Tooltip delayDuration={300}>
  <TooltipTrigger asChild>
    <button ...>...</button>
  </TooltipTrigger>
  <TooltipContent>
    <p>{chapter.narrative}</p>
  </TooltipContent>
</Tooltip>
```

### Anti-Patterns to Avoid

- **Animate realtime-driven data:** Do NOT animate on every React Query poll update. Only animate when `status` actually changes (use `key` prop on animated wrappers tied to `status`, not to the whole project object).
- **Overflow-x scroll on mobile:** The existing implementation uses `overflow-x-auto` on the container. This MUST be removed in mobile view — the requirement explicitly says no horizontal scroll.
- **CSS @keyframes for pulse:** The current `phase-pulse` animation on the active node dot uses `style={{ animation: 'phase-pulse ...' }}` (CSS keyframes). Replace with Motion's `animate` + `transition: { repeat: Infinity }` pattern for consistency.
- **Hardcoded `--accent` for active node:** Current `PhaseNode` uses `border-[var(--accent)]` for the active state regardless of chapter. Replace with `color.main` from `getPhaseColor(chapter.order)`.
- **Node dot size below 20px:** Current dots are 14-15px. TIMELINE-01 specifies 20-24px minimum.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accessible tooltip | Custom hover div with useState | `@radix-ui/react-tooltip` | Handles keyboard focus, screen readers, portal z-index, auto-placement — already installed |
| Mobile swipe detection | Touch event listeners | `AnimatePresence` + button nav | Swipe on B2B portals adds complexity; prev/next buttons are clearer for clients |
| Phase color lookup | Inline ternary chains | `getPhaseColor(chapter.order)` | Already implemented in `phase-colors.ts` |
| Step count ratio | Manual chapter.steps.filter | `getChapterProgress()` → parse | Already returns "N/M" — parse to number ratio |
| Mobile breakpoint | Window resize listener | `useBreakpoint()` | Already implemented in `src/shared/hooks/useBreakpoint.ts` |

**Key insight:** The project already has all the data primitives needed (`getPhaseColor`, `getChapterProgress`, `getChapterStatus`, `useBreakpoint`). The work is purely UI composition and animation layer, not new logic.

---

## Common Pitfalls

### Pitfall 1: Tooltip Requires TooltipProvider as Ancestor

**What goes wrong:** `TooltipContent` throws a context error if `TooltipProvider` is not an ancestor.

**Why it happens:** Radix UI Tooltip uses React Context internally. The Provider must wrap any component tree containing Tooltip roots.

**How to avoid:** Wrap the `PhaseTimeline` container div with `<TooltipProvider>` (not each individual node). One provider for the whole timeline is correct.

**Warning signs:** Runtime error "Cannot read properties of undefined (reading 'onOpenChange')" or similar context errors in dev console.

---

### Pitfall 2: AnimatePresence mode="wait" Requires Unique Keys

**What goes wrong:** Two phases show simultaneously during transition, or the exit animation doesn't play.

**Why it happens:** Motion identifies elements to animate by `key`. If both entering and exiting elements share a key, AnimatePresence cannot distinguish them.

**How to avoid:** Use `key={activeIndex}` (or `key={chapter.id}`) on the element inside `AnimatePresence`, not on `AnimatePresence` itself.

**Warning signs:** No animation on phase switch, or both nodes visible simultaneously during transition.

---

### Pitfall 3: Motion `layout` Prop Conflicts with Tailwind Flex

**What goes wrong:** Layout animation causes the connector to shift position abruptly when node size changes.

**Why it happens:** `layout` prop triggers FLIP animations which can interact unexpectedly with Flexbox if sibling elements are also animated.

**How to avoid:** Apply `layout` prop only to the node dot itself, not the outer flex container. Give the outer `PhaseNode` button a stable `flex-1` layout that does not change size, and only animate the dot inside it.

**Warning signs:** Connectors jump when active node transitions to completed state.

---

### Pitfall 4: Pulse Animation — Repeat Stops After Navigation

**What goes wrong:** The CSS `phase-pulse` animation on the active node stops after the page unmounts and remounts (e.g., navigating away and back).

**Why it happens:** CSS `animation` applied via `style` prop is not managed by React — the animation state is tied to the DOM element lifecycle.

**How to avoid:** Replace the CSS keyframe pulse with Motion's built-in repeat animation:
```typescript
animate={{ scale: [1, 1.15, 1], opacity: [1, 0.7, 1] }}
transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
```
This is managed by Motion and reattaches correctly on remount.

**Warning signs:** Active node pulse works on first load but stops after any navigation.

---

### Pitfall 5: Mobile `activeIndex` Defaults to Wrong Phase

**What goes wrong:** On mobile, the timeline always opens on phase 1 instead of the active phase.

**Why it happens:** `useState(0)` initializes to the first chapter.

**How to avoid:** Initialize `activeIndex` to the current chapter's index:
```typescript
const [activeIndex, setActiveIndex] = useState(() => {
  const idx = chapters.findIndex(ch => getChapterStatus(ch, project) === 'current')
  return idx >= 0 ? idx : 0
})
```

**Warning signs:** Mobile users see a completed phase instead of their active phase on load.

---

### Pitfall 6: Tooltip Shows on Mobile (Touch Devices)

**What goes wrong:** Tooltip flashes on tap on mobile, causing unexpected UI behavior.

**Why it happens:** Radix Tooltip triggers on focus/hover, and touch events can trigger hover state on mobile browsers.

**How to avoid:** The mobile view replaces the multi-node layout entirely — `TooltipProvider` and `Tooltip` wrappers should only be rendered when `!isMobile`. The mobile single-phase view uses plain buttons.

**Warning signs:** Tooltip content briefly visible on mobile tap then disappears.

---

## Code Examples

Verified patterns from official sources and project codebase:

### Getting Phase Color for a Chapter

```typescript
// Source: src/modules/projects/lib/phase-colors.ts (verified)
import { getPhaseColor } from '../../lib/phase-colors'
const color = getPhaseColor(chapter.order) // { main, light, mid, text }
// color.main → '#7C3AED' for order=1
```

### Parsing getChapterProgress for Connector Fill

```typescript
// Source: src/modules/projects/lib/helpers.ts (verified — getChapterProgress returns "N/M")
function parseProgress(chapter: Chapter): { done: number; total: number; pct: number } {
  const raw = getChapterProgress(chapter) // "2/3"
  const [done, total] = raw.split('/').map(Number)
  return { done, total, pct: total > 0 ? done / total : 0 }
}
```

### Existing Motion Import Pattern (project standard)

```typescript
// Source: src/modules/tickets/components/TaskCard.tsx (verified)
import { motion } from 'motion/react'
// Source: src/shared/components/inbox/NotificationAccordionItem.tsx (verified)
import { motion, AnimatePresence } from 'motion/react'
```

### Existing Spring Transition Pattern

```typescript
// Source: TaskCard.tsx (verified)
transition={{ type: 'spring', stiffness: 400, damping: 25 }}
// designer.md recommends: stiffness: 300, damping: 30 for layout transitions
```

### Radix Tooltip API (verified from type definitions)

```typescript
// Source: @radix-ui/react-tooltip/dist/index.d.ts (verified)
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
// Exports: TooltipProvider, Tooltip (Root), TooltipTrigger, TooltipContent, TooltipPortal, TooltipArrow
// Key props:
//   TooltipProvider: delayDuration (default 700ms) — set at provider level
//   Tooltip (Root): open, onOpenChange, defaultOpen
//   TooltipTrigger: asChild (bool) — lets the child element be the trigger
//   TooltipContent: sideOffset, side ('top'|'right'|'bottom'|'left'), align
```

### useBreakpoint Usage Pattern

```typescript
// Source: src/shared/hooks/useBreakpoint.ts (verified)
import { useBreakpoint } from '@/shared/hooks/useBreakpoint'
const { isMobile } = useBreakpoint() // isMobile = width < 768
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Framer Motion | motion/react (Motion v12, same package) | motion v12 re-exports framer-motion | No breaking change — `motion/react` is the correct import path |
| Single accent color for active nodes | Per-phase colors (--phase-1 through --phase-4) | This phase | Visual differentiation between phases |
| Fixed-width connector (green when prev complete) | Proportional fill showing step progress | This phase | Communicates partial completion within a phase |
| CSS @keyframes pulse | Motion repeat animation | This phase | Lifecycle-safe, consistent with animation system |
| overflow-x-auto on mobile | Single-phase prev/next navigation | This phase | Eliminates horizontal scroll on mobile |

**Deprecated/outdated in this phase:**
- `phase-pulse` CSS keyframe class: replaced by Motion `animate` with `repeat: Infinity`
- `overflow-x-auto` on timeline container: removed, replaced with mobile conditional layout

---

## Open Questions

1. **Connector color assignment: leading or following phase?**
   - What we know: There are 4 connectors between 4 nodes. Each phase has its own color.
   - What's unclear: Should the connector use the color of the phase it leads INTO (right node) or the phase it leads OUT OF (left node)?
   - Recommendation: Use the LEFT (source) chapter's color. A completed connector shows "this phase's work led here." This is the more intuitive reading for progress indication. The planner should confirm this with a design note.

2. **Tooltip on mobile: skip or show?**
   - What we know: Radix Tooltip has unpredictable behavior on touch devices.
   - What's unclear: Should the mobile view have any mechanism to see `chapter.narrative`?
   - Recommendation: Skip tooltip on mobile entirely (the single-phase view shows the chapter title prominently, and narrative is visible in the ContextStrip narrative text below). Flag for planner to confirm.

3. **Tooltip delay: 300ms or 700ms?**
   - What we know: Radix default is 700ms. Our requirement says "hovering shows tooltip."
   - What's unclear: B2B context — users hover briefly while scanning.
   - Recommendation: 300ms at `PhaseNode` level (`<Tooltip delayDuration={300}>`). Responsive without feeling jumpy.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 4 is a pure frontend code change. No external services, CLIs, databases, or runtimes beyond the project's existing stack are required.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest v4.1.0 + @testing-library/react v16.3.2 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm run test -- --reporter=verbose src/modules/projects/__tests__/PhaseTimeline` |
| Full suite command | `npm run test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TIMELINE-01 | Node renders at 20-24px size; completed/current/upcoming have distinct color styles | unit | `npm run test -- src/modules/projects/__tests__/PhaseTimeline.test.tsx` | ❌ Wave 0 |
| TIMELINE-02 | Connector fill width matches step completion ratio | unit | Same file | ❌ Wave 0 |
| TIMELINE-03 | Motion spring transitions — AnimatePresence renders state label correctly | unit | Same file | ❌ Wave 0 |
| TIMELINE-04 | Mobile: single phase visible; prev/next buttons change active phase | unit | Same file | ❌ Wave 0 |
| TIMELINE-05 | Tooltip content = chapter.narrative; renders on trigger | unit | Same file | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test -- src/modules/projects/__tests__/PhaseTimeline.test.tsx`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green (currently 80 passing, 2 failing in unrelated `support-chat.test.tsx` — existing failure, not introduced by this phase)

### Wave 0 Gaps

- [ ] `src/modules/projects/__tests__/PhaseTimeline.test.tsx` — covers TIMELINE-01 through TIMELINE-05
- [ ] Mock setup for `motion/react` — AnimatePresence does not animate in jsdom; tests should check rendered structure/aria, not animation values

*(Note: `DynamicHero.test.tsx` provides an existing example of how to mock `react-router-dom` and write rendering tests for this module. Follow its pattern.)*

---

## Sources

### Primary (HIGH confidence)

- `G:/01_OPUS/Projects/PORTAL/src/modules/projects/components/overview/PhaseTimeline.tsx` — current implementation, read directly
- `G:/01_OPUS/Projects/PORTAL/src/modules/projects/components/overview/PhaseNode.tsx` — current implementation, read directly
- `G:/01_OPUS/Projects/PORTAL/src/modules/projects/lib/phase-colors.ts` — verified `getPhaseColor` API
- `G:/01_OPUS/Projects/PORTAL/src/modules/projects/lib/helpers.ts` — verified `getChapterProgress`, `getChapterStatus`, `useBreakpoint`
- `G:/01_OPUS/Projects/PORTAL/src/shared/hooks/useBreakpoint.ts` — verified `isMobile < 768` threshold
- `G:/01_OPUS/Projects/PORTAL/src/shared/styles/tokens.css` — verified `--phase-1` through `--phase-4` token values
- `G:/01_OPUS/Projects/PORTAL/node_modules/framer-motion/package.json` — version 12.38.0, same package re-exported by motion/react
- `G:/01_OPUS/Projects/PORTAL/node_modules/framer-motion/dist/framer-motion.dev.js` — verified `AnimatePresence`, `useMotionValue`, `useSpring`, `useTransform` exports
- `G:/01_OPUS/Projects/PORTAL/node_modules/@radix-ui/react-tooltip/dist/index.d.ts` — verified `TooltipProvider`, `TooltipTrigger`, `TooltipContent`, `TooltipPortal` API
- `.planning/REQUIREMENTS.md` — TIMELINE-01 through TIMELINE-05 specifications
- `docs/SPEC.md` section 3.1 — PhaseTimeline visual spec (node states, connector spec, mobile 2×2 grid note)
- `.claude/agents/designer.md` — Motion animation guidelines, spring config, animation principles

### Secondary (MEDIUM confidence)

- `src/modules/tickets/components/TaskCard.tsx` — existing Motion spring pattern in production code
- `src/shared/components/inbox/NotificationAccordionItem.tsx` — existing AnimatePresence pattern in production code
- `src/modules/projects/__tests__/DynamicHero.test.tsx` — existing test pattern for overview components (used as model for Wave 0 test)

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all packages verified by reading node_modules and package.json
- Architecture: HIGH — existing components read directly; all helper functions verified
- Pitfalls: HIGH — derived from reading current implementation and known Motion/Radix patterns in the codebase
- Test strategy: HIGH — test infrastructure verified by running `npm run test` (vitest.config.ts confirmed)

**Research date:** 2026-03-29
**Valid until:** 2026-04-29 (stable dependencies, no fast-moving ecosystem risk)
