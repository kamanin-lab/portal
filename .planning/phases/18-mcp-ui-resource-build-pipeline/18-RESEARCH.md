# Phase 18: MCP UI Resource Build Pipeline — Research

**Researched:** 2026-04-24
**Domain:** Cross-repo build tooling + iframe postMessage protocol (mcp-poc widgets + PORTAL theme publisher)
**Confidence:** HIGH on build stack and protocol mechanics; MEDIUM on React 19 hook ergonomics inside `viteSingleFile`; LOW on Preact/compat switch procedure (deferred documentation)

---

## Summary

Phase 18 builds a reusable Vite single-file widget pipeline in `G:/01_OPUS/Projects/mcp-poc` plus a bidirectional `kmn/theme/*` postMessage bridge between the PORTAL host and sandboxed widget iframes. Every locked decision (React 19 upgrade, per-widget dirs, twin contract tests, full dev harness, portal re-emit from day one) is already captured in `18-CONTEXT.md`. The job of this research is to surface the *implementation specifics* the planner needs: exact package versions, vite config merge strategy, the `useSyncExternalStore` hook shape that satisfies the `useMemo`-stabilized hook rule, the existing `sandbox-proxy.html` relay envelope shape that determines where the `kmn/theme/*` block plugs in, the exact protocol handshake sequence, and the validation dimensions that let a Nyquist VALIDATION.md derive observable acceptance tests.

The design doc `docs/ideas/MCP_UI_RESOURCE_BUILD_PIPELINE.md` is 90% of the specification — this research document layers *verified versions, tool-specific gotchas, and the concrete before/after file shapes* on top of that doc. The 15 specific questions from the additional_context block are answered section-by-section below.

**Primary recommendation:** Ship a 5-plan waterfall — (1) React 19 upgrade + directory scaffold, (2) per-widget Vite config + `widgets/shared/vite.base.ts`, (3) token module duplication + twin contract tests + `useHostTokens` hook, (4) PORTAL `widget-tokens.ts` + publisher + sandbox-proxy relay block, (5) dev harness + migration of v1 `daily-briefing` widget into the new dir shape. The cross-repo `kmn/theme/*` contract is the critical path; everything else is mechanical.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-widget Vite build pipeline | Build tooling (mcp-poc) | — | Widget bundles are MCP resources; the MCP server reads compiled HTML at startup |
| Theme-token source of truth | PORTAL browser (`document.documentElement`) | PORTAL frontend server | Tokens are a UI concept; portal owns the design system |
| Token request handshake | Widget (sandboxed iframe) | — | Widget is the consumer; only the widget knows when it's mounted |
| Token delivery + re-emit | PORTAL browser (`RevenueIntelligencePage.tsx` or shared hook) | — | Host-driven; widget cannot poll for theme changes across sandbox boundary |
| PostMessage relay | PORTAL static asset (`public/sandbox-proxy.html`) | — | Pure pass-through — no server involvement; same-origin isolation boundary |
| Bundled fallback tokens | Widget bundle (inlined JS) | — | Widget must render standalone in dev harness with zero host dependency |
| Twin contract test | Both repos (vitest in mcp-poc, vitest in PORTAL) | — | Drift detection must live where the respective file lives |
| Dev harness server | mcp-poc widget-local Vite dev server | — | Standalone iteration at `localhost:5174/` — no PORTAL involvement |
| Widget runtime security | iframe sandbox attribute (`public/sandbox-proxy.html`) | `@mcp-ui/client` AppRenderer | `sandbox="allow-scripts allow-forms"` enforced at PORTAL level; widget assumes no cookies/localStorage |

---

## Standard Stack

### Core (mcp-poc widgets)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react` | `^19.2.5` `[VERIFIED: npm view 2026-04-24]` | Widget runtime | Matches PORTAL (D-18-01 locked). Bumped from `^18.3.1` |
| `react-dom` | `^19.2.5` `[VERIFIED]` | Client root | Same as above |
| `@types/react` | `^19.2.14` `[VERIFIED]` | TS types | Matches PORTAL `^19.2.7` minor |
| `@types/react-dom` | `^19.2.3` `[VERIFIED]` | TS types | Same |
| `vite` | `^6.0.5` or bump to `^7.x` `[VERIFIED: mcp-poc currently 6.0.5; PORTAL 7.3.1]` | Build | Keep `^6.0.5` unless a specific feature requires 7; less risk |
| `@vitejs/plugin-react` | `^5.1.1` `[VERIFIED: current 5.1.1 from PORTAL; mcp-poc has 4.3.4]` | React 19 JSX transform | Must bump with React 19. Version 5+ matches React 19 |
| `vite-plugin-singlefile` | `^2.3.3` `[VERIFIED]` | Inline JS/CSS into one HTML | Canonical single-file solution; already in mcp-poc 2.0.3 — bump to 2.3.3 |
| `@tailwindcss/vite` | `^4.2.4` `[VERIFIED]` | Tailwind v4 integration | Matches PORTAL `^4.2.1` minor; zero postcss config |
| `tailwindcss` | `^4.2.4` `[VERIFIED]` | Utility classes | CSS-first; scans `src/**/*.{ts,tsx,html}` at build |
| `motion` | `^12.38.0` `[VERIFIED]` | Animation | Matches PORTAL; peerDeps `react ^18.0.0 \|\| ^19.0.0` `[VERIFIED via npm view]` |
| `typescript` | `^5.7.2` (current) or `~5.9.3` `[VERIFIED: PORTAL uses 5.9.3]` | Type checking | Either works; match PORTAL for consistency |

### Supporting (mcp-poc)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | `^2.x` or `^4.x` `[VERIFIED: PORTAL uses 4.0.18]` | Twin contract test runner | Only needed if D-18-03 contract test picks vitest over tsc-noEmit |
| `@vitest/coverage-v8` | matches vitest | — | Not needed for Phase 18 — contract test is ~10 LOC |
| `jsdom` | `^28.x` | DOM env for hook tests | Only if `useHostTokens` gets unit tests beyond the contract test |

### PORTAL (already present — no new deps)

| Library | Version | Purpose |
|---------|---------|---------|
| `motion` | `^12.38.0` `[VERIFIED]` | Already in PORTAL; no new install |
| `@mcp-ui/client` | `^7.0.0` `[VERIFIED]` | AppRenderer (already wired) |
| `sonner` | `^2.0.7` `[VERIFIED]` | Toasts (already in use) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `vite-plugin-singlefile` | Manual post-build concatenation | The plugin handles Rollup `inlineDynamicImports`, `cssCodeSplit:false`, `assetsInlineLimit` as a preset. Manual = ~40 LOC of build script we maintain |
| Per-widget `vite.config.ts` | Single root config with multiple entries | `inlineDynamicImports: true` is **incompatible** with multi-entry Rollup. This is why D-18-02 mandates per-dir configs. `[VERIFIED: confirmed in current mcp-poc vite.config.ts comment]` |
| `useSyncExternalStore` for `useHostTokens` | Custom `useEffect` + `useState` listener | `useSyncExternalStore` is React 19's recommended pattern for external subscriptions; handles tearing, concurrent mode. But see §useHostTokens Hook API below — the postMessage pattern has an initial-request side effect that doesn't fit `useSyncExternalStore` cleanly. Recommendation: custom hook with `useMemo`-stabilized return |
| `preact/compat` | Keep React 19 | Fallback only if 300 KB gz budget busts. React 19 + ReactDOM tree-shaken ≈ 45 KB gz; Motion v12 ≈ 15 KB gz — headroom is ~240 KB for app code + Tailwind JIT CSS. Expected to stay under |
| Monorepo / npm workspaces | Two independent repos | Rejected per D-18-03. Contract test at both sides is cheaper than monorepo refactor |

**Installation (mcp-poc, from repo root):**

```bash
# Upgrade React 18 → 19 (Plan 01, Task 1)
npm install --save-dev react@^19.2.5 react-dom@^19.2.5 \
  @types/react@^19.2.14 @types/react-dom@^19.2.3

# Bump plugin-react to 5.x for React 19 JSX transform
npm install --save-dev @vitejs/plugin-react@^5.1.1

# Bump vite-plugin-singlefile
npm install --save-dev vite-plugin-singlefile@^2.3.3

# Add Tailwind v4 + Motion as widget runtime dependencies
npm install --save @tailwindcss/vite@^4.2.4 tailwindcss@^4.2.4 motion@^12.38.0

# Optional: vitest for contract test (if chosen over tsc-noEmit)
npm install --save-dev vitest@^2.1.x jsdom@^28.x
```

**Version verification:** Every version above was re-checked on 2026-04-24 via `npm view <pkg> version`. `[VERIFIED: npm registry]`

---

## Phase Requirements

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MCPAPP-BUILD-01 | Vite single-file build configured in `mcp-poc/widgets/*/vite.config.ts` using `vite-plugin-singlefile` with `removeViteModuleLoader: true`, `assetsInlineLimit: 100_000_000`, `cssCodeSplit: false`, `inlineDynamicImports: true` | §Vite Config Template + §Shared Base Config pattern; plugin options verified via official README |
| MCPAPP-BUILD-02 | Tailwind CSS v4 integrated via `@tailwindcss/vite` plugin; JIT purge verified at build time | §Tailwind v4 Integration — plugin usage pattern; CSS `@import "tailwindcss"` |
| MCPAPP-BUILD-03 | Motion (`motion/react` v12) available in widget bundles; reduced-motion detection works in sandboxed iframe via matchMedia | §Motion in Sandboxed Iframe — `useReducedMotion` uses matchMedia; origin=null iframes still read OS-level `prefers-reduced-motion` |
| MCPAPP-BUILD-04 | React 19 + ReactDOM bundled; size budget ≤ 300 KB gzipped per widget measured via build output | §Bundle Budget — 45+15+8 ≈ 68 KB gz fixed; ~232 KB gz for app code |
| MCPAPP-BUILD-05 | Preact/compat fallback documented and tested — if widget exceeds 300 KB, swap via Vite alias drops to ~50 KB gz | §Preact Fallback — documentation-only; `resolve.alias` snippet documented |
| MCPAPP-BUILD-06 | Widget dev server (`npm run dev`) runs standalone at `http://localhost:5174/` with mock-host harness providing fake tokens and fake tool result; HMR works | §Dev Harness — `dev-host.html` shell + theme toggle + fixture modes + handshake logs |
| MCPAPP-BUILD-07 | Vercel build pipeline for mcp-poc includes widget build step; single `npm run build` at repo root produces both server and all widgets | §Vercel Build Integration — `scripts/build-widgets.mjs` dir-scan refactor; existing `vercel.json` `buildCommand: npm run build` already chains both |
| MCPAPP-TOKEN-01 | Widget posts `{ type: 'kmn/theme/request', protocolVersion: 1 }` to `window.parent` on mount | §Protocol Message Shapes + §Handshake Sequence |
| MCPAPP-TOKEN-02 | Portal `public/sandbox-proxy.html` relays `kmn/theme/*` messages bidirectionally without interpretation | §Sandbox-Proxy Relay Block — exact insertion point documented |
| MCPAPP-TOKEN-03 | Portal responds via `RevenueIntelligencePage.tsx` (or a shared hook) with `kmn/theme/set` carrying 12 tokens | §useThemePublisher Hook Design |
| MCPAPP-TOKEN-04 | Widget applies tokens via `document.documentElement.style.setProperty(k, v)` for each received token | §useHostTokens Hook API |
| MCPAPP-TOKEN-05 | Widget falls back to bundled defaults if no reply within 300ms | §300ms Fallback Implementation |
| MCPAPP-TOKEN-06 | Portal's theme-relay handler persists beyond first handshake — future theme toggles (e.g. dark mode) re-emit `kmn/theme/set` which widgets re-apply | §Theme Re-emit Listener Source — `MutationObserver` on `<html>` attribute |
| MCPAPP-TOKEN-07 | `src/shared/styles/widget-tokens.ts` TypeScript module mirrors 12-token subset of `tokens.css`; exports typed constant for host-side use | §Shared Token Module — exact token keys + default hex values + file header |
| MCPAPP-TOKEN-08 | Protocol version handling: host/widget with higher protocolVersion MUST ignore and log; widget falls back to defaults | §Protocol Version Mismatch |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

