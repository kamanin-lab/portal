# MCP UI Resource Build Pipeline

> Related docs: `docs/ideas/WP_BRIDGE_ARCHITECTURE.md` (data layer),
> `docs/ideas/REVENUE_INTELLIGENCE_V2_PLAN.md` (4 blocks),
> `docs/ideas/LOCAL_DEV_SETUP.md` (DDEV + WSL).

**Status:** Planning | **Last updated:** 2026-04-23

---

## 1. Goal & Non-Goals

**Goal:** Production-quality React widgets bundled as single-file HTML strings for MCP UI Resources (`ui://widgets/*.html`). Dev-loop under 2s (Vite HMR in standalone mode). Size budget ≤ 300 KB gzipped per widget. Themeable via portal design tokens over postMessage.

**Non-goals:**
- Skybridge framework — user explicitly rejected (framework lock-in, another 0.x dep)
- Cross-widget code sharing beyond a minimal shared lib
- SSR or partial hydration
- Client-side data fetching from widgets (pure renderers — data arrives in tool result)

---

## 2. Build Stack Decisions

| Tool | Version | Rationale |
|------|---------|-----------|
| **Vite** | 6.x+ | Match PORTAL's Vite; zero config drift |
| **`vite-plugin-singlefile`** | ^2.3 | Canonical single-file HTML output; `removeViteModuleLoader: true` for MCP widgets |
| **React** | 19 | Match PORTAL. Fallback: `preact/compat` alias if budget exceeded |
| **`@tailwindcss/vite`** | v4 | CSS-first, no postcss config; JIT purges at build — iframe-agnostic |
| **Motion** | ^12 (motion/react) | Works in sandboxed iframe; no network deps; reduced-motion reads OS setting via matchMedia |
| **TypeScript** | 5.x | Match PORTAL |

**Explicit non-choices:**

- **No shadcn/ui inside widgets.** Radix-UI deps (which shadcn depends on) pull too much — would push us over 300 KB gz budget. Portal uses shadcn; widgets use hand-rolled primitives styled with Tailwind. Justification: the widget doesn't need dialogs, sheets, command menus — only display primitives (cards, grids, tables). Hand-rolled = ~2 KB, shadcn+radix = ~60 KB.

- **No Skybridge.** User decision. Gives us: full control, no framework version pinning issue, no dependency on external type-safety layer. Costs: we write our own dev harness (~100 LOC, one-time) and our own postMessage types (~30 LOC, reused per widget). Worth it for POC where we own both sides.

**Size budget breakdown (target ≤ 300 KB gz):**
- React 19 + ReactDOM: ~45 KB gz
- Motion 12 (tree-shaken): ~20 KB gz
- Tailwind purged: ~10 KB gz
- Our code (4 blocks + bridge + formatters): ~15 KB gz
- **Total: ~90 KB gz, ~500 KB uncompressed** — well under budget

If exceeded: swap `react` → `preact/compat` via Vite alias. Drops to ~50 KB gz.

Sources:
- vite-plugin-singlefile: https://github.com/richardtallent/vite-plugin-singlefile
- Tailwind v4 Vite plugin: https://tailwindcss.com/docs/installation/using-vite
- Motion: https://motion.dev/

---

## 3. Directory Layout

Widgets live in the **mcp-poc** repo, not PORTAL. mcp-poc owns the MCP Resources it serves.

```
G:/01_OPUS/Projects/mcp-poc/
├── widgets/
│   ├── revenue-intelligence/              ← the new 4-block dashboard
│   │   ├── src/
│   │   │   ├── index.tsx                  # Entry — ReactDOM.createRoot, App
│   │   │   ├── App.tsx                    # Root — reads tool result, renders 4 blocks
│   │   │   ├── blocks/
│   │   │   │   ├── HeuteBlock.tsx         # Run-rate projection, payment split
│   │   │   │   ├── HeatmapBlock.tsx       # 7×24 grid, period toggle
│   │   │   │   ├── RepeatBlock.tsx        # Repeat rate, benchmark, trend
│   │   │   │   └── BasketOrAovBlock.tsx   # Conditional render by mode
│   │   │   ├── lib/
│   │   │   │   ├── host-bridge.ts         # postMessage protocol + types
│   │   │   │   ├── theme.ts               # Token applier (CSS vars on :root)
│   │   │   │   ├── formatters.ts          # de-AT number/currency/date formatters
│   │   │   │   └── mock-host.ts           # Dev harness — fake tokens + fake tool result
│   │   │   └── styles.css                 # @import "tailwindcss" + token fallbacks
│   │   ├── index.html                     # Shell with <div id="root">, inline bootstrap
│   │   ├── vite.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── _shared/                           # Cross-widget utilities (grow as 2nd widget lands)
│       ├── host-bridge-types.ts
│       └── format-helpers.ts
├── src/
│   └── resources/
│       └── serve-widget.ts                # Reads widgets/*/dist/index.html at startup, registers as MCP Resource
└── ...
```

