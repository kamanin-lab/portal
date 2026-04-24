# Phase 18: MCP UI Resource Build Pipeline — Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a reusable Vite single-file build pipeline for React + Tailwind v4 + Motion widgets, plus a bidirectional `kmn/theme/*` postMessage token bridge between the PORTAL host and sandboxed widget iframes. This is the platform layer that unblocks Phase 19 (Revenue Intelligence v2 widget) and makes all future MCP App widgets trivial to ship.

**Explicitly out of scope:** the v2 `daily_briefing` widget's actual block implementations (4 blocks + attention) — that is Phase 19. Phase 18 delivers the **rails**: build tooling, theme bridge, dev harness, shared token module, and the widget directory shape that Phase 19 drops into.

Two repos touched:
- `G:/01_OPUS/Projects/mcp-poc` — build pipeline + dev harness + widget dir restructure + React 19 upgrade
- `G:/01_OPUS/Projects/PORTAL` — `widget-tokens.ts` module + `RevenueIntelligencePage.tsx` theme publisher + `public/sandbox-proxy.html` theme relay block

</domain>

<decisions>
## Implementation Decisions

### React version upgrade

- **D-18-01:** Upgrade `mcp-poc` React 18 → 19 in this phase. Bumps `react`, `react-dom`, `@types/react`, `@types/react-dom` in `devDependencies` to `^19.x`. Aligns the widget stack with PORTAL (already React 19). Per MCPAPP-BUILD-04, React 19 is the baseline. Fold into Plan 01 (pipeline foundation) as task 1 so all downstream tasks build against React 19 from the start.

### Widget directory layout

- **D-18-02:** Restructure `mcp-poc/widgets/` to per-widget directories:
  ```
  mcp-poc/widgets/
  ├── daily-briefing/
  │   ├── index.html
  │   ├── vite.config.ts
  │   ├── src/
  │   │   ├── main.tsx
  │   │   ├── App.tsx            ← v1 widget; v2 replaces in Phase 19
  │   │   └── styles.css
  │   └── tsconfig.json
  ├── revenue-today/
  │   └── (same shape — migrate from current flat layout)
  └── shared/
      ├── hooks/
      │   └── useHostTokens.ts   ← postMessage handshake hook
      ├── widget-tokens.ts        ← duplicate of PORTAL src/shared/styles/widget-tokens.ts
      └── types.ts                ← kmn/theme/* protocol types
  ```
  The current flat layout (`widgets/daily-briefing.html` + `widgets/src/{daily-briefing-main.tsx, DailyBriefingApp.tsx, ...}`) is replaced. The existing v1 `daily-briefing` widget code moves into `widgets/daily-briefing/` unchanged for now and is deleted in Phase 19 per project memory `project_v1_widget_cleanup`.