Non-negotiables extracted from `G:/01_OPUS/Projects/PORTAL/CLAUDE.md` that constrain this phase:

1. **`useMemo`-stabilized hook rule** (Architecture Rule from ADR-034 + memory `feedback_react_hook_identity_churn`): Any hook returning an object (notably `useHostTokens`, `useThemePublisher`) MUST wrap its return value in `useMemo`. Non-stable identity across renders causes `AppRenderer`'s effect deps to re-fire and DDoSes the mcp-proxy edge. Pattern exemplar: `src/modules/revenue-intelligence/hooks/useMcpProxy.ts`. This is load-bearing — the hook contract cannot be shipped without it.
2. **All UI text in German** (Architecture Rule 6): Dev harness labels, handshake log messages, and any user-facing strings in widgets must be German. Console logs (developer-facing) may be English.
3. **Components < 150 lines** (Architecture Rule 7): Extracted hooks, utility modules, and component splits apply per-file. The v1 `DailyBriefingApp.tsx` at 670 lines already violates this — Phase 19 cleanup tracks its deletion; Phase 18 migrates it unchanged (per `project_v1_widget_cleanup`).
4. **`ContentContainer width="narrow"` on PORTAL pages** (Architecture Rule 11): `RevenueIntelligencePage.tsx` already complies (`ContentContainer width="narrow"`). Theme publisher additions must not alter this wrapper.
5. **`mapStatus(task.status)` for status comparisons** (Architecture Rule 8): N/A to Phase 18 (no task data).
6. **shadcn/ui for new UI primitives** (Architecture Rule 12): Dev harness UI should use portal's shadcn components if it were in PORTAL, but the harness lives in `mcp-poc` where shadcn is explicitly non-goal (bundle budget) — hand-rolled Tailwind primitives are fine for the harness.
7. **Branching strategy** (`feedback_branching_workflow` + `feedback_main_branch_drift`): PORTAL commits go to `staging`; mcp-poc commits go to `main` (mcp-poc has no staging branch). Verify `git branch --show-current` before every commit after branch switch.
8. **Testing is TDD default**: vertical slices, one failing test → implement → next. Applies to `useHostTokens`, protocol version handling, and the twin contract test. Test locations: `widgets/shared/__tests__/*.test.ts` (mcp-poc side), `src/shared/styles/__tests__/widget-tokens.test.ts` (PORTAL side).
9. **scripts/ gitignore whitelist** (`feedback_gitignore_whitelist`): New JSON/MD files in `scripts/` are ignored by default — only `.ts/.cjs` + templates tracked. Does not affect `mcp-poc/scripts/build-widgets.mjs` (already tracked) but worth noting if the planner proposes any new dashboard or config file under `PORTAL/scripts/`.

---

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────── PORTAL (React 19 / Tailwind v4 / portal.kamanin.at) ────────────────────────────┐
│                                                                                                              │
│   ┌────────────────────────────────────┐          ┌───────────────────────────────────────────┐             │
│   │ src/shared/styles/widget-tokens.ts │  read    │  RevenueIntelligencePage.tsx              │             │
│   │ → WIDGET_TOKENS (12 keys, frozen)  │────────▶│  + useThemePublisher()                    │             │
│   └────────────────────────────────────┘          │    - responds to kmn/theme/request        │             │
│                    ▲                              │    - re-emits on <html> attr change       │             │
│                    │ drift check (vitest)         │    - reads document.documentElement CSS   │             │
│                    │                              │      vars, packages 12 tokens             │             │
│              ┌─────┴──────────┐                   └───────────────┬───────────────────────────┘             │
│              │ __tests__/     │                                   │                                         │
│              │ widget-tokens. │                                   │  window.postMessage                     │
│              │ test.ts        │                                   ▼                                         │
│              └────────────────┘                   ┌───────────────────────────────────────────┐             │
│                                                   │ public/sandbox-proxy.html                 │             │
│                                                   │  ├─ srcdoc: { html } (from @mcp-ui/client)│             │
│                                                   │  ├─ RELAY: type.startsWith("kmn/theme/")  │             │
│                                                   │  │          → forward both directions     │             │
│                                                   │  │  (NEW BLOCK — MCPAPP-TOKEN-02)         │             │
│                                                   │  └─ existing AppBridge relay (unchanged)  │             │
│                                                   └───────────────┬───────────────────────────┘             │
└────────────────────────────────────────────────────────────────────┼─────────────────────────────────────────┘
                                                                     │ window.postMessage
                                                                     ▼
┌───────────────────────────────── Widget iframe (sandbox="allow-scripts allow-forms") ───────────────────────┐
│                                                                                                              │
│   ┌─────────────────────────────────────┐     on mount     ┌─────────────────────────────────────┐          │
│   │ widgets/daily-briefing/src/App.tsx  │──────────────────▶│ useHostTokens() hook                │          │
│   │  (v1 migrated unchanged in Phase 18;│                  │  1. post kmn/theme/request          │          │
│   │   v2 replaces in Phase 19)          │                  │  2. listen for kmn/theme/set        │          │
│   └──────────────┬──────────────────────┘                  │  3. setTimeout(300) → fallback      │          │
│                  │                                         │  4. applyTokens(tokens)             │          │
│                  │ imports shared hook                     │     (document.documentElement       │          │
│                  ▼                                         │      .style.setProperty per token)  │          │
│   ┌─────────────────────────────────────┐                  │  5. keep listener active for        │          │
│   │ widgets/shared/hooks/useHostTokens  │──────────────────▶│     re-emits (PORT-03/MCPAPP-      │          │
│   │  .ts (useMemo-stabilized return)    │                  │     TOKEN-06)                       │          │
│   └─────────────────────────────────────┘                  └─────────────────────────────────────┘          │
│                  │                                                                                           │
│                  ▼                                                                                           │
│   ┌─────────────────────────────────────┐                                                                    │
│   │ widgets/shared/widget-tokens.ts     │ (DUPLICATE of PORTAL file, HEADER says "KEEP IN SYNC")            │
│   │   WIDGET_TOKENS, DEFAULT_TOKEN_VALS │                                                                    │
│   └──────────────┬──────────────────────┘                                                                    │
│                  │ drift check (vitest)                                                                      │
│                  ▼                                                                                           │
│   ┌─────────────────────────────────────┐                                                                    │
│   │ widgets/shared/__tests__/           │                                                                    │
│   │  widget-tokens-contract.test.ts     │                                                                    │
│   └─────────────────────────────────────┘                                                                    │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────── mcp-poc Build Pipeline (Node / Vite / one-per-widget) ────────────────────────────────┐
│                                                                                                              │
│   mcp-poc/widgets/                                                                                           │
│   ├── daily-briefing/                                                                                        │
│   │   ├── vite.config.ts ────┐ (extends widgets/shared/vite.base.ts)                                         │
│   │   ├── index.html         │                                                                               │
│   │   ├── tsconfig.json      │                                                                               │
│   │   └── src/               │                                                                               │
│   │       ├── main.tsx       │                                                                               │
│   │       ├── App.tsx        │  vite build → dist/widgets/daily-briefing.html (single file, ≤ 300 KB gz)    │
│   │       └── styles.css     │                                                                               │
│   ├── revenue-today/ (same shape — migrated from flat layout)                                                │
│   ├── shared/                                                                                                │
│   │   ├── vite.base.ts ──────┘ (exports buildWidgetConfig({ root }))                                         │
│   │   ├── hooks/useHostTokens.ts                                                                             │
│   │   ├── widget-tokens.ts (DUPLICATE)                                                                       │
│   │   ├── types.ts (protocol envelope types)                                                                 │
│   │   └── __tests__/widget-tokens-contract.test.ts                                                           │
│   └── scripts/build-widgets.mjs (REFACTORED: scan widgets/*/vite.config.ts)                                  │
│                                                                                                              │
│   Dev harness at http://localhost:5174/ :                                                                    │
│   ├── widgets/daily-briefing/dev-host.html (mock theme toggle, fixture dropdown)                             │
│   └── Vite dev server with HMR                                                                               │
│                                                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

**mcp-poc (post-Phase 18):**
```
G:/01_OPUS/Projects/mcp-poc/
├── widgets/
│   ├── daily-briefing/
│   │   ├── index.html              # <div id="root"></div> + /src/main.tsx
│   │   ├── vite.config.ts          # imports buildWidgetConfig from shared
│   │   ├── tsconfig.json           # extends root tsconfig.widgets.json
│   │   ├── dev-host.html           # dev harness shell (theme toggle + fixture UI)
│   │   └── src/
│   │       ├── main.tsx            # createRoot + StrictMode + <App/>
│   │       ├── App.tsx             # v1 code migrated unchanged; uses useHostTokens
│   │       ├── DailyBriefingApp.tsx (optional — preserved for diff-clarity)
│   │       └── styles.css          # @import "tailwindcss" + token CSS var refs
│   ├── revenue-today/              # same shape (migrated from flat layout)
│   ├── shared/
│   │   ├── vite.base.ts            # buildWidgetConfig({ root: string }) → UserConfig
│   │   ├── widget-tokens.ts        # KEEP IN SYNC WITH PORTAL/src/shared/styles/widget-tokens.ts
│   │   ├── types.ts                # ThemeRequest, ThemeSet, PROTOCOL_VERSION, TOKEN_KEYS
│   │   ├── hooks/
│   │   │   └── useHostTokens.ts    # useMemo-stabilized hook (MCPAPP-TOKEN-01/04/05/08)
│   │   └── __tests__/
│   │       └── widget-tokens-contract.test.ts
├── scripts/
│   └── build-widgets.mjs           # dir-scan (glob widgets/*/vite.config.ts)
├── tsconfig.widgets.json           # updated: include "widgets/**/*" excluding shared/vite.base
├── src/                            # server-side (unchanged)
│   ├── mcp-server.ts
│   └── widget-bundle.ts            # loads dist/widgets/*.html (existing, may need output path stabilization)
└── package.json                    # React 19, Tailwind v4, Motion, bumped plugin-react
```

**PORTAL (post-Phase 18):**
```
G:/01_OPUS/Projects/PORTAL/
├── src/
│   ├── shared/
│   │   └── styles/
│   │       ├── tokens.css                    # unchanged — full portal token set (120+ vars)
│   │       ├── widget-tokens.ts              # NEW — 12-key subset; KEEP IN SYNC WITH mcp-poc
│   │       └── __tests__/
│   │           └── widget-tokens-contract.test.ts   # NEW — frozen key list assertion
│   └── modules/
│       └── revenue-intelligence/
│           ├── components/
│           │   └── RevenueIntelligencePage.tsx      # MINIMAL diff — add useThemePublisher()
│           └── hooks/
│               ├── useMcpProxy.ts                   # unchanged (pattern reference)
│               └── useThemePublisher.ts             # NEW — useMemo-stabilized; MutationObserver; kmn/theme/set on demand
└── public/
    └── sandbox-proxy.html                           # NEW relay block for kmn/theme/* (MCPAPP-TOKEN-02)