**Build output:** `widgets/revenue-intelligence/dist/index.html` — single file, inlined JS/CSS/assets. Served by mcp-poc as `ui://widgets/daily-briefing.html` (same URI as current v1 widget — drop-in replacement).

---

## 4. Vite Config (pseudocode)

```ts
// widgets/revenue-intelligence/vite.config.ts — PSEUDOCODE, not real file
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [
    react(),                                              // React 19 support
    tailwindcss(),                                        // Tailwind v4 — scans src/, purges at build
    viteSingleFile({ removeViteModuleLoader: true }),     // Inlines JS/CSS into single HTML, strips module preload
  ],
  build: {
    assetsInlineLimit: 100_000_000,                       // Inline everything — no external files
    cssCodeSplit: false,                                  // One CSS bundle, inlined
    rollupOptions: {
      output: {
        inlineDynamicImports: true,                        // No code splitting
      },
    },
  },
})
```

Every line is load-bearing for MCP widget use case — don't remove any of these without understanding the failure mode.

---

## 5. Token Bridge Protocol

**Goal:** Theme is host-owned. Widget requests tokens on mount, host replies, widget applies CSS variables to `:root`.

### Protocol (TypeScript-style types)

```ts
// widgets/_shared/host-bridge-types.ts — NOT a real file, these are the wire types

// Widget → Host (on mount)
type ThemeRequest = {
  type: 'kmn/theme/request'
  protocolVersion: 1
}

// Host → Widget (response)
type ThemeSet = {
  type: 'kmn/theme/set'
  protocolVersion: 1
  tokens: Record<CssVarName, string>   // e.g. { '--color-bg': '#FAFAF9', '--color-fg': '#333', ... }
}

// Widget → Host (optional — report size for iframe auto-resize)
type SizeChanged = {
  type: 'ui/size-changed'
  height: number
  width?: number
}
```

### Curated token set (~12 tokens)

Flow only these from portal to widget. Keeps surface small, avoids leaking internals.

| Token name | Purpose | Source in portal `tokens.css` |
|------------|---------|------------------------------|
| `--color-bg` | Widget background | `--bg` |
| `--color-surface` | Card background | `--surface` |
| `--color-fg` | Primary text | `--text-primary` |
| `--color-muted` | Secondary text | `--text-secondary` |
| `--color-subtle` | Tertiary text, hints | `--text-tertiary` |
| `--color-accent` | Brand accent (CTA) | `--accent` (or `--color-ring-primary`) |
| `--color-success` | Positive trend | `--committed` |
| `--color-danger` | Negative trend | `--destructive` |
| `--color-warning` | Attention | `--awaiting` |
| `--color-border` | Dividers | `--border` |
| `--radius-md` | Card corners | `--r-md` |
| `--radius-lg` | Panel corners | `--r-lg` |

### Timing & fallback

1. On widget mount (`useEffect` in `App.tsx`), post `kmn/theme/request` to `window.parent`.
2. `public/sandbox-proxy.html` (portal side) relays to outer portal window.
3. Portal (in `RevenueIntelligencePage.tsx`) responds with `kmn/theme/set`.
4. Widget applies: `for (const [k, v] of Object.entries(tokens)) document.documentElement.style.setProperty(k, v)`.
5. **Fallback:** if no reply within 300ms, widget uses bundled defaults baked in at build time (light theme, neutral palette). Ensures widget is usable standalone (dev mode, Claude Desktop future, etc.).
6. **Protocol version:** `protocolVersion: 1`. Host that receives a higher version MUST ignore; widget that receives a higher version MUST fall back to defaults.

### Dark mode future

When portal adds dark mode toggle, same protocol — portal re-emits `kmn/theme/set` on toggle. Widget listens for additional `kmn/theme/set` events (not just initial reply) and re-applies. No widget code change needed when dark mode lands — just make sure the listener persists after first handshake.

---

## 6. Portal-Side Changes

### 6a. `public/sandbox-proxy.html` — add theme relay

Current relay forwards `ui/notifications/sandbox-resource-ready`. Add `kmn/theme/*` types to the allowed-relay list.