- **D-18-02a:** `scripts/build-widgets.mjs` is updated to discover widget dirs by scanning `widgets/*/vite.config.ts` rather than by a hardcoded array, so adding a new widget is dir-scoped and zero-edit to the build runner.
- **D-18-02b:** Each widget gets its own `vite.config.ts` (pattern MCPAPP-BUILD-01 literal). Shared defaults may be exported from `widgets/shared/vite.base.ts` and merged per-widget — decision deferred to planner (Claude's discretion).

### Shared token module — cross-repo sync strategy

- **D-18-03:** Manual duplication of `widget-tokens.ts` across both repos + contract test in each.
  - Canonical file in PORTAL: `src/shared/styles/widget-tokens.ts`
  - Duplicate file in mcp-poc: `widgets/shared/widget-tokens.ts`
  - Both files carry a header: `// KEEP IN SYNC WITH <other-repo-path>. 12 tokens locked per Phase 18 D-18-03.`
  - **Contract test (both sides):** asserts `Object.keys(WIDGET_TOKENS).sort()` equals the hardcoded frozen list `['accent','bg','border','danger','fg','muted','radius-lg','radius-md','subtle','success','surface','warning']`. If either file drifts, its own test suite fails.
  - Why chosen: the 12-token set is a locked design decision. It never evolves after Phase 18. Network-based sync scripts and monorepo moves are overkill for a frozen ~40-LOC file. Two twin tests catch the only drift risk.

### Dev harness scope (MCPAPP-BUILD-06)

- **D-18-04:** Full dev harness on `http://localhost:5174/`. The harness (`widgets/daily-briefing/dev-host.html` or similar) provides:
  1. **Theme toggle UI** — buttons for `light` and `dark` themes. Each sends `kmn/theme/set` with a different 12-token payload. Dark theme is a placeholder (approximated — real portal dark mode arrives post-v3.0) but keysets match the contract.
  2. **Realistic daily_briefing mock payload** — seeded from Phase 16 data facts (1099 paid orders, 20.1% repeat, heatmap best slot day=4/hour=20, 3 top products, etc.). Exact shape matches `BriefingPayload` from `mcp-poc/src/mcp-server.ts` (4 blocks + attention).
  3. **Fixture-mode query params:**
     - `?mock=basket-aov` → Basket block in `aov_bands` mode (<30 multi-item orders forced)
     - `?mock=one-block-failing` → 3 `{status:'ok'}` blocks + 1 `{status:'error'}` block (Phase 19 WIDG-QA-03 test driver)
  4. **Handshake observability** — harness logs incoming `kmn/theme/request` and outgoing `kmn/theme/set` to console so a dev can verify the protocol without DevTools deep-diving.
- Why full scope (not minimum): Phase 19 acceptance test #5 already requires `?mock=basket-aov` to work. Adding fixture mode in Phase 18 is ~30 LOC and removes a dependency cascade from Phase 19.

### Portal theme publisher — re-emit infrastructure (MCPAPP-TOKEN-06)

- **D-18-05:** Build re-emit logic in the PORTAL publisher now, not later.
  - `RevenueIntelligencePage.tsx` (or a shared hook like `useThemePublisher`) subscribes to theme changes via a `useEffect` and re-emits `kmn/theme/set` when the active theme changes.
  - PORTAL currently has no dark mode — the initial implementation ships with a static "light" theme source (`tokens.css` CSS vars read via `getComputedStyle` on `document.documentElement`). The re-emit listener is wired but idle.
  - Why now: the dev harness (D-18-04) has a theme toggle. Testing that re-emit works in dev but not in production would be a contract mismatch. ~30 LOC gain symmetry between dev and prod publishers.
  - The listener must survive multiple widget mount/unmount cycles (MCPAPP-TOKEN-06 literal + PORT-03).

### Claude's Discretion

- Exact `useHostTokens` hook API shape (sync vs async, return value structure) — planner picks based on React 19 ergonomics (possibly `useSyncExternalStore`).
- Whether per-widget `vite.config.ts` files share a base config or each duplicates full config — planner picks.
- Dev harness UI polish (CSS styling of the mock-host chrome) — minimal is fine.
- Mock dark theme token values — approximations; the real dark tokens arrive when portal adds dark mode.
- Exact test runner for the cross-repo contract test — PORTAL uses vitest, mcp-poc currently has no test runner. Planner may add a minimal vitest setup to mcp-poc specifically for the contract test, or use a lightweight assertion via `tsc --noEmit` + a literal type that fails if keys differ. Either is acceptable.
- Tailwind v4 theme config location — decided by planner per `@tailwindcss/vite` plugin conventions.
- Motion `prefers-reduced-motion` detection pattern — MCPAPP-BUILD-03 requires it works in sandboxed iframe; planner picks matchMedia wrapper.

### Folded Todos

None — no pending todos matched Phase 18 scope at discuss time.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §MCPAPP-BUILD-01..07 — build-pipeline requirements (Vite, Tailwind v4, Motion, React 19, bundle budget, Preact fallback, dev server, Vercel integration)
- `.planning/REQUIREMENTS.md` §MCPAPP-TOKEN-01..08 — bidirectional theme bridge protocol (kmn/theme/request + kmn/theme/set, 12 tokens, 300ms fallback, protocol-version handling, multi-mount survival)
- `.planning/ROADMAP.md` Phase 18 section — 7 concrete acceptance tests
- `.planning/PROJECT.md` — Milestone v3.0 goals

### Upstream Phase Artifacts
- `.planning/phases/17-kamanda-mcp-server-expansion/17-03-SUMMARY.md` — daily_briefing v2 BriefingPayload shape (what the widget receives; harness must mock the same shape)
- `.planning/phases/17-kamanda-mcp-server-expansion/17-CONTEXT.md` §D-07..D-09 — widget URI identity (`ui://widgets/daily-briefing.html`) is load-bearing across phases
- `.planning/phases/16-kmn-revenue-abilities-wp-plugin/16-RESEARCH.md` §seeded_data_facts — numeric fixtures for dev harness mock payload (1099 orders, 20.1% repeat, heatmap best slot, etc.)

### Architecture & Design Docs
- `docs/ideas/MCP_UI_RESOURCE_BUILD_PIPELINE.md` — THE primary design doc for this phase (401 lines). Sections 1-13 cover every decided aspect: non-goals, build stack, directory layout, Vite config template, token bridge protocol, portal-side changes, dev loop strategy, motion constraints, migration plan, security inside the sandbox, mcp-poc server changes, open questions (all resolved except Preact-fallback trigger).
- `docs/ideas/REVENUE_INTELLIGENCE_V2_PLAN.md` — Phase 19 spec; referenced so Phase 18 knows what data shapes + block contracts the pipeline must support.

### Existing mcp-poc Code to Pattern-Match
- `G:/01_OPUS/Projects/mcp-poc/vite.config.ts` — current env-driven multi-entry config (to be replaced with per-widget configs)
- `G:/01_OPUS/Projects/mcp-poc/scripts/build-widgets.mjs` — current widget loop runner (to be refactored for dir discovery)
- `G:/01_OPUS/Projects/mcp-poc/widgets/src/DailyBriefingApp.tsx` + `widgets/src/daily-briefing-main.tsx` + `widgets/daily-briefing.html` — v1 widget code to migrate into `widgets/daily-briefing/src/`
- `G:/01_OPUS/Projects/mcp-poc/tsconfig.widgets.json` — widget tsconfig (update for React 19 JSX transform + per-dir pattern)
- `G:/01_OPUS/Projects/mcp-poc/package.json` — devDependencies (React 18 → 19 bump target)
- `G:/01_OPUS/Projects/mcp-poc/src/widget-bundle.ts` — server-side loader that reads built `dist/widgets/{name}.html` (output path may need stabilization if the build output shape changes)

### Existing PORTAL Code to Pattern-Match
- `src/shared/styles/tokens.css` — the full portal design token set; the 12 widget tokens are a curated subset of this
- `src/modules/revenue-intelligence/components/RevenueIntelligencePage.tsx` — host of the widget; theme publisher lives here or in a new hook imported here
- `src/modules/revenue-intelligence/hooks/useMcpProxy.ts` — pattern for portal↔widget-related hooks (`useMemo`-stabilized per memory `feedback_react_hook_identity_churn`)
- `public/sandbox-proxy.html` — AppBridge sandbox proxy; gets a `kmn/theme/*` relay block appended (pure postMessage pass-through, no interpretation)

### Deployment Refs
- `G:/01_OPUS/Projects/mcp-poc/vercel.json` — Vercel config; confirm no extra env / build step needed for Tailwind v4 / Motion
- `.github/workflows/deploy-edge-functions-staging.yml` — PORTAL staging CI (not touched by this phase; recorded so planner knows nothing here needs a CI change)

### Memory References (project decisions that shape this phase)
- `project_revenue_intelligence_module` — upstream = `mcp-poc-three.vercel.app`, staging-only rollout, sandbox currently same-origin
- `project_v1_widget_cleanup` — v1 daily-briefing widget deletion deferred to Phase 19 (do NOT delete in Phase 18)
- `feedback_react_hook_identity_churn` — `useMemo`-stabilized hooks are mandatory for any new hook exported by this phase (`useHostTokens`, `useThemePublisher`)
- `feedback_upstream_api_probe` — before writing the theme bridge client side, verify the postMessage envelope shape with a curl/browser probe against a minimal harness

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`mcp-poc/vite.config.ts`** — already uses `viteSingleFile()` + `@vitejs/plugin-react` + `emptyOutDir` per-widget-sequencing pattern. The new per-widget configs inherit this approach; the multi-entry env hack is what goes away.
- **`mcp-poc/scripts/build-widgets.mjs`** — existing sequential spawn pattern is reusable; only the widget discovery logic changes (array → glob).
- **`src/shared/styles/tokens.css`** — source of truth for the 12 curated tokens. The new `widget-tokens.ts` is a code-side projection of a subset of these CSS vars.
- **`public/sandbox-proxy.html`** — lives on same origin as portal (staging). Already relays AppBridge messages; the theme-relay block is a trivial extension (match `type: /^kmn\/theme\//` → forward).
- **`@mcp-ui/client` AppRenderer** — already wired in `RevenueIntelligencePage.tsx`. Exposes the iframe; we attach postMessage listener to `window` (not to iframe directly — sandbox-proxy is the intermediate hop).
- **Motion (`motion/react`)** — NOT currently in mcp-poc; available in PORTAL. This phase adds it to mcp-poc `dependencies` (production dep, not devDependency, because the widget bundles it).

### Established Patterns

- **Env-gated single-entry Vite build** — each widget is its own independent Vite build run, because `viteSingleFile` + `inlineDynamicImports` is incompatible with multi-entry. Per-widget dirs (D-18-02) preserve this constraint with cleaner separation.
- **`useMemo`-stabilized React hooks in portal** — `useMcpProxy.ts` shows the mandatory pattern (per ADR-034 + memory). New hooks (`useThemePublisher`, `useHostTokens`) must follow suit to avoid iframe-mount identity-churn loops.
- **Cross-repo change pairs** — Phase 17 already committed a code change to mcp-poc + a coordinated whitelist update to PORTAL in the same phase. Phase 18 repeats this: mcp-poc pipeline + PORTAL publisher + token module live/ship together. SUMMARY.md for each plan lives in PORTAL `.planning/` regardless of which repo the code commit lands in (established in Phase 17).
- **`@tailwindcss/vite` plugin for Tailwind v4** — portal does NOT use this plugin (portal is on Tailwind v4 but as a different integration). Widgets use the plugin directly because each widget is its own Vite build root. Zero config sharing with portal Tailwind setup.

### Integration Points

- **Widget ↔ host boundary** — sandboxed iframe (srcdoc) → AppBridge sandbox-proxy (same origin) → portal `window.parent` listener. Theme messages traverse this path in both directions. The sandbox-proxy's postMessage relay is the one surface that changes in PORTAL.
- **Portal theme source** — `document.documentElement` CSS vars read via `getComputedStyle`. The publisher reads, packages 12 tokens, sends via `kmn/theme/set`. Re-emit on theme change means subscribing to whatever future dark-mode toggle dispatches (a CustomEvent, a React context, an attribute observer — planner picks).
- **Vercel build** — single `npm run build` at mcp-poc root produces both server (`dist/server.js`) and all widgets (`dist/widgets/{name}.html` or per-dir outputs). Vercel auto-deploys on push to mcp-poc `main` (verified in Phase 17).

### Non-Obvious Constraints

- **300 KB gzip budget** (MCPAPP-BUILD-04) — React 19 + ReactDOM alone is ~45 KB gz. Motion v12 is ~15 KB gz. Tailwind v4 inlined CSS (JIT-purged) is 2–8 KB gz. App code + widget styles budget is what remains: ~200 KB. Realistic for 4 dashboard blocks + SVG charts. Preact fallback (MCPAPP-BUILD-05) is the escape hatch if that budget busts.
- **300ms fallback timeout** (MCPAPP-TOKEN-05) — widget must render with bundled default tokens if no `kmn/theme/set` arrives in 300ms. This means bundled defaults must be **valid CSS var values** — the 12-token TS module in `widgets/shared/widget-tokens.ts` exports `DEFAULT_WIDGET_TOKENS` as such.
- **iframe sandbox flags** — `@mcp-ui/client` uses a specific sandbox attribute string. `allow-same-origin` may or may not be present; `window.parent.postMessage` works without it but `document.cookie`, localStorage, etc. do not. Widget code must not assume those APIs work.
- **Protocol version asymmetry** (MCPAPP-TOKEN-08) — host and widget each have their own protocol version. The rule is: higher version side ignores + logs; the lower-version side treats the other as speaking its dialect. Widget at version 1 receiving `protocolVersion: 2` → log + use defaults. Widget at version 2 sending to host at version 1 → host's relay passes it anyway; widget must handle host not responding.
- **No test runner in mcp-poc** — contract test (D-18-03) is the first automated test in mcp-poc. Planner decides vitest-minimal vs type-only assertion.

</code_context>

<specifics>
## Specific Ideas

- **The design doc is 90% of the specification.** `docs/ideas/MCP_UI_RESOURCE_BUILD_PIPELINE.md` captures implementation decisions at code-snippet resolution. Researcher and planner should treat it as spec — this CONTEXT.md layers decisions ON TOP of that doc, not instead of it.
- **Per-widget vite.config.ts can extend a shared base** — if there's meaningful duplication (there will be: react plugin, singleFile plugin, tailwind plugin, assetsInlineLimit), a `widgets/shared/vite.base.ts` exporting a function that returns a merged config is idiomatic. Planner's call.
- **The Phase 17 `summarizeBriefing()` German text becomes a reference** for token labels. When labeling theme colors or state text in the widget, follow the German conventions already established in mcp-poc (Tages-Hochrechnung, Zahlungsaufmerksamkeit, etc.) — WIDG-QA-04 applies here too via inheritance.
- **Dev harness is also the UAT scaffold for Phase 19.** The `?mock=*` query-param fixture API designed in Phase 18 IS the test harness Phase 19 uses for WIDG-QA-03 / Deliverable #4 + #5 verification. Keep the fixture surface stable and document it in Plan SUMMARY.

</specifics>

<deferred>
## Deferred Ideas

### Out of scope for Phase 18 (confirmed)

- **Revenue Intelligence v2 widget implementation** — Phase 19. Phase 18 only produces the rails; the 4 block components are Phase 19.
- **v1 daily-briefing widget deletion** — deferred to Phase 19 per memory `project_v1_widget_cleanup`. Phase 18 migrates the v1 code into the new dir shape unchanged.
- **Production dark mode** — portal has no dark mode today. Phase 18 builds the re-emit infrastructure (D-18-05) but ships with a light-only token publisher. Dark mode is a future milestone.
- **Second language / English i18n** — German only for v3.0 per `docs/ideas/MCP_UI_RESOURCE_BUILD_PIPELINE.md` §12.
- **Multi-widget orchestration on one page** — one tool → one widget → one HTML file (design doc §13).
- **Custom chart library** — v2 uses inline SVG or CSS grids. `visx`/`echarts-for-react` evaluation is a v3 concern.
- **Widget marketplace / cross-client reuse** — architecture is ready for it, but v3.0 = one widget for one client (MBM / revenue intelligence).
- **Sandbox-proxy origin move to `sandbox.kamanin.at`** — design doc §10; tracked as TODO in `public/sandbox-proxy.html`. Production multi-client rollout concern, not v3.0.
- **Monorepo / npm workspace move for PORTAL + mcp-poc** — considered and rejected (D-18-03 rationale). If cross-repo sync pain grows, revisit in a future infra milestone.
- **A11y deep-dive beyond baseline semantic HTML + keyboard focus** — post-launch audit (design doc §13).

### Reviewed Todos (not folded)

None — no pending todos at discuss time.

</deferred>

---

*Phase: 18-mcp-ui-resource-build-pipeline*
*Context gathered: 2026-04-24*