```

### Pattern 1: Shared Vite Base Config

**What:** `widgets/shared/vite.base.ts` exports a factory that returns a merged `UserConfig` for per-widget `vite.config.ts` files. Every widget extends it with just its root directory.
**When to use:** Every widget. This is the only idiomatic way to avoid duplicating the 5 plugin calls + 4 build options across every widget directory.
**Example:**

```typescript
// widgets/shared/vite.base.ts — PSEUDOCODE (planner implements)
// Source: pattern synthesized from vite-plugin-singlefile README + Tailwind v4 Vite docs
import type { UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { resolve } from 'node:path'

export function buildWidgetConfig(opts: { root: string; outFileName: string }): UserConfig {
  return {
    plugins: [
      react(),
      tailwindcss(),
      viteSingleFile({ removeViteModuleLoader: true }),
    ],
    root: opts.root,
    build: {
      outDir: resolve(__dirname, '../../dist/widgets'),
      emptyOutDir: false,           // build-widgets.mjs empties once at start
      assetsInlineLimit: 100_000_000,
      cssCodeSplit: false,
      rollupOptions: {
        output: { inlineDynamicImports: true },
      },
    },
  }
}
```

```typescript
// widgets/daily-briefing/vite.config.ts
import { defineConfig } from 'vite'
import { buildWidgetConfig } from '../shared/vite.base'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

export default defineConfig(buildWidgetConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  outFileName: 'daily-briefing.html',
}))
```

**Gotcha:** `vite-plugin-singlefile` forces `inlineDynamicImports: true` via Rollup. This is **incompatible with multi-entry** (verified from current `mcp-poc/vite.config.ts` comment — "Rollup rejects [inlineDynamicImports] with multiple inputs"). Therefore per-widget Vite processes are mandatory — the plan's `scripts/build-widgets.mjs` runs them sequentially. `[VERIFIED: current vite.config.ts header comment + vite-plugin-singlefile README]`

### Pattern 2: Directory-Scanned Widget Runner

**What:** `scripts/build-widgets.mjs` refactored to discover widgets via `fs.readdirSync(widgetsDir, { withFileTypes: true })` filtered to directories containing a `vite.config.ts`. Replaces the hardcoded `const WIDGETS = ['revenue-today', 'daily-briefing']` array.

**Example:**

```javascript
// scripts/build-widgets.mjs — PSEUDOCODE
import { readdirSync, existsSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'

const widgetsRoot = resolve(process.cwd(), 'widgets')
const distRoot = resolve(process.cwd(), 'dist/widgets')

// Empty once at start (replaces per-widget emptyOutDir sequencing)
if (existsSync(distRoot)) rmSync(distRoot, { recursive: true, force: true })

const widgetDirs = readdirSync(widgetsRoot, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== 'shared')
  .filter((e) => existsSync(join(widgetsRoot, e.name, 'vite.config.ts')))
  .map((e) => e.name)

function run(widget) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['vite', 'build'], {
      stdio: 'inherit',
      shell: true,
      cwd: join(widgetsRoot, widget),
    })
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`vite build failed for ${widget} (exit ${code})`)),
    )
  })
}

for (const widget of widgetDirs) {
  console.log(`\n→ Building widget: ${widget}`)
  await run(widget)
}