Pseudocode addition:
```js
// inside existing message listener
if (typeof event.data?.type === 'string' && event.data.type.startsWith('kmn/theme/')) {
  window.parent.postMessage(event.data, '*')  // forward to outer portal
  return
}
// existing code follows
```

Relay is semantic-agnostic — it forwards by prefix, doesn't interpret. This keeps sandbox-proxy.html small and easy to audit.

### 6b. `RevenueIntelligencePage.tsx` — theme publisher

Small addition (~20 LOC). On receiving `kmn/theme/request`, respond with current tokens:

```tsx
// pseudocode fragment added to RevenueIntelligencePage.tsx
useEffect(() => {
  const handler = (ev: MessageEvent) => {
    if (ev.data?.type !== 'kmn/theme/request') return
    const tokens = readCurrentTokens()  // reads from getComputedStyle or imports tokens module
    ev.source?.postMessage({ type: 'kmn/theme/set', protocolVersion: 1, tokens }, { targetOrigin: '*' })
  }
  window.addEventListener('message', handler)
  return () => window.removeEventListener('message', handler)
}, [])
```

`readCurrentTokens()` either:
- (a) reads `getComputedStyle(document.documentElement).getPropertyValue(...)` for each of the 12 tokens, or
- (b) imports a constant module that mirrors `tokens.css` subset.

**Recommendation:** (b) — a TypeScript module `src/shared/styles/widget-tokens.ts` exporting the 12 tokens as a constant. Safer because `getComputedStyle` returns computed values (may include `rgb(...)` form instead of hex) and has quirks across browsers.

---

## 7. Dev Loop Strategy

No Skybridge, no HMR-in-iframe. Two modes:

### 7a. Standalone mode (90% of UI work)

```bash
cd G:/01_OPUS/Projects/mcp-poc/widgets/revenue-intelligence
npm run dev
```

- Vite dev server at `http://localhost:5174/`
- Widget renders with `mock-host.ts` providing:
  - Fake theme tokens (matching portal light theme)
  - Fake tool result matching the `daily_briefing` response schema
- Native HMR — save a block file, page re-renders instantly
- Can inspect with DevTools, edit CSS live, etc.

`mock-host.ts` also lets you toggle mock response variants:
- `?mock=run-rate-sparse` — fewer baseline days, tests fallback label
- `?mock=basket-aov` — mode=aov_bands
- `?mock=error-block-2` — heatmap returns error, tests per-block skeleton

This covers ~90% of iteration. Do UI styling, layout, animation tuning here.

### 7b. Host-bridge mode (final 10%)

```bash
npm run build           # produces dist/index.html (single file)
npm run serve           # optional: serve dist/ at :5175 to inspect output size
```

Then:
- Deploy mcp-poc to Vercel staging (or restart local mcp-poc dev server)
- Widget now served as MCP UI Resource at `ui://widgets/daily-briefing.html`
- Portal renders it via staging MCP call

Use this mode to validate:
- postMessage theme flow end-to-end
- Iframe sandbox restrictions don't break any feature
- Real `daily_briefing` tool response shape matches what widget expects
- Size of final bundle (check dist/index.html file size)

### No Storybook

Overkill for 4 blocks. Standalone mode + mock variants covers all isolation needs. If we hit 10+ blocks or want visual regression tests, revisit.

---

## 8. Motion Constraints in Sandboxed Iframe

**Works:**
- `motion.div` with `initial`, `animate`, `exit`, `transition`
- `AnimatePresence` for enter/exit animations
- Spring physics, keyframes, variants
- `useReducedMotion()` — reads OS `prefers-reduced-motion` via matchMedia. matchMedia works inside sandboxed iframe with origin=null.
- Scroll-triggered animations via `useInView` — works within the widget's own scroll context

**Does NOT work:**
- `layoutId` shared with host DOM — iframe boundary blocks layout sharing. Keep `layoutId` animations entirely within widget.
- No access to `window.parent` animation state (obvious — sandbox)

**Performance caveats:**
- Avoid concurrent animations on 30+ elements — mid-range laptops will stutter
- Heatmap (168 cells) should NOT animate individually. Animate the container with one `motion.div` fade-in; cells render as static HTML.

---

## 9. Migration Plan for Existing `daily-briefing.html`

### Phase 1 (this upgrade)

- Keep v1 widget registered at `ui://widgets/daily-briefing-v1.html` (rename resource URI).
- Register v2 widget at `ui://widgets/daily-briefing.html` (original URI — drop-in replacement).
- MCP server's `daily_briefing` tool returns v2 resource by default.
- v1 remains accessible for rollback via a hidden `{ variant: 'v1' }` arg (optional — skip if tight on time).