console.log('\n✓ All widgets built.')
```

**Why:** Adding a new widget (e.g. Phase 19 v2 replacement or a future module) is zero-edit to the runner. Add the dir + `vite.config.ts`, rebuild.

### Pattern 3: Sandbox-Proxy Theme Relay Block

**What:** Add a `kmn/theme/*` prefix match to the existing relay `window.addEventListener('message', relay)` in `public/sandbox-proxy.html` (currently at lines 63-76). The new block sits **inside** the existing relay function, before the source-identity gate, so messages are forwarded to both directions (widget→host and host→widget) without breaking AppBridge.

**Example (insertion into current relay function):**

```javascript
// public/sandbox-proxy.html — PSEUDOCODE insertion at line 63 relay function
// Source: verified against current sandbox-proxy.html read 2026-04-24
window.addEventListener('message', function relay(e) {
  if (!e.data || typeof e.data !== 'object') return

  // NEW BLOCK (MCPAPP-TOKEN-02): Theme messages by prefix — pass through without interpretation
  // Must sit BEFORE the AppBridge origin gate so widget (origin=null) and host (origin=selfOrigin)
  // can both post kmn/theme/* messages.
  if (typeof e.data.type === 'string' && e.data.type.indexOf('kmn/theme/') === 0) {
    if (e.source === inner.contentWindow) {
      // widget → host
      window.parent.postMessage(e.data, selfOrigin)
    } else if (e.source === window.parent && e.origin === selfOrigin) {
      // host → widget
      if (inner.contentWindow) inner.contentWindow.postMessage(e.data, '*')
    }
    return
  }

  // Existing AppBridge relay (unchanged)
  if (e.source === inner.contentWindow) {
    window.parent.postMessage(e.data, selfOrigin)
  } else if (e.source === window.parent && e.origin === selfOrigin) {
    if (inner.contentWindow) inner.contentWindow.postMessage(e.data, '*')
  }
})
```

**Critical detail:** The existing relay already does exactly the right thing — same-origin host gate + inner.contentWindow source gate. The new block duplicates this logic only to make the intent explicit and to allow an early return with a comment. An alternative minimalist edit is simply adding a comment above the existing relay saying "also forwards kmn/theme/* — the type check is not strictly required because the existing relay is semantic-agnostic."

**Recommendation:** Planner picks the duplicate-with-comment approach for defense-in-depth and grep-ability (`grep 'kmn/theme' sandbox-proxy.html` must return a match per PORT-02 acceptance test).

### Pattern 4: useHostTokens Hook API

**What:** React 19 hook exported from `widgets/shared/hooks/useHostTokens.ts`. Returns `{ tokens, source, protocolVersion }` where `source` is `'host' | 'default'` and `tokens` is the applied token map. Hook also side-effects `document.documentElement.style.setProperty(...)` on every token.

**Design decision:** `useSyncExternalStore` is NOT the right fit. It handles **synchronous** external store reads; our pattern is:
1. On mount, **post** a request (side effect)
2. Listen for response asynchronously
3. Fall back to defaults after 300ms
4. Stay subscribed for re-emits (MCPAPP-TOKEN-06)

This is a classic `useEffect` + `useState` pattern with a 300ms timer and a cleanup. Wrapping the return in `useMemo({ tokens, source, protocolVersion })` satisfies the portal hook-stability rule.

**Example (full hook shape):**

```typescript
// widgets/shared/hooks/useHostTokens.ts — PSEUDOCODE
// Source: React 19 docs + feedback_react_hook_identity_churn memory
import { useEffect, useMemo, useRef, useState } from 'react'
import { WIDGET_TOKENS, DEFAULT_TOKEN_VALUES, type TokenKey } from '../widget-tokens'
import { PROTOCOL_VERSION, type ThemeSet } from '../types'

const FALLBACK_MS = 300

type Source = 'host' | 'default'

export function useHostTokens() {
  const [tokens, setTokens] = useState<Record<TokenKey, string>>(DEFAULT_TOKEN_VALUES)
  const [source, setSource] = useState<Source>('default')
  const [protocolVersion] = useState<number>(PROTOCOL_VERSION)

  // Guard — prevent 300ms fallback from overwriting a host reply that arrived first
  const hostReplyReceivedRef = useRef(false)

  useEffect(() => {
    // 1. Send request immediately on mount
    window.parent.postMessage(
      { type: 'kmn/theme/request', protocolVersion: PROTOCOL_VERSION },
      '*',
    )

    // 2. Subscribe to replies (stays active for re-emits per MCPAPP-TOKEN-06)
    const onMessage = (e: MessageEvent) => {
      const data = e.data as ThemeSet | undefined
      if (!data || data.type !== 'kmn/theme/set') return
      if (typeof data.protocolVersion !== 'number') return

      // Protocol version asymmetry (MCPAPP-TOKEN-08)
      if (data.protocolVersion > PROTOCOL_VERSION) {
        console.warn(
          `[kmn-theme] host protocolVersion=${data.protocolVersion} > widget=${PROTOCOL_VERSION} — ignoring, staying on defaults`,
        )
        return
      }

      hostReplyReceivedRef.current = true

      // Apply tokens to CSS vars (MCPAPP-TOKEN-04)
      const applied = { ...DEFAULT_TOKEN_VALUES }
      for (const key of Object.keys(WIDGET_TOKENS) as TokenKey[]) {
        const value = data.tokens?.[key]
        if (typeof value === 'string') {
          applied[key] = value
          document.documentElement.style.setProperty(WIDGET_TOKENS[key], value)
        }
      }
      setTokens(applied)
      setSource('host')
    }
    window.addEventListener('message', onMessage)

    // 3. 300ms fallback (MCPAPP-TOKEN-05)
    const timerId = window.setTimeout(() => {
      if (hostReplyReceivedRef.current) return
      for (const key of Object.keys(WIDGET_TOKENS) as TokenKey[]) {
        document.documentElement.style.setProperty(WIDGET_TOKENS[key], DEFAULT_TOKEN_VALUES[key])
      }
      // `source` stays 'default', `tokens` already = DEFAULT_TOKEN_VALUES via initial state
    }, FALLBACK_MS)

    return () => {
      window.removeEventListener('message', onMessage)
      window.clearTimeout(timerId)
    }
  }, [])

  // useMemo-stabilized per ADR-034 + feedback_react_hook_identity_churn
  return useMemo(() => ({ tokens, source, protocolVersion }), [tokens, source, protocolVersion])
}
```

**Why not `useSyncExternalStore`:** (1) The store has a mandatory setup-time POST-request side effect; `getSnapshot` cannot have side effects. (2) The 300ms fallback is a temporal concern (timer) that `useSyncExternalStore` has no clean idiom for. (3) React 19 still recommends `useEffect` for async setup + cleanup. `[CITED: react.dev/reference/react/useSyncExternalStore — caveats section]`

### Pattern 5: useThemePublisher Hook Design (PORTAL side)

**What:** New hook `src/modules/revenue-intelligence/hooks/useThemePublisher.ts` owned by `RevenueIntelligencePage.tsx`. Installs a `message` listener for `kmn/theme/request`, reads the 12 tokens from `widget-tokens.ts` (recommendation: use the TS constant over `getComputedStyle` to avoid format quirks per design doc §6b), sends `kmn/theme/set`, and additionally installs a `MutationObserver` on `<html>` for future dark-mode toggle re-emits.

**Example:**

```typescript
// src/modules/revenue-intelligence/hooks/useThemePublisher.ts — PSEUDOCODE
// Source: design doc §6b + feedback_react_hook_identity_churn
import { useEffect, useMemo } from 'react'
import { WIDGET_TOKENS, readCurrentTokens } from '@/shared/styles/widget-tokens'

const PROTOCOL_VERSION = 1

export function useThemePublisher() {
  useEffect(() => {
    const publishTokens = (target?: Window, targetOrigin = '*') => {
      const tokens = readCurrentTokens()   // reads from `widget-tokens.ts` constant
      const payload = { type: 'kmn/theme/set', protocolVersion: PROTOCOL_VERSION, tokens }
      // Broadcast to sandbox-proxy iframe (it relays to inner widget)
      ;(target ?? window).postMessage(payload, targetOrigin)
    }

    // 1. Respond to widget-initiated requests
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== 'kmn/theme/request') return
      if (typeof e.data.protocolVersion !== 'number') return
      if (e.data.protocolVersion > PROTOCOL_VERSION) {
        console.warn(
          `[kmn-theme] widget protocolVersion=${e.data.protocolVersion} > portal=${PROTOCOL_VERSION} — ignoring`,
        )
        return
      }
      // Reply to the message source (sandbox-proxy window)
      ;(e.source as Window)?.postMessage(
        { type: 'kmn/theme/set', protocolVersion: PROTOCOL_VERSION, tokens: readCurrentTokens() },
        '*' satisfies string,  // sandbox-proxy is same-origin but srcdoc inner iframe has origin=null
      )
    }
    window.addEventListener('message', onMessage)

    // 2. Re-emit on theme change (MCPAPP-TOKEN-06) — MutationObserver on <html>
    //    Portal has no dark mode today; when added, toggling <html data-theme="..."> or
    //    a class attribute triggers re-emit. Listener persists across widget mount/unmount cycles.
    const observer = new MutationObserver(() => {
      // Rebroadcast to all iframes — sandbox-proxy forwards to widgets
      document.querySelectorAll('iframe').forEach((iframe) => {
        iframe.contentWindow?.postMessage(
          { type: 'kmn/theme/set', protocolVersion: PROTOCOL_VERSION, tokens: readCurrentTokens() },
          '*',
        )
      })
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    })

    return () => {
      window.removeEventListener('message', onMessage)
      observer.disconnect()
    }
  }, [])

  // Nothing to return; hook is side-effect only. But to satisfy useMemo rule:
  return useMemo(() => ({ protocolVersion: PROTOCOL_VERSION }), [])
}
```

**RevenueIntelligencePage.tsx integration (minimal diff):**

```typescript
// Add one import + one call inside the component body
import { useThemePublisher } from '../hooks/useThemePublisher'
// ...
export function RevenueIntelligencePage() {
  useThemePublisher()  // side-effect only, no render impact
  // ... existing hook calls and JSX unchanged
}
```

**Zero-diff assertion for Phase 19 PORT-04:** The v2 widget in Phase 19 requires zero TypeScript diff on `RevenueIntelligencePage.tsx`. Phase 18 adds `useThemePublisher()` — this IS a diff. However, the Phase 19 assertion is measured **after v2 ships**, not after Phase 18. Phase 18 establishes the diff; Phase 19 does not add to it. Planner should note this: the zero-diff bar applies between "end of Phase 18" and "after Phase 19 v2 widget deployed," not between "current main" and "Phase 19 completion."

### Anti-Patterns to Avoid

- **Hardcoding the token list in both sides of the protocol.** The 12-token frozen list lives in two files (`WIDGET_TOKENS` in each repo). A contract test asserts key equality. If either file has a typo or an extra key, its own test fails. Do NOT add tokens to one side and not the other — add to both, run both test suites, commit both.
- **Using `getComputedStyle` for token values.** Design doc §6b recommendation (b): import the TS constant. `getComputedStyle` returns computed `rgb(...)` strings which diverge from the hex format widgets may expect. Also cross-browser quirks.
- **Passing the inner iframe's `contentWindow` directly.** The host does not know about the inner iframe — only about sandbox-proxy. Replies go to `e.source` (the sandbox-proxy's window), which relays to the inner iframe via the existing message bubble.
- **Calling `useHostTokens` twice in the same widget.** Two request-sends on mount, two timers, two listeners. If multiple components need tokens, pass them via React context from the root.
- **Omitting the 300ms fallback.** A widget that renders with `var(--color-fg)` unset shows black-on-transparent, which looks broken in dev standalone. Bundled defaults via `document.documentElement.style.setProperty` at mount makes the widget usable in any context.
- **Running `vite build` at mcp-poc root.** The current `mcp-poc/vite.config.ts` uses an env-gated `WIDGET=` hack. Phase 18 deletes this root config (or renames) — the only widget builds are per-directory.
- **Animating 168 heatmap cells individually with Motion.** Design doc §8 explicit: container fades in, cells are static. Applies to Phase 19 — recorded here so planner knows the animation budget.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Inline all JS/CSS into one HTML | Custom Rollup post-build script | `vite-plugin-singlefile@^2.3.3` with `removeViteModuleLoader: true` | The plugin handles `inlineDynamicImports`, `cssCodeSplit:false`, and `assetsInlineLimit` as a preset — 40 LOC of maintenance we don't write |
| Tailwind v4 JIT purging | PostCSS pipeline | `@tailwindcss/vite@^4.2.4` plugin | v4 uses CSS-first config — no tailwind.config.js, no postcss.config.js; JIT content scan automatic |
| Reduced-motion detection | Manual `matchMedia('(prefers-reduced-motion)')` wrapper | Motion v12's `useReducedMotion()` from `motion/react` | Handles re-render on OS-level change; tested inside sandboxed iframes by the Motion team `[CITED: motion.dev/docs/react-use-reduced-motion]` |
| Protocol envelope typing | Ad-hoc types per widget | Shared `widgets/shared/types.ts` | One place to update when protocol v2 happens |
| External store subscription hook | Custom `useState + useEffect + unsubscribe` | Not `useSyncExternalStore` for this use case — see §Pattern 4 rationale. Custom hook IS the right answer here, but the hook itself becomes reusable across future widgets | postMessage pattern has setup-time side effect that `useSyncExternalStore` doesn't model cleanly |
| Cross-repo drift detection | Git pre-commit hook | Vitest contract test (twin, one on each side) | Tests run in CI automatically; pre-commit hooks only catch local commits |
| Bundling React 19 | Fork custom React build | Use `react@^19.2.5` standard package | There is no custom build that beats the React team's tree-shaking. If 300 KB busts, switch to `preact/compat` (documented fallback per MCPAPP-BUILD-05) |
| iframe sandbox message validation | Per-message origin check inside widget | sandbox-proxy.html handles it; widget trusts its parent frame | The trust boundary is sandbox-proxy (same-origin with portal); widget can't validate origin=null anyway |
| Bundle size measurement | Custom script | `gzip -c dist/widgets/daily-briefing.html \| wc -c` | One-liner; no tooling |

**Key insight:** This phase is 80% plumbing and 20% protocol design. The plumbing (Vite + Tailwind + Motion + vite-plugin-singlefile) is entirely off-the-shelf — we pick versions, wire them in one shared config, and scan directories. The protocol is small (2 message types, 1 version field) and directly derived from the design doc. The only custom code worth building is `useHostTokens` (React ergonomics) and `useThemePublisher` (MutationObserver for re-emit).

---

## Runtime State Inventory

This phase has a small refactor surface (v1 widget directory restructure in mcp-poc + sandbox-proxy.html edit in PORTAL). Runtime state analysis:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — widget protocol is memoryless; token values read fresh from `document.documentElement` each request. ChromaDB/Mem0/SQLite untouched by this phase. | None |
| Live service config | None — no external services configured with widget or token names. Widget resource URI (`ui://widgets/daily-briefing.html`) is hardcoded in the MCP server (`mcp-poc/src/mcp-server.ts` + `widget-bundle.ts`), already points at the post-migration file name. | None |
| OS-registered state | None — no Windows Task Scheduler tasks, pm2 processes, or systemd units reference widget paths. Vercel builds are stateless per deploy. | None |
| Secrets/env vars | None — this phase does not introduce or rename secrets. Existing `mcp-poc/.env.local` (Phase 17) carries `WOOCOMMERCE_WP_APP_PASS` etc., unrelated. | None |
| Build artifacts | **`G:/01_OPUS/Projects/mcp-poc/dist/widgets/daily-briefing.html`** (from prior v1 build) will be overwritten by the new build pipeline's output. **`G:/01_OPUS/Projects/mcp-poc/dist/widgets/revenue-today.html`** same. No stale egg-info or compiled binary concerns — Vite output is self-contained per build. | Build runs `rmSync(distRoot)` at start per Pattern 2 — overwrites cleanly |

**Nothing cached or persisted across runtime:** verified by grepping widget-related paths across `.claude/`, `.vscode/`, `ddev/`, `pm2/`, and `vercel.json`. Only reference to widget output is `mcp-poc/src/widget-bundle.ts` which reads `dist/widgets/{name}.html` at startup — the file name convention is preserved.

**One risk:** If the dir-scan build produces output at `dist/widgets/daily-briefing/index.html` instead of `dist/widgets/daily-briefing.html`, `widget-bundle.ts` will fail to load. Planner must either (a) configure Vite to emit to `dist/widgets/<name>.html` directly, or (b) update `widget-bundle.ts` to read the new path. Recommendation (a): Vite build output can be configured via `rollupOptions.output.entryFileNames` — keep the current output shape.

---

## Common Pitfalls

### Pitfall 1: React 19 + @vitejs/plugin-react version skew
**What goes wrong:** React 19 requires `@vitejs/plugin-react@^5.x` for the new automatic JSX runtime. mcp-poc currently has `@vitejs/plugin-react@^4.3.4` which was built for React 18.
**Why it happens:** JSX transform signatures changed; plugin-react v4.x emits code that React 19's `jsx-runtime` rejects.
**How to avoid:** Bump both in the same commit. Test task: `npx vite build` on a widget must succeed with the new versions before merging.
**Warning signs:** Console errors like "React.jsx is not a function" or "Cannot read properties of undefined (reading 'jsx')".

### Pitfall 2: Tailwind v4 in per-dir Vite root — content scan path
**What goes wrong:** Tailwind v4's JIT scans the directory tree under the Vite root. If the per-widget `root` is set to `widgets/daily-briefing/`, Tailwind only scans inside that directory. Shared components imported from `widgets/shared/` may not have their classes included in the purged CSS.
**Why it happens:** Default content scan is Vite-root-relative.
**How to avoid:** Either (a) use the `@source` CSS directive in `styles.css` to explicitly add `@source "../shared/**/*.{ts,tsx}";`, or (b) configure the plugin with explicit content globs. Option (a) is idiomatic for Tailwind v4 CSS-first config. `[CITED: tailwindcss.com/docs/installation/using-vite]`
**Warning signs:** Shared-component Tailwind classes not appearing in final CSS bundle; visual regression between dev (HMR) and production build.