### Phase 2 (1 week after v2 ships)

- Verify v2 stable on staging and MBM live for 1 week with zero rollbacks.
- Remove v1 registration from mcp-poc.
- Delete old `daily-briefing-v1.html` resource file.

### Phase 3 (cleanup — can merge with Phase 2 if no issues)

- Remove any v1 references from PORTAL documentation.
- Update `CLAUDE.md` module map if UI resource URIs changed.

**Port from v1 to v2:** payment-attention-orders detail view (was in v1 bottom section). Reimplement as sub-component inside HeuteBlock or as a small 5th block. Do not lose this — it's the most-clicked element in v1.

---

## 10. Security Inside the Sandbox

**Trust model:**
- Widget iframe: `sandbox="allow-scripts allow-forms"`, origin=null
- No `allow-same-origin` → no cookies, no localStorage, no portal-DOM access
- Widget cannot `fetch()` to any origin (blocked by null origin CORS)
- All data arrives via MCP tool result (pure renderer)

**Portal side message validation:**
- Only accept messages with `type` starting `kmn/` or `ui/` prefix
- Sanitize any tokens received in `kmn/theme/set` before applying (regex: hex color, px/rem number, known enum)
- Never `eval()` or `Function()` on any message payload

**Widget side XSS hygiene:**
- All data is numeric/categorical (revenue, counts, product names from WC)
- Product names come from WP `wp_posts.post_title` — already sanitised by WP
- Still: render via React (auto-escapes). Do NOT use `dangerouslySetInnerHTML` for any tool-result field.

**What could still go wrong:**
- Compromised MCP server injects malicious product name → renders inside widget → iframe-contained only, no host impact → low severity
- Same origin as staging right now (`sandbox-proxy.html` lives on `staging.portal.kamanin.at`) — documented TODO: move to `sandbox.kamanda-mcp-poc.vercel.app` before production multi-client rollout

---

## 11. What Needs to Happen in mcp-poc Server

High level only — details in `REVENUE_INTELLIGENCE_V2_PLAN.md` §8.

1. **Widget build in CI.** Vercel build for mcp-poc runs `npm run build` at root. Add step: `cd widgets/revenue-intelligence && npm install && npm run build`. Resulting `dist/index.html` is read at mcp-poc startup and registered as MCP Resource.

2. **Resource registration.** In mcp-poc's `src/resources/serve-widget.ts`:
   ```ts
   // pseudocode
   const html = await readFile('widgets/revenue-intelligence/dist/index.html', 'utf-8')
   server.registerResource({
     uri: 'ui://widgets/daily-briefing.html',
     mimeType: 'text/html;profile=mcp-app',
     contents: html,
   })
   ```

3. **Tool response enrichment.** `daily_briefing` tool response includes:
   ```json
   {
     "_meta": { "openai/outputTemplate": "ui://widgets/daily-briefing.html" },
     "structuredContent": { ...4 blocks' data... }
   }
   ```
   Host (portal `AppRenderer`) reads `_meta.openai/outputTemplate` to pick the widget.

---

## 12. Open Questions

- **Widget location** — `mcp-poc/widgets/` (current plan) vs somewhere in PORTAL. **Resolved:** stays in mcp-poc. Widgets are MCP Resources; they belong with the MCP server.

- **Shared design-token module** — TS module exporting 12 tokens as constant, vs runtime read via `getComputedStyle`. **Recommended:** module with defaults + runtime override via postMessage. Host supplies via handshake, not bundled-only.

- **Vercel build step for widgets** — `postbuild: cd widgets/revenue-intelligence && vite build`? Or separate Vercel project for widgets? **Recommend:** single `build` script in mcp-poc root package.json that chains both server build and widget build. Single deploy, single version.

- **Preact fallback trigger** — only swap to `preact/compat` if `dist/index.html` gzipped > 300 KB. Monitor at every build.

- **i18n** — German only for V2, hardcoded strings in blocks. When second language needed (English, for Summerfield international?), introduce a tiny i18n helper (~20 LOC, dictionary-based).

---

## 13. Out of Scope

- Multi-widget orchestration on one page (one tool = one widget = one HTML file)
- Client-side data fetching from widgets (they are pure renderers)
- Custom chart library (for V2: inline SVG or CSS grids). If charts get complex in V3, evaluate `visx` or `echarts-for-react` — both single-file-bundleable.
- Widget marketplace / cross-client reuse (architecture is ready for it, but V2 = one widget for one client use case)
- A11y deep-dive beyond baseline (semantic HTML, keyboard focus) — will audit post-launch

---

*Last updated: 2026-04-23*