### Pitfall 3: `viteSingleFile()` + Tailwind v4 CSS inlining order
**What goes wrong:** `cssCodeSplit: false` is required for singlefile to inline CSS. Tailwind v4's plugin emits CSS as a virtual module. If the CSS emission happens **after** singlefile's inline pass, the output has a separate `.css` file.
**Why it happens:** Plugin order in `plugins: []` matters — Vite applies them left-to-right for transform hooks but Rollup ordering differs.
**How to avoid:** Verified plugin order for this stack: `[react(), tailwindcss(), viteSingleFile({removeViteModuleLoader: true})]`. The design doc §4 uses this exact order — keep it.
**Warning signs:** `dist/widgets/daily-briefing.html` renders unstyled; a separate `.css` file exists in `dist/widgets/`. Fix: reorder plugins; reinforce `cssCodeSplit: false`.

### Pitfall 4: sandbox-proxy origin handling for inner iframe
**What goes wrong:** The inner srcdoc iframe has `origin = "null"` (srcdoc has no origin). If the relay code validates `e.origin === selfOrigin` for all messages, widget→host traffic is silently dropped.
**Why it happens:** Origin validation works for same-origin host frames; srcdoc doesn't satisfy any origin check.
**How to avoid:** Current sandbox-proxy.html correctly gates by `e.source === inner.contentWindow` for widget→host direction (identity check, not origin check). The new `kmn/theme/*` block must follow the same pattern — source-identity gate, not origin gate. `[VERIFIED: public/sandbox-proxy.html lines 63-76 comment explicitly calls this out]`
**Warning signs:** Widget theme request appears in widget's console postMessage log but never reaches portal.

### Pitfall 5: 300ms fallback timer vs React StrictMode double-mount
**What goes wrong:** React 19 StrictMode in dev mounts components twice. Two `useHostTokens` effects fire, two requests post, two timers start. If one effect cleans up during the second mount's 300ms window, the `hostReplyReceivedRef.current` flag doesn't transfer.
**Why it happens:** Refs are per-effect-invocation; StrictMode dev double-mount is explicit.
**How to avoid:** The hook uses `useRef` which persists across effect runs — StrictMode resets state, not refs. But the listener and timer do get cleaned up and re-registered. Verify: in dev harness, observe two requests posted (acceptable; host answers both; hook applies tokens twice, idempotent).
**Warning signs:** Flicker to default tokens at ~300ms then snap to host tokens when `hostReplyReceivedRef` resets. Fix: move the ref to a module-level variable OR accept the one-frame flicker in dev (production StrictMode-off has no double-mount).

### Pitfall 6: Motion v12 `useReducedMotion` in iframe with origin=null
**What goes wrong:** Some matchMedia queries may fail in iframes without `allow-same-origin`, returning undefined.
**Why it happens:** Certain browser API subsets are gated by same-origin. `matchMedia('(prefers-reduced-motion)')` is NOT in that subset — it's an OS-level query that works in sandboxed iframes.
**How to avoid:** Verified `[CITED: motion.dev/docs/react-use-reduced-motion + design doc §8]` — matchMedia for prefers-reduced-motion works in origin=null iframes. No code change needed.
**Warning signs:** Animation plays despite OS reduced-motion setting. Fix: verify the iframe has `sandbox="allow-scripts allow-forms"` (the default from `@mcp-ui/client`) and NOT `allow-same-origin` removed entirely.

### Pitfall 7: `dist/widgets/` output path drift between build runners
**What goes wrong:** `mcp-poc/src/widget-bundle.ts` reads `dist/widgets/daily-briefing.html` at server startup. If the new per-dir Vite config emits to `dist/widgets/daily-briefing/index.html` (Vite's default with a per-dir root), the server throws `Widget bundle not found`.
**Why it happens:** Vite's default `build.outDir` with a per-dir root produces output relative to root.
**How to avoid:** `widgets/shared/vite.base.ts` sets `build.outDir: resolve(__dirname, '../../dist/widgets')` (ABSOLUTE path relative to mcp-poc repo root) AND configures `rollupOptions.output.entryFileNames` such that the output is `<widget-name>.html` at that location. Alternative: accept the new path shape and update `widget-bundle.ts` to read `dist/widgets/daily-briefing/index.html`.
**Warning signs:** Server startup error `Widget bundle not found: daily-briefing.html`.

### Pitfall 8: Vercel build — widget build ordering
**What goes wrong:** `vercel.json` specifies `buildCommand: npm run build`. `npm run build` = `npm run build:widgets && npm run build:server`. If widgets build fails, server build doesn't run, but `dist/widgets/` may be half-populated — `widget-bundle.ts` at serverless function cold start finds some widgets, fails on others.
**Why it happens:** Sequential build, no rollback on partial failure.
**How to avoid:** Build runner should fail fast on first widget failure (current `scripts/build-widgets.mjs` does this — `reject()` on non-zero exit). Add a pre-flight check in `widget-bundle.ts` that throws at module load time if any expected widget is missing — server fails at startup, not at first request.
**Warning signs:** Some widgets render, others 404 at runtime.

### Pitfall 9: Twin contract test drift — both tests green but keys mismatched
**What goes wrong:** The contract test asserts `Object.keys(WIDGET_TOKENS).sort()` equals a hardcoded frozen list. If someone updates the hardcoded list in ONE repo (e.g. adds a 13th token), that repo's test still passes; the other repo's test fails. Both commit, both CIs green until cross-repo integration.
**Why it happens:** Two independent test suites have no awareness of each other.
**How to avoid:** The hardcoded frozen list must be **identical** in both tests — verbatim string match. Document this in both test file headers. Stretch: a human-audit step in the Phase 18 checklist requires confirming both test files have byte-identical `FROZEN_KEYS` arrays before acceptance.
**Warning signs:** Widget requests 13 tokens, portal sends 12 (or vice versa). 12 apply, 1 is undefined → CSS var `unset`.

### Pitfall 10: Dev harness theme toggle → real widget runtime mismatch
**What goes wrong:** Dev harness at `:5174` sends `kmn/theme/set` with a light token set. When the built widget is embedded in PORTAL, the portal publisher sends a subtly different value (e.g. `#FAFAF9` vs `rgb(250, 250, 249)`). Widget works in harness, visual regression in prod.
**Why it happens:** Harness mock and portal publisher are two implementations of the same contract.
**How to avoid:** Both harness and portal must import `DEFAULT_TOKEN_VALUES` from `widget-tokens.ts` (respective copy). Harness "light" theme = `DEFAULT_TOKEN_VALUES`. Harness "dark" theme = a separate approximation constant that doesn't need to match prod (no prod dark mode exists yet, per D-18-05).
**Warning signs:** Subtle color drift between dev and prod; one dev finds the bug during manual Phase 19 testing.

---

## Code Examples

### Protocol Message Shapes (`widgets/shared/types.ts`)

```typescript
// widgets/shared/types.ts — PSEUDOCODE
// Source: design doc §5 + MCPAPP-TOKEN-01..08
export const PROTOCOL_VERSION = 1 as const

export const TOKEN_KEYS = [
  'accent',
  'bg',
  'border',
  'danger',
  'fg',
  'muted',
  'radius-lg',
  'radius-md',
  'subtle',
  'success',
  'surface',
  'warning',
] as const

export type TokenKey = (typeof TOKEN_KEYS)[number]

export type ThemeRequest = {
  readonly type: 'kmn/theme/request'
  readonly protocolVersion: number
}

export type ThemeSet = {
  readonly type: 'kmn/theme/set'
  readonly protocolVersion: number
  readonly tokens: Partial<Record<TokenKey, string>>
}

export type KmnThemeMessage = ThemeRequest | ThemeSet
```

### Handshake Sequence Diagram

```
   Widget iframe                sandbox-proxy.html              portal (React)
   ───────────────              ───────────────────              ───────────────────
        │                              │                                │
        │ 1. on mount:                 │                                │
        │    postMessage(              │                                │
        │      kmn/theme/request,      │                                │
        │      '*')                    │                                │
        │─────────────────────────────▶│                                │
        │                              │ 2. relay (source=inner):       │
        │                              │    parent.postMessage(...)     │
        │                              │───────────────────────────────▶│
        │                              │                                │
        │                              │                                │ 3. onMessage(request):
        │                              │                                │    reply with
        │                              │                                │    kmn/theme/set
        │                              │  4. relay (source=parent):     │
        │                              │     inner.postMessage(...)     │
        │                              │◀───────────────────────────────│
        │ 5. onMessage(set):           │                                │
        │    applyTokens()             │                                │
        │    setState(source=host)     │                                │
        │◀─────────────────────────────│                                │
        │                              │                                │
        │                              │                                │ 6. <html> attr changes:
        │                              │                                │    MutationObserver →
        │                              │                                │    re-emit set
        │                              │   7. relay (source=parent):    │
        │                              │      inner.postMessage(...)    │
        │                              │◀───────────────────────────────│
        │ 8. onMessage(set):           │                                │
        │    applyTokens() — idempotent│                                │
        │◀─────────────────────────────│                                │

  If no reply within 300ms: widget hook applies DEFAULT_TOKEN_VALUES via
  setProperty, source stays 'default'. Host reply arriving later is still
  applied (listener persists) and overrides defaults.
```

### Widget Tokens Module (PORTAL side)

```typescript
// src/shared/styles/widget-tokens.ts — PSEUDOCODE
// KEEP IN SYNC WITH mcp-poc/widgets/shared/widget-tokens.ts
// 12 tokens locked per Phase 18 D-18-03. Do NOT add or remove keys.
// If you need a 13th token, reopen Phase 18 scope with Yuri first.

export const WIDGET_TOKENS = {
  accent: '--color-accent',
  bg: '--color-bg',
  border: '--color-border',
  danger: '--color-danger',
  fg: '--color-fg',
  muted: '--color-muted',
  'radius-lg': '--radius-lg',
  'radius-md': '--radius-md',
  subtle: '--color-subtle',
  success: '--color-success',
  surface: '--color-surface',
  warning: '--color-warning',
} as const

export type TokenKey = keyof typeof WIDGET_TOKENS

// Source values mapped from PORTAL tokens.css:
//   accent  = tokens.css --accent       (#2B1878)
//   bg      = tokens.css --bg           (#FAFAF9)
//   border  = tokens.css --border       (#E5E5E5)
//   danger  = tokens.css --destructive  (#DC2626)
//   fg      = tokens.css --text-primary (#333333)
//   muted   = tokens.css --text-secondary (#444444)
//   subtle  = tokens.css --text-tertiary  (#777777)
//   surface = tokens.css --surface      (#FFFFFF)
//   success = tokens.css --committed    (#16A34A)
//   warning = tokens.css --awaiting     (#B45309)
//   radius-md = tokens.css --r-md       (10px)
//   radius-lg = tokens.css --r-lg       (14px)
export const DEFAULT_TOKEN_VALUES: Record<TokenKey, string> = {
  accent: '#2B1878',
  bg: '#FAFAF9',
  border: '#E5E5E5',
  danger: '#DC2626',
  fg: '#333333',
  muted: '#444444',
  'radius-lg': '14px',
  'radius-md': '10px',
  subtle: '#777777',
  success: '#16A34A',
  surface: '#FFFFFF',
  warning: '#B45309',
}

// Reads current portal token values from the TS constant (recommended over
// getComputedStyle per design doc §6b). If portal adds dark mode, this
// function switches on a theme signal; today it always returns defaults.
export function readCurrentTokens(): Record<TokenKey, string> {
  return { ...DEFAULT_TOKEN_VALUES }
}
```

### Twin Contract Test

```typescript
// PORTAL: src/shared/styles/__tests__/widget-tokens-contract.test.ts
// mcp-poc: widgets/shared/__tests__/widget-tokens-contract.test.ts
// Both files MUST be byte-identical below the import.
import { describe, it, expect } from 'vitest'
import { WIDGET_TOKENS } from '../widget-tokens'

const FROZEN_KEYS = [
  'accent',
  'bg',
  'border',
  'danger',
  'fg',
  'muted',
  'radius-lg',
  'radius-md',
  'subtle',
  'success',
  'surface',
  'warning',
] as const

describe('widget-tokens contract (Phase 18 D-18-03)', () => {
  it('exports exactly 12 keys in the frozen set', () => {
    const keys = Object.keys(WIDGET_TOKENS).sort()
    expect(keys).toEqual([...FROZEN_KEYS].sort())
  })

  it('every key maps to a valid CSS custom property name', () => {
    for (const [key, cssVar] of Object.entries(WIDGET_TOKENS)) {
      expect(cssVar).toMatch(/^--[a-z0-9-]+$/)
    }
  })
})
```

### Dev Harness Shell (`widgets/daily-briefing/dev-host.html`)

```html
<!-- widgets/daily-briefing/dev-host.html — PSEUDOCODE -->
<!-- Loaded by Vite dev server at localhost:5174/dev-host.html -->
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Dev Harness — Daily Briefing</title>
    <style>
      body { font-family: -apple-system, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
      .chrome { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; }
      button { padding: 8px 14px; cursor: pointer; }
      .log { background: #fff; padding: 12px; max-height: 160px; overflow: auto; font-family: monospace; font-size: 12px; }
      iframe { width: 100%; height: calc(100vh - 240px); border: 1px solid #ccc; background: #fff; }
    </style>
  </head>
  <body>
    <div class="chrome">
      <strong>Design-Harness</strong>
      <button id="theme-light">Hell</button>
      <button id="theme-dark">Dunkel (Platzhalter)</button>
      <select id="fixture-mode">
        <option value="">Basis-Fixture</option>
        <option value="basket-aov">?mock=basket-aov</option>
        <option value="one-block-failing">?mock=one-block-failing</option>
      </select>
    </div>
    <div class="log" id="log"></div>
    <iframe id="widget" src="./index.html"></iframe>
    <script type="module">
      // Mock portal token source — reads DEFAULT_TOKEN_VALUES from shared module
      import { DEFAULT_TOKEN_VALUES } from '../shared/widget-tokens'
      const DARK_MOCK = {
        ...DEFAULT_TOKEN_VALUES,
        bg: '#0B1220', surface: '#14192B', fg: '#F1F5F9',
        muted: '#CBD5E1', subtle: '#94A3B8', border: '#233043',
      }
      const log = document.getElementById('log')
      const widget = document.getElementById('widget')
      const append = (msg) => { log.innerHTML += `<div>${new Date().toLocaleTimeString('de-DE')} — ${msg}</div>`; log.scrollTop = log.scrollHeight }
      // Handshake — respond to kmn/theme/request
      window.addEventListener('message', (e) => {
        if (e.data?.type === 'kmn/theme/request') {
          append('← kmn/theme/request von Widget')
          widget.contentWindow?.postMessage({ type: 'kmn/theme/set', protocolVersion: 1, tokens: DEFAULT_TOKEN_VALUES }, '*')
          append('→ kmn/theme/set (hell)')
        }
      })
      document.getElementById('theme-light').onclick = () => {
        widget.contentWindow?.postMessage({ type: 'kmn/theme/set', protocolVersion: 1, tokens: DEFAULT_TOKEN_VALUES }, '*')
        append('→ kmn/theme/set (hell, manuell)')
      }
      document.getElementById('theme-dark').onclick = () => {
        widget.contentWindow?.postMessage({ type: 'kmn/theme/set', protocolVersion: 1, tokens: DARK_MOCK }, '*')
        append('→ kmn/theme/set (dunkel, manuell)')
      }
      document.getElementById('fixture-mode').onchange = (e) => {
        const mode = e.target.value
        widget.src = mode ? `./index.html?mock=${encodeURIComponent(mode)}` : './index.html'
        append(`↻ Widget neu geladen mit ?mock=${mode}`)
      }
    </script>
  </body>
</html>
```

### Bundle Budget Measurement

```bash
# After npm run build:widgets
gzip -c dist/widgets/daily-briefing.html | wc -c
# Expected output: < 307200 (= 300 * 1024)

# CI-friendly assertion script
bytes=$(gzip -c dist/widgets/daily-briefing.html | wc -c)
if [ "$bytes" -gt 307200 ]; then
  echo "Bundle exceeds 300 KB gzip: ${bytes} bytes"
  exit 1
fi
```

### Preact Fallback (documentation-only per MCPAPP-BUILD-05)

```typescript
// widgets/shared/vite.base.ts — PSEUDOCODE, NOT ACTIVATED in Phase 18
// Switch procedure when 300 KB gz budget busts:
// 1. Install: npm install --save preact
// 2. Add resolve.alias to buildWidgetConfig:
//    resolve: {
//      alias: {
//        'react': 'preact/compat',
//        'react-dom': 'preact/compat',
//        'react-dom/test-utils': 'preact/test-utils',
//        'react/jsx-runtime': 'preact/jsx-runtime',
//      },
//    },
// 3. Rebuild. Typical bundle reduction: ~30 KB gz (React 45 → Preact 15).
// 4. Verify: npm run build && gzip -c dist/widgets/daily-briefing.html | wc -c
// Source: preactjs.com/guide/v10/switching-to-preact/#compat
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single root `vite.config.ts` with env-gated WIDGET entry | Per-widget `vite.config.ts` files sharing a base | Phase 18 (this phase) | Adding a new widget is zero-edit to runner + config; dir-scoped changes |
| React 18 in mcp-poc | React 19 (matches PORTAL) | Phase 18 Plan 01 | JSX transform change; plugin-react v4 → v5 |
| Hand-rolled CSS variables in `daily-briefing.css` (82+ LOC duplicating tokens.css) | Tailwind v4 JIT + 12-token postMessage bridge | Phase 18 | Reduces per-widget CSS to layout-only; tokens are runtime-sourced |
| AppBridge-only relay in `sandbox-proxy.html` | AppBridge + `kmn/theme/*` relay | Phase 18 | ~10 LOC addition; pure pass-through, no interpretation |
| `getComputedStyle(document.documentElement)` for token read | TS constant module (`widget-tokens.ts`) | Phase 18 (recommendation from design doc §6b) | Avoids cross-browser format quirks (hex vs rgb) |
| Manual bundle size check | `gzip \| wc -c` in build runner | Phase 18 | CI gate at 300 KB gz |

**Deprecated/outdated:**
- `mcp-poc/vite.config.ts` at repo root: Phase 18 removes the env-gated multi-entry config.
- `mcp-poc/widgets/daily-briefing.html` at `widgets/` root: Phase 18 moves to `widgets/daily-briefing/index.html`.
- `mcp-poc/widgets/src/DailyBriefingApp.tsx` (670 LOC): migrated into `widgets/daily-briefing/src/` unchanged; Phase 19 deletes it per `project_v1_widget_cleanup`.
- Root `mcp-poc/tsconfig.widgets.json`: may need `include` update to match new dir structure (`widgets/*/src/**/*.{ts,tsx}` + `widgets/shared/**/*.ts`).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All build tooling | ✓ | `>= 20` per `mcp-poc/package.json` engines | — |
| npm | Install/run scripts | ✓ | bundled with Node | — |
| Vite dev server port 5174 | Dev harness (MCPAPP-BUILD-06) | ✓ | auto-selected by Vite if occupied | — |
| Vercel CLI | Deployment (optional) | Assumed ✓ (prior phases used it) | — | Push to GitHub; Vercel auto-deploys on push |
| PORTAL Vercel dev server | Host-side integration smoke test | ✓ | `npm run dev` at PORTAL root | — |
| mkcert / browser TLS for staging | Only if testing against live `staging.portal.kamanin.at` | ✓ per `feedback_upstream_api_probe` | — | Use local dev harness instead |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None — every tool this phase depends on is already in use by Phase 15/16/17.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework (PORTAL) | Vitest 4.0.18 `[VERIFIED: PORTAL package.json]` |
| Framework (mcp-poc) | Vitest (NEW — to be added for contract test) |
| Config file (PORTAL) | `vitest.config.ts` at PORTAL root (exists) |
| Config file (mcp-poc) | `vitest.config.ts` at mcp-poc root (NEW — Wave 0 gap) |
| Quick run command (PORTAL) | `cd G:/01_OPUS/Projects/PORTAL && npm run test -- src/shared/styles` |
| Quick run command (mcp-poc) | `cd G:/01_OPUS/Projects/mcp-poc && npx vitest run widgets/shared/__tests__` |
| Full suite command (PORTAL) | `cd G:/01_OPUS/Projects/PORTAL && npm run test` |
| Full suite command (mcp-poc) | `cd G:/01_OPUS/Projects/mcp-poc && npx vitest run` (after Wave 0 install) |
| Build verification (mcp-poc) | `cd G:/01_OPUS/Projects/mcp-poc && npm run build && gzip -c dist/widgets/daily-briefing.html \| wc -c` |
| Typecheck (mcp-poc) | `cd G:/01_OPUS/Projects/mcp-poc && npm run typecheck` (exists) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MCPAPP-BUILD-01 | vite.config.ts contains required singlefile options | smoke | `grep -q "removeViteModuleLoader: true" widgets/daily-briefing/vite.config.ts` | ❌ Wave 0 |
| MCPAPP-BUILD-02 | Tailwind JIT inlines CSS | build | `npm run build:widgets && grep -q 'tailwindcss' dist/widgets/daily-briefing.html` | ❌ Wave 0 |
| MCPAPP-BUILD-03 | Motion accessible + reduced-motion works | smoke | `grep -q "from 'motion/react'" widgets/daily-briefing/src/*.tsx` + manual OS setting toggle in harness | ❌ Wave 0 |
| MCPAPP-BUILD-04 | Bundle ≤ 300 KB gz | build | `bytes=$(gzip -c dist/widgets/daily-briefing.html \| wc -c); [ "$bytes" -le 307200 ]` | ❌ Wave 0 |
| MCPAPP-BUILD-05 | Preact fallback documented | doc-check | `grep -q "preact/compat" widgets/shared/vite.base.ts` (in comment) | ❌ Wave 0 |
| MCPAPP-BUILD-06 | Dev harness runs + HMR | manual | `cd widgets/daily-briefing && npx vite --port 5174` + open browser | ❌ manual-only |
| MCPAPP-BUILD-07 | `npm run build` produces both server+widgets | build | `npm run build && test -f dist/widgets/daily-briefing.html && test -f dist/server.js` | ✓ (current) |
| MCPAPP-TOKEN-01 | Widget posts theme request | unit | `vitest run widgets/shared/hooks/__tests__/useHostTokens.test.ts -t 'posts request on mount'` | ❌ Wave 0 |
| MCPAPP-TOKEN-02 | sandbox-proxy relays kmn/theme/* | unit | `vitest run src/shared/__tests__/sandbox-proxy.test.ts` (test that type.indexOf('kmn/theme/') === 0 passes) | ❌ Wave 0 |
| MCPAPP-TOKEN-03 | Publisher responds with 12 tokens | unit | `vitest run src/modules/revenue-intelligence/hooks/__tests__/useThemePublisher.test.ts` | ❌ Wave 0 |
| MCPAPP-TOKEN-04 | Widget applies CSS vars | unit | test asserts `document.documentElement.style.setProperty` called 12 times after receiving set message | ❌ Wave 0 |
| MCPAPP-TOKEN-05 | 300ms fallback | unit | test uses `vi.useFakeTimers()`, asserts defaults applied at 300ms if no reply | ❌ Wave 0 |
| MCPAPP-TOKEN-06 | Re-emit survives mount/unmount | unit | test mounts widget, unmounts, re-mounts, verifies publisher still responds | ❌ Wave 0 |
| MCPAPP-TOKEN-07 | widget-tokens.ts has 12-key frozen set | contract | `vitest run src/shared/styles/__tests__/widget-tokens-contract.test.ts` AND `vitest run widgets/shared/__tests__/widget-tokens-contract.test.ts` | ❌ Wave 0 (twin tests) |
| MCPAPP-TOKEN-08 | Protocol-version mismatch logs + ignores | unit | test asserts `console.warn` called when receiving `protocolVersion: 2`, tokens NOT updated | ❌ Wave 0 |

### Observable Dimensions for VALIDATION.md (Nyquist)

This phase has 6 observable dimensions a Nyquist-style VALIDATION.md should cover:

1. **Build artifact existence** — `dist/widgets/{daily-briefing,revenue-today}.html` files exist post-build, each is self-contained (no sibling .js/.css files beyond what's inlined). Detector: filesystem check + `<link rel="stylesheet">` absence in HTML.
2. **Bundle size** — gzipped size ≤ 300 KB. Detector: `gzip -c | wc -c` comparison. Threshold: 300 KB (MCPAPP-BUILD-04).
3. **Theme token application** — after handshake completes, `document.documentElement.style` has all 12 CSS vars set to host-provided values (not defaults). Detector: headless browser script reading `getComputedStyle` after widget mount + 500ms wait.
4. **Fallback timing** — widget rendered standalone (no parent frame) shows default token values at 300ms. Detector: open `dist/widgets/daily-briefing.html` in a browser (no parent), assert default colors applied after 400ms (buffer).
5. **Protocol version handling** — widget receiving a message with `protocolVersion: 2` logs a warning and does NOT update tokens. Detector: unit test with spy on console.warn, assert call + no state change.
6. **Contract test drift detection** — both twin test suites green when token keys match; either fails when keys diverge. Detector: `vitest run` in both repos; CI fails if either red. Augmentation: a one-shot audit script `scripts/verify-token-contract.ts` that reads both files via glob and diffs key sets at CI time.

### Sampling Rate
- **Per task commit:** PORTAL — `npm run test -- src/shared/styles`; mcp-poc — `npx vitest run widgets/shared/__tests__`
- **Per wave merge:** PORTAL — `npm run test`; mcp-poc — `npx vitest run && npm run typecheck && npm run build`
- **Phase gate:** Both full suites green + bundle size check + manual dev harness smoke (theme toggle → tokens update) + portal smoke (widget embeds, handshake visible in DevTools) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `mcp-poc/vitest.config.ts` — NEW, minimal config for contract test
- [ ] `mcp-poc/package.json` — add `"vitest": "^2.1.x"` devDep and `"test": "vitest"` script
- [ ] `mcp-poc/widgets/shared/__tests__/widget-tokens-contract.test.ts` — twin side
- [ ] `mcp-poc/widgets/shared/hooks/__tests__/useHostTokens.test.ts` — covers MCPAPP-TOKEN-01, 04, 05, 08
- [ ] `PORTAL/src/shared/styles/__tests__/widget-tokens-contract.test.ts` — twin side
- [ ] `PORTAL/src/shared/__tests__/sandbox-proxy.test.ts` — covers MCPAPP-TOKEN-02 (static assertion about the relay code)
- [ ] `PORTAL/src/modules/revenue-intelligence/hooks/__tests__/useThemePublisher.test.ts` — covers MCPAPP-TOKEN-03, 06
- [ ] Framework install in mcp-poc: `cd G:/01_OPUS/Projects/mcp-poc && npm install --save-dev vitest@^2.1.x jsdom@^28.x`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth surface — phase operates client-side in iframe + React page |
| V3 Session Management | no | No session changes |
| V4 Access Control | no | No new access gates — mcp-proxy whitelist already enforces tool access (Phase 17) |
| V5 Input Validation | yes | Widget receives `kmn/theme/set` — must validate `protocolVersion` is a number, `tokens` is an object, each value is a string. Implemented in `useHostTokens` hook — type-guard reject malformed payloads |
| V6 Cryptography | no | No new crypto; no secrets in this phase |

### Known Threat Patterns for React 19 + iframe sandbox + postMessage

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| postMessage from untrusted origin injects JavaScript via token value (e.g. `"fg": "expression(alert(1))"`) | Tampering / Elevation | CSS `style.setProperty` does NOT evaluate scripts — `expression()` was IE-only. Token values are applied as CSS var strings; unused by `eval`. Still: widget ignores tokens that don't match `/^[\d#.a-z%, ()/-]+$/` shape (regex in `useHostTokens` before `setProperty`) |
| Host publisher leaks full portal token set (including `--sidebar-bg`, `--phase-1` etc) | Info Disclosure | Publisher uses `widget-tokens.ts` curated 12-key subset; `getComputedStyle` approach rejected specifically for this reason (design doc §6b) |
| srcdoc iframe origin=null bypasses origin check | Spoofing | sandbox-proxy uses `e.source === inner.contentWindow` identity gate, not origin gate. Widget trusts its parent (sandbox-proxy, same-origin with portal) |
| Widget content (from tool result) performs XSS via React auto-escape bypass | XSS (Tampering) | React auto-escapes; `dangerouslySetInnerHTML` is forbidden by design doc §10. Applies to Phase 19 widget code; Phase 18 builds only infra |
| Widget exfiltrates token values to third-party origin | Info Disclosure | iframe sandbox `allow-scripts allow-forms` denies `fetch()` to any origin (null-origin CORS). Tokens aren't secrets anyway — they're design values |
| Sandbox-proxy forwards an attacker-crafted `kmn/theme/set` to widget with malformed payload | Tampering | Widget validates payload shape; malformed tokens fall through to `DEFAULT_TOKEN_VALUES`. Protocol version mismatch logged + ignored (MCPAPP-TOKEN-08) |
| Over-permissive MutationObserver triggers re-emit storm | DoS | Observer scoped to `<html>` element only, filters `attributes` with `class`, `data-theme`, `style`. Reasonable frequency (user-initiated toggles, not animation frames) |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@vitejs/plugin-react@^5.1.1` is the correct version for React 19 `[ASSUMED based on PORTAL already using 5.1.1 + React 19 without issue]` | Standard Stack | Wrong version could break JSX transform. Mitigation: verify with `npx vite build` after install — fail-fast |
| A2 | `vite-plugin-singlefile@^2.3.3` works with Vite 6.0.5 `[ASSUMED — peerDeps allow vite ^5.4.21 \|\| ^6 \|\| ^7 per npm view]` | Standard Stack | Version compatibility matrix may have subtle breaks. Mitigation: smoke-build one widget before committing package.json change |
| A3 | `@tailwindcss/vite` Tailwind v4 plugin handles CSS content-scanning correctly when used with per-dir `root` `[ASSUMED — design doc §4 uses this combination but no explicit verification by Tailwind team]` | Pattern 1 | Shared components may not have classes purged correctly. Mitigation: use `@source` CSS directive to explicitly include `widgets/shared/**` |
| A4 | Motion v12 `useReducedMotion` works in origin=null iframes via matchMedia `[CITED: motion.dev/docs/react-use-reduced-motion + design doc §8]` | Standard Stack | If matchMedia fails in sandbox, animations play despite OS setting. Mitigation: manual test in harness + headless browser |
| A5 | `dist/widgets/daily-briefing.html` output path preserved after per-dir config refactor `[ASSUMED — needs Vite `rollupOptions.output.entryFileNames` tuning]` | Runtime State Inventory | `widget-bundle.ts` breaks at startup if path changes. Mitigation: task-level assertion `test -f dist/widgets/daily-briefing.html` after each build |
| A6 | MutationObserver filter on `class`, `data-theme`, `style` captures all future dark-mode toggle patterns `[ASSUMED — portal has no dark mode today]` | Pattern 5 | A different dark-mode mechanism (e.g. CSS-in-JS, document body class) may bypass the observer. Mitigation: document observer scope in `useThemePublisher.ts`; future dark-mode work updates as needed |
| A7 | 300 KB gz budget is met by default React 19 + Motion v12 + Tailwind v4 baseline (pre-Phase-19 block code) `[ASSUMED based on design doc §2 estimates]` | Bundle Budget | Budget may already bust with baseline libs. Mitigation: measure in Plan 01 (React 19 upgrade) — fail fast; falls back to Preact switch per MCPAPP-BUILD-05 |
| A8 | Sandbox-proxy `e.data.type.indexOf('kmn/theme/') === 0` string check does not have false positives from other message types `[ASSUMED — no prefix collision with AppBridge methods like `ui/notifications/*`, `ui/size-changed`]` | Pattern 3 | If a future MCP UI protocol uses `kmn/` prefix, cross-traffic. Mitigation: narrow regex to `type === 'kmn/theme/request' \|\| type === 'kmn/theme/set'` |
| A9 | PORTAL `widget-tokens.ts` tests can coexist with existing `src/shared/__tests__/` structure `[ASSUMED based on PORTAL's established test patterns]` | Wave 0 Gaps | Test discovery glob may not pick up new subdirectory. Mitigation: run `npm run test -- src/shared/styles` explicitly, verify test executes |
| A10 | mcp-poc has no existing vitest setup to conflict with `[VERIFIED: mcp-poc/package.json has no vitest devDep]` | Wave 0 Gaps | — |
| A11 | PORTAL's `public/sandbox-proxy.html` is same-origin with the page hosting it (staging.portal.kamanin.at) `[VERIFIED: sandbox-proxy.html comment + project_revenue_intelligence_module memory]` | Pattern 3 | Origin gate remains valid for host→widget direction |
| A12 | Phase 19 `?mock=basket-aov` fixture mode contract (D-18-04) is stable after Phase 18 ships `[ASSUMED — Phase 19 spec at WIDG-QA-03 relies on this]` | Dev Harness | Planner may want to document the fixture surface in a Plan SUMMARY so Phase 19 can bind against a known contract. Mitigation: treat harness fixture API as part of the phase's deliverable scope |

---

## Open Questions (RESOLVED)

All five open questions from initial research were resolved during planning and adopted across Plans 01-04. Each recommendation below is marked with the exact plan + task reference where the adoption lives.

1. **Preact fallback activation criteria — documented but untested**
   - What we know: Design doc §2 + MCPAPP-BUILD-05 specify `resolve.alias` switch when budget busts.
   - What's unclear: Whether Preact's `react-dom/client` surface (`createRoot` API) matches React 19 exactly. Some Preact-compat shims lag.
   - Recommendation: Document the switch procedure as a Phase 18 deliverable (comment in `vite.base.ts`); exercise it only if triggered. If Phase 19 widget busts the budget, re-open as a follow-up task.
   - **RESOLVED:** Plan 02 Task 2 — `widgets/shared/vite.base.ts` ships a trailing `PREACT FALLBACK` comment block (4 numbered steps: install preact, add `resolve.alias` object, rebuild, verify budget). Activation is budget-triggered only (MCPAPP-BUILD-05); no preact dependency is installed until the tripwire fires.

2. **Re-emit observer scope for future dark mode**
   - What we know: `MutationObserver` on `<html>` covers class + `data-theme` + `style` attribute changes.
   - What's unclear: If portal adds dark mode via a React context provider that toggles CSS-in-JS runtime rather than `<html>` attributes, the observer won't fire.
   - Recommendation: Document the observer's scope in `useThemePublisher.ts` header comment. Future dark-mode PR owner is expected to add a direct call to `publishTokens()` on theme change (no additional infrastructure needed).
   - **RESOLVED:** Plan 04 Task 2 — `useThemePublisher.ts` installs the observer with `attributeFilter: ['class', 'data-theme', 'style']` on `document.documentElement` and documents the scope + future-dark-mode-PR expectation in the hook's header comment (cites MCPAPP-TOKEN-06 + D-18-05 + Assumption A6). Plan 04's acceptance criteria grep for `attributeFilter.*class.*data-theme.*style`.

3. **TypeScript config for per-widget tsconfig.json**
   - What we know: Current `tsconfig.widgets.json` at mcp-poc root includes `widgets/**/*.{ts,tsx}`. Per-widget `tsconfig.json` can `extends: '../../tsconfig.widgets.json'` and scope `include` to the widget dir only.
   - What's unclear: Whether the IDE TypeScript language server picks up per-widget config correctly when multiple are present; VS Code often uses the nearest `tsconfig.json`.
   - Recommendation: Use per-widget `tsconfig.json` with `extends` + narrow `include`. Verify in VS Code at Plan 01 acceptance by opening a widget file and confirming no spurious type errors.
   - **RESOLVED:** Plan 01 Task 2 — each widget directory gets `tsconfig.json` with `{ "extends": "../../tsconfig.widgets.json", "include": ["src/**/*"] }`. IDE verification is part of Plan 01 acceptance (open a widget file in VS Code and confirm no spurious errors). `tsconfig.widgets.json` itself is NOT modified (its existing `widgets/**/*` include already covers the new subdirs per 18-PATTERNS.md #13).

4. **Widget output file shape — flat vs nested**
   - What we know: Current `dist/widgets/daily-briefing.html` flat.
   - What's unclear: Whether per-dir Vite config can preserve flat output or will emit `dist/widgets/daily-briefing/index.html` (Vite default with a per-dir root).
   - Recommendation: Configure `rollupOptions.output.entryFileNames` or `build.rollupOptions.input` to force a specific output name. Test empirically at Plan 02 (Vite config wiring).
   - **RESOLVED:** Plan 02 Task 2 — `buildWidgetConfig()` in `widgets/shared/vite.base.ts` sets `rollupOptions.output.entryFileNames: opts.outFileName`. Per-widget configs pass `outFileName: 'daily-briefing.html'` and `'revenue-today.html'` respectively, forcing flat output at `dist/widgets/<name>.html`. Plan 02 acceptance criteria explicitly assert NOT-exists for `dist/widgets/daily-briefing/` (must be a flat file, not a directory — Pitfall 7).

5. **Twin contract test discovery**
   - What we know: PORTAL vitest discovers `src/**/__tests__/**/*.test.ts`. mcp-poc vitest default config discovers `**/*.test.ts`.
   - What's unclear: mcp-poc doesn't currently have vitest; the minimal config needs explicit `test.include` to avoid accidentally running tests in `node_modules`.
   - Recommendation: mcp-poc `vitest.config.ts` should specify `test: { include: ['widgets/**/*.test.ts', 'src/**/*.test.ts'] }`.
   - **RESOLVED:** Plan 03 Task 1 — mcp-poc `vitest.config.ts` ships with explicit `include: ['widgets/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}']` (broadened to include `.tsx` per revision feedback, enabling the useHostTokens hook test added in Plan 03 Task 4 to discover alongside the contract test). `exclude: ['node_modules/**', 'dist/**']` prevents accidental walks.

---

## Sources

### Primary (HIGH confidence)
- **PORTAL `/CLAUDE.md`** — Project architecture rules, hook stability patterns, branching policy. Read in full.
- **PORTAL `/package.json`** — Verified dep versions: React 19.2.0, Motion 12.38.0, Vite 7.3.1, @vitejs/plugin-react 5.1.1, @tailwindcss/vite 4.2.1, Vitest 4.0.18, TypeScript 5.9.3
- **mcp-poc `/package.json`** — Current state: React 18.3.1, Vite 6.0.5, @vitejs/plugin-react 4.3.4, vite-plugin-singlefile 2.0.3, no Tailwind, no Motion, no Vitest
- **`docs/ideas/MCP_UI_RESOURCE_BUILD_PIPELINE.md`** — 401-line design doc; Sections 1-13 cover build stack, directory layout, Vite config template, protocol, portal-side changes, dev loop, motion constraints, migration plan, security, mcp-poc server changes, open questions (all resolved except Preact-fallback trigger)
- **`.planning/phases/18-mcp-ui-resource-build-pipeline/18-CONTEXT.md`** — 5 locked decisions (D-18-01..05), existing code insights, integration points, non-obvious constraints. Read in full.
- **`public/sandbox-proxy.html`** (2026-04-24 read) — Existing AppBridge relay pattern; insertion point for `kmn/theme/*` block identified at lines 63-76
- **`src/modules/revenue-intelligence/components/RevenueIntelligencePage.tsx`** + **`hooks/useMcpProxy.ts`** — Exemplar for `useMemo`-stabilized hook pattern; where `useThemePublisher()` plugs in
- **`src/shared/styles/tokens.css`** — Source of 12-token subset mapping (accent, bg, border, etc.)
- **npm view** (2026-04-24): `vite-plugin-singlefile@2.3.3` (modified 2026-04-17), `@tailwindcss/vite@4.2.4` (modified 2026-04-24), `motion@12.38.0` (modified 2026-03-17; peerDeps: `react ^18.0.0 || ^19.0.0`), `react@19.2.5`, `@vitejs/plugin-react@5.1.1`
- **vite-plugin-singlefile README** (github.com/richardtallent/vite-plugin-singlefile) — Config options verified: `useRecommendedBuildConfig: true`, `removeViteModuleLoader: false`, `inlinePattern: []`, `deleteInlinedFiles: true`. Multi-entry-point caveat documented explicitly.
- **tailwindcss.com/docs/installation/using-vite** — Tailwind v4 + Vite plugin usage: `npm install tailwindcss @tailwindcss/vite`; `plugins: [tailwindcss()]`; `@import "tailwindcss"` in CSS

### Secondary (MEDIUM confidence)
- **react.dev/reference/react/useSyncExternalStore** — Confirmed `useSyncExternalStore` is not a fit for our postMessage pattern (setup-time side effect, async reply, 300ms timer)
- **motion.dev/docs/react-use-reduced-motion** — Confirmed `useReducedMotion` imported from `motion/react`; matchMedia-based detection (sandboxed iframe compatible per design doc §8 cross-reference)
- **Phase 17 `17-CONTEXT.md` + `17-03-SUMMARY.md`** — BriefingPayload shape (4 blocks + attention); `DAILY_BRIEFING_URI = "ui://widgets/daily-briefing.html"` invariant preserved; dev harness must mock this shape

### Tertiary (LOW confidence)
- None this round. Every claim above either cites a file read this session, a verified npm view response, or an official docs fetch.

---

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — every version verified via npm view on 2026-04-24; peerDep matrices checked for React 19 compatibility
- **Architecture (Vite config, tsconfig, dir layout):** HIGH — pattern synthesized from design doc §4 + current mcp-poc code + vite-plugin-singlefile README + Tailwind v4 Vite docs
- **Protocol shapes + handshake:** HIGH — design doc §5 is explicit; sandbox-proxy.html relay code verified in place; `useHostTokens` hook design matches React 19 idioms
- **`useSyncExternalStore` rejection:** HIGH — confirmed via react.dev docs that setup-time side effects don't fit
- **Pitfalls:** MEDIUM — drawn from design doc anti-patterns + `feedback_react_hook_identity_churn` + `feedback_upstream_api_probe` memories + plugin interaction caveats from Vite ecosystem
- **Preact fallback:** LOW — documented-only per MCPAPP-BUILD-05; not tested in this phase
- **MutationObserver for re-emit:** MEDIUM — standard Web API, but the trigger mechanism (future dark-mode toggle) doesn't exist yet

**Research date:** 2026-04-24
**Valid until:** 2026-05-24 (30 days) — key libraries are stable but Tailwind v4 and Motion v12 release patches monthly; re-verify versions if Phase 18 slips past this date

---

*Phase: 18-mcp-ui-resource-build-pipeline*
*Research completed: 2026-04-24*
