# Phase 18: MCP UI Resource Build Pipeline — Pattern Map

**Mapped:** 2026-04-24
**Files analyzed:** 19 (17 new + 2 modified) across two repos
**Analogs found:** 19 / 19 (100% — every file has either an internal analog or a verbatim design-doc excerpt)

---

## Scope Split Across Two Repos

| Repo | Path root | Files touched (new / modified) |
|------|-----------|---------------|
| **mcp-poc** (Node MCP server + widgets) | `G:/01_OPUS/Projects/mcp-poc/` | 15 (per-widget configs, shared base, hook, types, token duplicate, dev harness, contract test, vitest config, package.json, tsconfig, refactored build runner, 2 migrated v1 files, 1 deleted root vite.config) |
| **PORTAL** (React host) | `G:/01_OPUS/Projects/PORTAL/` | 4 (`widget-tokens.ts` + contract test, `useThemePublisher.ts`, `RevenueIntelligencePage.tsx` 1-line diff, `public/sandbox-proxy.html` relay block) |

---

## File Classification

| # | File | Repo | Role | Data Flow | Closest Analog | Match Quality | Requirement IDs |
|---|------|------|------|-----------|----------------|---------------|-----------------|
| 1 | `widgets/shared/widget-tokens.ts` | mcp-poc | shared-module (token dictionary) | build-time (imported by widget + harness) | `src/shared/styles/tokens.css` (PORTAL) + the TS projection in 18-RESEARCH §"Widget Tokens Module" | role-match (no TS token module exists yet in either repo; design doc defines contents verbatim) | MCPAPP-TOKEN-07 |
| 2 | `src/shared/styles/widget-tokens.ts` | PORTAL | shared-module (token dictionary) | build-time + runtime (imported by publisher) | Twin of #1 — identical file contents below the header; upstream source is `src/shared/styles/tokens.css` | role-match | MCPAPP-TOKEN-07 |
| 3 | `widgets/shared/types.ts` | mcp-poc | protocol-types | build-time | No existing analog; design doc §5 + 18-RESEARCH §"Protocol Message Shapes" is the canonical excerpt. Adjacent pattern: Zod-validated types in `mcp-poc/src/connectors/kmn-bridge-schemas.ts` (plain TS types, not Zod, is appropriate here) | design-doc only | MCPAPP-TOKEN-01, MCPAPP-TOKEN-08 |
| 4 | `widgets/shared/vite.base.ts` | mcp-poc | build-config factory | build-time | **Primary:** `mcp-poc/vite.config.ts` (current env-gated config — same plugin stack minus env-hack) | exact pattern, different shape | MCPAPP-BUILD-01, MCPAPP-BUILD-02, MCPAPP-BUILD-04, MCPAPP-BUILD-05 |
| 5 | `widgets/daily-briefing/vite.config.ts` | mcp-poc | build-config (per-widget) | build-time | None internal — pattern is "thin wrapper around #4"; design doc §4 + 18-RESEARCH §"Shared Vite Base Config" pattern | design-doc only (trivial wrapper) | MCPAPP-BUILD-01 |
| 6 | `widgets/revenue-today/vite.config.ts` | mcp-poc | build-config (per-widget) | build-time | Twin of #5 | twin | MCPAPP-BUILD-01 |
| 7 | `widgets/daily-briefing/index.html` | mcp-poc | HTML entry | build-time | `widgets/daily-briefing.html` (current v1, lines 1-12) | exact (migrate unchanged; update script src path to `./src/main.tsx`) | MCPAPP-BUILD-01 |
| 8 | `widgets/daily-briefing/src/main.tsx` | mcp-poc | React bootstrap | runtime (widget mount) | `widgets/src/daily-briefing-main.tsx` (current v1, lines 1-14) | exact (file moves + CSS import path becomes `./styles.css`) | — |
| 9 | `widgets/daily-briefing/src/App.tsx` | mcp-poc | widget component (v1 carry-over) | runtime | `widgets/src/DailyBriefingApp.tsx` (current v1) | exact (copy unchanged per `project_v1_widget_cleanup`; Phase 19 deletes) | — |
| 10 | `widgets/daily-briefing/src/styles.css` | mcp-poc | stylesheet | build-time | `widgets/src/daily-briefing.css` (current v1, 82+ lines of token duplication) | exact (v1 CSS moves unchanged; Phase 19 strips token duplication when rewriting) | MCPAPP-BUILD-02 |
| 11 | `widgets/daily-briefing/dev-host.html` | mcp-poc | dev-harness shell | test-time (host→widget mock) | No direct analog; `public/sandbox-proxy.html` (PORTAL) models the "parent frame that talks postMessage" pattern. Design doc §7 + 18-RESEARCH §"Dev Harness Shell" is canonical | role-match (cross-repo) | MCPAPP-BUILD-06, D-18-04 |
| 12 | `widgets/shared/hooks/useHostTokens.ts` | mcp-poc | React hook | widget→host→widget (postMessage roundtrip) | **Primary:** `src/modules/revenue-intelligence/hooks/useMcpProxy.ts` (PORTAL) — the `useMemo`-stabilized return pattern. Secondary: `useEffect` + ref-guard pattern from `RevenueIntelligencePage.tsx` lines 46-64 (StrictMode double-fire defense) | role-match (cross-repo, same hook-stability discipline) | MCPAPP-TOKEN-01, MCPAPP-TOKEN-04, MCPAPP-TOKEN-05, MCPAPP-TOKEN-08 |
| 13 | `widgets/shared/__tests__/widget-tokens.contract.test.ts` | mcp-poc | contract test | test-time | **Twin:** #14 (byte-identical below imports). Secondary analog: `src/shared/__tests__/notification-preferences.test.ts` (PORTAL) — minimal vitest structure | twin + role-match | MCPAPP-TOKEN-07, D-18-03 |
| 14 | `src/shared/styles/__tests__/widget-tokens.contract.test.ts` | PORTAL | contract test | test-time | **Twin:** #13. Secondary analog: existing `src/shared/__tests__/*.test.ts` files (vitest already configured) | twin | MCPAPP-TOKEN-07, D-18-03 |
| 15 | `scripts/build-widgets.mjs` (refactor) | mcp-poc | build-runner | build-time | **Self:** current `scripts/build-widgets.mjs` (lines 1-31) — keep the sequential `spawn` pattern, change the widget-list source (hardcoded array → dir scan) and env-var plumbing | self (modify existing) | MCPAPP-BUILD-07, D-18-02a |
| 16 | `package.json` (mcp-poc) | mcp-poc | config | build-time | **Self:** current `package.json` — bump React 18→19, bump plugin-react 4→5, add Tailwind v4 + Motion + vitest; add `"test"` script; optionally add per-widget `dev` scripts | self (diff) | MCPAPP-BUILD-04, D-18-01 |
| 17 | `tsconfig.widgets.json` (mcp-poc) | mcp-poc | config | build-time | **Self:** current `tsconfig.widgets.json` — update `include` pattern + `paths` if alias used; per-widget `tsconfig.json` files `extend` it | self (diff) | — |
| 18 | `vitest.config.ts` (mcp-poc, NEW) | mcp-poc | test-config | test-time | `vitest.config.ts` (PORTAL, entire file) — copy minimal subset (drop coverage thresholds, jsdom optional) | exact (cross-repo) | D-18-03 |
| 19 | `src/modules/revenue-intelligence/hooks/useThemePublisher.ts` | PORTAL | React hook | host→widget (postMessage broadcast) + MutationObserver | **Primary:** `src/modules/revenue-intelligence/hooks/useMcpProxy.ts` (same directory, `useMemo`-stabilized pattern). Secondary: `useAuth.ts` idle-listener setup/cleanup pattern | exact | MCPAPP-TOKEN-03, MCPAPP-TOKEN-06 |
| 20 | `src/modules/revenue-intelligence/components/RevenueIntelligencePage.tsx` (1-line diff) | PORTAL | component (minimal edit) | — | **Self:** existing file at lines 19-20 — add `useThemePublisher()` call + import | self (1 line + 1 import) | MCPAPP-TOKEN-03 |
| 21 | `public/sandbox-proxy.html` (insertion) | PORTAL | postMessage relay | host↔widget | **Self:** existing relay function at lines 63-76 — insert prefix-match block **before** the existing two-branch gate | self (insertion) | MCPAPP-TOKEN-02 |
| 22 | `widgets/revenue-today/{index.html,src/*}` | mcp-poc | migrated v1 files | build-time + runtime | **Self:** current `widgets/revenue-today.html` + `widgets/src/{main.tsx,App.tsx,styles.css}` — migrate unchanged into new dir | self (move) | — |
| 23 | `vite.config.ts` (mcp-poc root, DELETE) | mcp-poc | deprecated config | — | — (outright delete or rename to `.deprecated`; per-widget configs replace it) | self (delete) | — |

---

## Pattern Assignments

### 1. `widgets/shared/widget-tokens.ts` (mcp-poc) + `src/shared/styles/widget-tokens.ts` (PORTAL) — twins

**Role:** shared-module / token dictionary projection from `tokens.css`.
**Analog primary:** `G:/01_OPUS/Projects/PORTAL/src/shared/styles/tokens.css` lines 1-60 (source-of-truth CSS custom properties).

**Source mapping** (from tokens.css — use these exact hex values as DEFAULT_TOKEN_VALUES):

```css
/* tokens.css:2-4, 14-16, 21-23, 32-35, 41-44 — the 12 curated variables */
--bg: #FAFAF9;               /* → bg */
--surface: #FFFFFF;          /* → surface */
--border: #E5E5E5;           /* → border */
--text-primary: #333333;     /* → fg */
--text-secondary: #444444;   /* → muted */
--text-tertiary: #777777;    /* → subtle */
--accent: #2B1878;           /* → accent */
--committed: #16A34A;        /* → success */
--awaiting: #B45309;         /* → warning */
--destructive: #DC2626;      /* → danger */
--r-md: 10px;                /* → radius-md */
--r-lg: 14px;                /* → radius-lg */
```

**File header contract** (header text is **identical** in both repos — change only the path in the sentence):

```typescript
// KEEP IN SYNC WITH mcp-poc/widgets/shared/widget-tokens.ts
// 12 tokens locked per Phase 18 D-18-03. Do NOT add or remove keys.
// If you need a 13th token, reopen Phase 18 scope with Yuri first.
```

**Canonical file body** (copy verbatim from 18-RESEARCH lines 796-847 — adjust only the `KEEP IN SYNC WITH` path in the header, mirror on the other side):

```typescript
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

export function readCurrentTokens(): Record<TokenKey, string> {
  return { ...DEFAULT_TOKEN_VALUES }
}
```

**Critical:** The 12-key `WIDGET_TOKENS` object and `DEFAULT_TOKEN_VALUES` must be **byte-identical** across both repos (only the file-header path line differs). Contract tests (#13 and #14) enforce drift detection.

---

### 2. `widgets/shared/types.ts` (mcp-poc)

**Role:** protocol envelope types for `kmn/theme/*`.
**Analog:** No internal analog — design doc §5 is canonical. The closest internal stylistic analog is `mcp-poc/src/connectors/kmn-bridge-schemas.ts` (uses Zod), but for widget-bundle code we use **plain TS types** (no Zod — bundle size).

**Canonical body** (from 18-RESEARCH lines 714-745):

```typescript
export const PROTOCOL_VERSION = 1 as const

export const TOKEN_KEYS = [
  'accent','bg','border','danger','fg','muted',
  'radius-lg','radius-md','subtle','success','surface','warning',
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

---

### 3. `widgets/shared/vite.base.ts` (mcp-poc) — build-config factory

**Role:** factory pattern; each widget imports and calls.
**Analog primary:** `G:/01_OPUS/Projects/mcp-poc/vite.config.ts` (current file, lines 1-34) — keep the same plugin stack, change the shape from env-gated to factory.

**Imports/options to carry forward** (from current vite.config.ts lines 1-3, 21-33):

```typescript
// CURRENT ANALOG — mcp-poc/vite.config.ts:1-3
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve } from "node:path";

// Build options to carry forward verbatim — mcp-poc/vite.config.ts:21-33
plugins: [react(), viteSingleFile()],
build: {
  outDir: resolve(__dirname, "dist/widgets"),
  assetsInlineLimit: 100_000_000,
  cssCodeSplit: false,
  rollupOptions: {
    // (input is what changes per-widget in current config; the factory takes root instead)
  },
},
```

**What changes (new):**
- Add `@tailwindcss/vite` to plugins list (after `react()`, before `viteSingleFile()` — order matters per Pitfall 3).
- Add `removeViteModuleLoader: true` to `viteSingleFile(...)`.
- Add `rollupOptions.output.entryFileNames` to force output to `<widget-name>.html` at `dist/widgets/` (per Pitfall 7 + Open Question 4 — ensures `widget-bundle.ts` still finds files).
- `emptyOutDir: false` (build-runner #15 empties once at start, so per-widget config must not re-empty).

**Factory shape** (from 18-RESEARCH lines 299-330):

```typescript
// widgets/shared/vite.base.ts
import type { UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

export function buildWidgetConfig(opts: { root: string; outFileName: string }): UserConfig {
  return {
    plugins: [
      react(),
      tailwindcss(),
      viteSingleFile({ removeViteModuleLoader: true }),
    ],
    root: opts.root,
    build: {
      outDir: resolve(here, '../../dist/widgets'),
      emptyOutDir: false,
      assetsInlineLimit: 100_000_000,
      cssCodeSplit: false,
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          entryFileNames: opts.outFileName,  // stable filename: daily-briefing.html
        },
      },
    },
  }
}
```

**Preact fallback as a commented block** (MCPAPP-BUILD-05, documentation-only — see 18-RESEARCH lines 974-988):

```typescript
// To activate Preact fallback when bundle > 300 KB gzip:
// 1. npm install --save preact
// 2. Add to the returned config:
//    resolve: { alias: {
//      'react': 'preact/compat',
//      'react-dom': 'preact/compat',
//      'react-dom/test-utils': 'preact/test-utils',
//      'react/jsx-runtime': 'preact/jsx-runtime',
//    }}
// Source: preactjs.com/guide/v10/switching-to-preact/#compat
```

---

### 4. `widgets/daily-briefing/vite.config.ts` + `widgets/revenue-today/vite.config.ts` (mcp-poc) — thin per-widget wrappers

**Role:** trivial passthrough to `vite.base.ts` with this widget's root.
**Analog:** No internal analog — design-doc template.

**Canonical shape** (from 18-RESEARCH lines 322-331):

```typescript
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { buildWidgetConfig } from '../shared/vite.base'

export default defineConfig(buildWidgetConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  outFileName: 'daily-briefing.html',  // swap per-widget
}))
```

---

### 5. `widgets/daily-briefing/index.html` (migrated)

**Role:** HTML entry for Vite build.
**Analog:** `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing.html` (lines 1-12, verbatim).

**Migration diff** — only the script src path changes:

```html
<!-- CURRENT (widgets/daily-briefing.html:10) -->
<script type="module" src="/src/daily-briefing-main.tsx"></script>

<!-- NEW (widgets/daily-briefing/index.html) -->
<script type="module" src="./src/main.tsx"></script>
```

Everything else — charset, viewport, `<title>Tagesbriefing</title>`, `<div id="root"></div>` — copies verbatim.

---

### 6. `widgets/daily-briefing/src/main.tsx` (migrated)

**Role:** React bootstrap.
**Analog:** `G:/01_OPUS/Projects/mcp-poc/widgets/src/daily-briefing-main.tsx` (full file, lines 1-14).

**Migration diff** — only the CSS import path changes:

```typescript
// CURRENT (widgets/src/daily-briefing-main.tsx:4)
import "./daily-briefing.css";

// NEW (widgets/daily-briefing/src/main.tsx)
import "./styles.css";

// Component import path also updates:
import { DailyBriefingApp } from "./App"; // was "./DailyBriefingApp" in v1
```

Keep `StrictMode`, `createRoot`, `#root` guard verbatim.

---

### 7. `widgets/daily-briefing/src/App.tsx` + `styles.css` (migrated unchanged)

**Role:** v1 widget code, carried forward.
**Analog:** `widgets/src/DailyBriefingApp.tsx` (670 LOC) and `widgets/src/daily-briefing.css`.

**Migration:** File moves without edits. Per `project_v1_widget_cleanup` memory: Phase 19 deletes this code and replaces with v2 block implementations. Phase 18 MUST NOT modify the content — only the location.

**Rename note:** `DailyBriefingApp.tsx` becomes `App.tsx` in the new dir (shorter, matches `revenue-today` convention).

---

### 8. `widgets/daily-briefing/dev-host.html` — dev harness

**Role:** standalone mock-host at `localhost:5174/dev-host.html` — theme toggle + fixture dropdown + handshake log.
**Analog primary:** No internal harness exists. The closest pattern for "parent frame talks postMessage" is `G:/01_OPUS/Projects/PORTAL/public/sandbox-proxy.html` lines 63-76 (the message relay idiom), but the harness inverts the direction — it's a **host mock**, not a relay.

**Canonical body** (from 18-RESEARCH lines 890-953 — copy the entire `<script type="module">` block verbatim; add a `<select>` for fixture modes and route through `iframe.src` query-string updates):

```html
<!-- Harness responds to kmn/theme/request with DEFAULT_TOKEN_VALUES (hell) -->
<!-- Theme buttons force hell / dunkel (Platzhalter) token sets -->
<!-- Fixture dropdown: 'basket-aov' | 'one-block-failing' -->
<!-- All handshake events appended to #log for DevTools-free observation -->
```

**Critical feature per D-18-04:**
1. **Theme toggle** sends `kmn/theme/set` with 12-token payload (hell uses `DEFAULT_TOKEN_VALUES`; dunkel uses approximated `DARK_MOCK` constant — see 18-RESEARCH lines 922-926).
2. **`?mock=basket-aov` and `?mock=one-block-failing`** propagate to the iframe via `iframe.src = './index.html?mock=' + encodeURIComponent(mode)`.
3. **Handshake log** — every incoming `kmn/theme/request` and outgoing `kmn/theme/set` appended to a visible `<div class="log">`.

**German labels** (per project Architecture Rule 6): `Hell`, `Dunkel (Platzhalter)`, `Basis-Fixture`, `Widget neu geladen`. Console logs may remain English.

**Fixture-mode URL-param parser** lives inside `App.tsx` (or a `lib/fixtures.ts` file in the widget src):

```typescript
// widgets/daily-briefing/src/lib/fixtures.ts (suggested location)
export function getFixtureMode(): 'basket-aov' | 'one-block-failing' | null {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('mock')
  if (mode === 'basket-aov' || mode === 'one-block-failing') return mode
  return null
}
```

The v1 widget code (carried over) does not consume this yet — Phase 19 wires it in. Phase 18 ships the parser + harness-side URL construction only.

---

### 9. `widgets/shared/hooks/useHostTokens.ts` — the widget-side postMessage hook

**Role:** React 19 hook — posts request on mount, listens for reply, applies CSS vars, falls back at 300 ms.
**Analog primary:** `G:/01_OPUS/Projects/PORTAL/src/modules/revenue-intelligence/hooks/useMcpProxy.ts` (full file, lines 66-77) — the `useMemo`-stabilized return pattern.

**`useMemo` stability pattern** (from analog lines 66-77):

```typescript
// ANALOG — useMcpProxy.ts:66-77
export function useMcpProxy() {
  return useMemo(
    () => ({
      callTool: (params) => invoke('tools/call', params, 'callTool'),
      // ...
    }),
    [],
  )
}
```

**StrictMode double-fire defense** (from `RevenueIntelligencePage.tsx` lines 46-64):

```typescript
// ANALOG — RevenueIntelligencePage.tsx:46-64
const initialCallDoneRef = useRef(false)
useEffect(() => {
  if (initialCallDoneRef.current) return
  initialCallDoneRef.current = true
  let cancelled = false
  ;(async () => {
    try {
      const result = await callToolRef.current({ name: TOOL_NAME, arguments: {} })
      if (!cancelled) setToolResult(result)
    } catch (err) { /* ... */ }
  })()
  return () => { cancelled = true }
}, [])
```

**Canonical hook body** (from 18-RESEARCH lines 437-507 — implement verbatim, ~70 LOC):

- `useState` for `tokens`, `source`, `protocolVersion`
- `useRef(false)` for `hostReplyReceivedRef` (guards 300ms fallback overwrite)
- `useEffect(() => {...}, [])` mounts: post request → subscribe to replies → 300ms setTimeout → cleanup function that removes listener + clears timer
- Inside message listener: validate `data.type === 'kmn/theme/set'`, validate `typeof protocolVersion === 'number'`, **reject if `data.protocolVersion > PROTOCOL_VERSION`** (console.warn + return), iterate `WIDGET_TOKENS` keys and call `document.documentElement.style.setProperty(cssVar, value)` for each (MCPAPP-TOKEN-04)
- Fallback path: applies `DEFAULT_TOKEN_VALUES` via `setProperty` if `!hostReplyReceivedRef.current`
- Return: `useMemo(() => ({ tokens, source, protocolVersion }), [tokens, source, protocolVersion])`

**Security — token-value regex guard** (from 18-RESEARCH §Security Domain table row 1):

```typescript
// Reject values that don't match a safe CSS token shape — hex colors, units, rgb(), etc.
const SAFE_VALUE = /^[\d#.a-z%, ()/-]+$/i
// Apply only if SAFE_VALUE.test(value)
```

**Key detail — post target:** Widget is loaded inside sandbox-proxy's inner iframe. `window.parent` refers to sandbox-proxy (not portal), which relays to portal. Use `'*'` targetOrigin because sandbox-proxy's srcdoc has origin=null; validation happens on the other side (sandbox-proxy's source-identity gate).

---

### 10. Twin contract tests — `widgets/shared/__tests__/widget-tokens.contract.test.ts` (mcp-poc) + `src/shared/styles/__tests__/widget-tokens.contract.test.ts` (PORTAL)

**Role:** prove the 12-key frozen set hasn't drifted in either repo.
**Analog PORTAL side:** `G:/01_OPUS/Projects/PORTAL/src/shared/__tests__/notification-preferences.test.ts` (full file, lines 1-17) — minimal vitest structure.

**Analog body** (notification-preferences.test.ts:1-17):

```typescript
import { describe, test, expect } from 'vitest'
import type { NotificationPreferences } from '@/shared/types/common'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/shared/types/common'

describe('NotificationPreferences', () => {
  test('DEFAULT_NOTIFICATION_PREFERENCES includes peer_messages defaulting to true', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.peer_messages).toBe(true)
  })
  // ...
})
```

**Canonical contract test body** (from 18-RESEARCH lines 853-885 — **must be byte-identical below the import line in both repos**):

```typescript
import { describe, it, expect } from 'vitest'
import { WIDGET_TOKENS } from '../widget-tokens'

const FROZEN_KEYS = [
  'accent','bg','border','danger','fg','muted',
  'radius-lg','radius-md','subtle','success','surface','warning',
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

**Per Pitfall 9**: The `FROZEN_KEYS` array must be **byte-identical** across both files. Suggest a leading comment: `// MUST match widgets/shared/__tests__/widget-tokens.contract.test.ts byte-for-byte below this line.`

---

### 11. `scripts/build-widgets.mjs` refactor (mcp-poc)

**Role:** runner; sequential per-widget Vite builds.
**Analog:** **Self** — `G:/01_OPUS/Projects/mcp-poc/scripts/build-widgets.mjs` (current, lines 1-31).

**What stays** (lines 7-23 — keep verbatim):

```javascript
// CURRENT — scripts/build-widgets.mjs:11-23
function run(widget) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["vite", "build"], {
      stdio: "inherit",
      shell: true,
      env: { ...process.env, WIDGET: widget },   // ← this env plumbing GOES AWAY
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`vite build failed for ${widget} (exit ${code})`));
    });
  });
}
```

**What changes** — three edits only:
1. **Widget discovery** — replace `const WIDGETS = ["revenue-today", "daily-briefing"]` with a `readdirSync + existsSync` filter that scans `widgets/*/vite.config.ts`. Excludes `shared/` by name.
2. **Per-widget `cwd`** — spawn now runs `cd widgets/<name> && npx vite build` (via `cwd: join(widgetsRoot, widget)` option on `spawn`); drop the `WIDGET` env var.
3. **Empty dist once at start** — `if (existsSync(distRoot)) rmSync(distRoot, { recursive: true, force: true })` before the loop (replaces per-widget `emptyOutDir` sequencing).

**Full refactored shape** (from 18-RESEARCH lines 343-377 — adopt verbatim):

```javascript
import { readdirSync, existsSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'

const widgetsRoot = resolve(process.cwd(), 'widgets')
const distRoot = resolve(process.cwd(), 'dist/widgets')

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
      code === 0 ? resolve() : reject(new Error(`vite build failed for ${widget} (exit ${code})`))
    )
  })
}

for (const widget of widgetDirs) {
  console.log(`\n→ Building widget: ${widget}`)
  await run(widget)
}

console.log('\n✓ All widgets built.')
```

---

### 12. `package.json` (mcp-poc) — devDependency bumps + runtime deps + test script

**Role:** config diff.
**Analog:** **Self** — `G:/01_OPUS/Projects/mcp-poc/package.json` (current, lines 1-37).

**devDependencies diff** (current lines 21-33):

| Package | Current | New | Why |
|---------|---------|-----|-----|
| `react` | `^18.3.1` | `^19.2.5` | D-18-01 (React 19 upgrade) |
| `react-dom` | `^18.3.1` | `^19.2.5` | D-18-01 |
| `@types/react` | `^18.3.18` | `^19.2.14` | D-18-01 |
| `@types/react-dom` | `^18.3.5` | `^19.2.3` | D-18-01 |
| `@vitejs/plugin-react` | `^4.3.4` | `^5.1.1` | React 19 JSX runtime (Pitfall 1) |
| `vite-plugin-singlefile` | `^2.0.3` | `^2.3.3` | Latest (MCPAPP-BUILD-01) |
| `vitest` | — | `^2.1.x` (or `^4.x` to match PORTAL) | D-18-03 contract tests |
| `jsdom` | — | `^28.x` | Only if `useHostTokens` hook gets unit tests beyond contract |

**dependencies additions** (new runtime deps — widgets bundle these):

| Package | Version | Purpose |
|---------|---------|---------|
| `@tailwindcss/vite` | `^4.2.4` | MCPAPP-BUILD-02 |
| `tailwindcss` | `^4.2.4` | MCPAPP-BUILD-02 |
| `motion` | `^12.38.0` | MCPAPP-BUILD-03 |

**scripts additions** (line 7-13 block):

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "dev:widget": "cd widgets/daily-briefing && vite --port 5174 --open dev-host.html"
  }
}
```

The `dev:widget` script hardcodes `daily-briefing` for Phase 18; per-widget variants are easy to add later.

---

### 13. `tsconfig.widgets.json` (mcp-poc) — update `include`

**Role:** config diff.
**Analog:** **Self** — `G:/01_OPUS/Projects/mcp-poc/tsconfig.widgets.json` (current, lines 1-22).

**Current include** (line 19):

```json
"include": ["widgets/**/*.ts", "widgets/**/*.tsx"]
```

**New include** (accommodates new shared dir + per-widget src):

```json
"include": [
  "widgets/**/*.ts",
  "widgets/**/*.tsx"
]
```

No actual change needed — the current glob already covers `widgets/daily-briefing/src/**` and `widgets/shared/**`. Verify by running `tsc -p tsconfig.widgets.json --noEmit` after migration.

**Per-widget `tsconfig.json`** (NEW files at `widgets/daily-briefing/tsconfig.json`, `widgets/revenue-today/tsconfig.json`) — minimal extends:

```json
{
  "extends": "../../tsconfig.widgets.json",
  "include": ["src/**/*"]
}
```

---

### 14. `vitest.config.ts` (mcp-poc, NEW)

**Role:** test config.
**Analog:** `G:/01_OPUS/Projects/PORTAL/vitest.config.ts` (full file, lines 1-47) — cross-repo analog.

**PORTAL reference** (lines 1-12, trimmed — drop coverage block for mcp-poc):

```typescript
// ANALOG — PORTAL/vitest.config.ts:1-12
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['archive/**', 'dist/**', 'node_modules/**'],
  },
  // ... coverage skipped for mcp-poc
})
```

**Minimal mcp-poc vitest.config.ts:**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',  // contract test doesn't need DOM; flip to 'jsdom' if useHostTokens gets a unit test
    include: ['widgets/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.ts'],
    exclude: ['node_modules/**', 'dist/**'],
  },
})
```

Per Open Question 5: keep `include` explicit so vitest does not walk `node_modules`.

---

### 15. `src/modules/revenue-intelligence/hooks/useThemePublisher.ts` (PORTAL) — NEW hook

**Role:** host-side postMessage responder + MutationObserver re-emit.
**Analog primary:** `G:/01_OPUS/Projects/PORTAL/src/modules/revenue-intelligence/hooks/useMcpProxy.ts` (full file, lines 1-77) — same directory, `useMemo`-stabilized pattern.

**Imports pattern** (from analog lines 1-3):

```typescript
// ANALOG — useMcpProxy.ts:1-3
import { useMemo } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { toast } from 'sonner'
```

**For useThemePublisher** — different imports but same shape:

```typescript
import { useEffect, useMemo } from 'react'
import { WIDGET_TOKENS, readCurrentTokens } from '@/shared/styles/widget-tokens'
```

**Hook return stability pattern** (from analog lines 66-77):

```typescript
// ANALOG — useMcpProxy.ts:66-77 — the mandatory useMemo pattern
export function useMcpProxy() {
  return useMemo(
    () => ({ /* ... */ }),
    [],
  )
}
```

**Canonical body** (from 18-RESEARCH lines 519-578 — implement verbatim):

- `useEffect(() => {...}, [])`:
  1. Define `publishTokens(target?, targetOrigin?)` — reads 12 tokens from `readCurrentTokens()`, builds `{type:'kmn/theme/set', protocolVersion:1, tokens}`, posts to `target ?? window`.
  2. Install `message` listener: if `e.data?.type === 'kmn/theme/request'`, validate `protocolVersion`, reply via `(e.source as Window)?.postMessage(...)` with targetOrigin `'*'` (sandbox-proxy srcdoc has null origin — see Pitfall 4).
  3. Install `MutationObserver` on `document.documentElement` watching `attributes` with `attributeFilter: ['class', 'data-theme', 'style']`. On fire: iterate `document.querySelectorAll('iframe')` and post `kmn/theme/set` to each `contentWindow`.
  4. Cleanup: `removeEventListener` + `observer.disconnect()`.
- Return: `useMemo(() => ({ protocolVersion: PROTOCOL_VERSION }), [])` — side-effect-only but stable return satisfies hook rule.

**Protocol version mismatch handling** (MCPAPP-TOKEN-08) — mirror the widget-side check:

```typescript
if (e.data.protocolVersion > PROTOCOL_VERSION) {
  console.warn(
    `[kmn-theme] widget protocolVersion=${e.data.protocolVersion} > portal=${PROTOCOL_VERSION} — ignoring`
  )
  return
}
```

**Secondary analog — listener lifecycle pattern** from `src/shared/hooks/useAuth.ts` (any `useEffect` with setup + cleanup):

- Add listener in effect body.
- Return cleanup function that removes listener.
- Empty dep array `[]` — mount/unmount-scoped.

---

### 16. `RevenueIntelligencePage.tsx` — 1-line edit

**Role:** minimal integration.
**Analog:** **Self** — the file at lines 1-147.

**Exact diff** (add 1 import + 1 call):

```typescript
// ANALOG — RevenueIntelligencePage.tsx:11 (existing import line)
import { useMcpProxy } from '../hooks/useMcpProxy'

// NEW (insert on line 12)
import { useThemePublisher } from '../hooks/useThemePublisher'

// ANALOG — RevenueIntelligencePage.tsx:19-20
export function RevenueIntelligencePage() {
  const { callTool, readResource, listResources } = useMcpProxy()

// NEW (insert on line 20)
  useThemePublisher()
```

No other changes. The hook is side-effect-only; no JSX impact.

**Per CONTEXT.md D-18-05**: the publisher is installed now; the `MutationObserver` sits idle in production (portal has no dark mode yet) and becomes active on any future `<html>` class/data-theme/style toggle.

---

### 17. `public/sandbox-proxy.html` — insert `kmn/theme/*` relay block

**Role:** postMessage relay, bidirectional prefix pass-through.
**Analog:** **Self** — the relay function at lines 63-76.

**Existing relay** (lines 63-76, verbatim):

```javascript
// CURRENT — public/sandbox-proxy.html:63-76
window.addEventListener('message', function relay(e) {
  if (!e.data || typeof e.data !== 'object') return;

  if (e.source === inner.contentWindow) {
    // Inner -> host. Source-identity gate is the trust boundary here;
    // srcdoc has origin "null" so we cannot validate by origin.
    window.parent.postMessage(e.data, selfOrigin);
  } else if (e.source === window.parent && e.origin === selfOrigin) {
    // Host -> inner. Require same-origin host.
    if (inner.contentWindow) {
      inner.contentWindow.postMessage(e.data, '*');
    }
  }
});
```

**Insertion** (insert the new block **inside the relay function**, **after** the `!e.data` guard at line 64, **before** the existing `if (e.source === inner.contentWindow)` at line 66):

```javascript
// NEW BLOCK (MCPAPP-TOKEN-02): Theme messages by prefix — pass through without interpretation.
// Must sit BEFORE the AppBridge gate so widget (origin=null) and host (origin=selfOrigin)
// can both post kmn/theme/* messages. Early-return keeps the existing relay untouched.
if (typeof e.data.type === 'string' && e.data.type.indexOf('kmn/theme/') === 0) {
  if (e.source === inner.contentWindow) {
    // widget → host
    window.parent.postMessage(e.data, selfOrigin);
  } else if (e.source === window.parent && e.origin === selfOrigin) {
    // host → widget
    if (inner.contentWindow) inner.contentWindow.postMessage(e.data, '*');
  }
  return;
}
```

**Why duplicate the routing logic** (per 18-RESEARCH §Pattern 3): explicit intent + grep-ability. An auditor running `grep 'kmn/theme' public/sandbox-proxy.html` must find a match (PORT-02 acceptance assertion per the requirements).

---

### 18. `vite.config.ts` (mcp-poc root) — DELETE (or rename)

**Role:** deprecated root config.
**Action:** `rm` (or `mv vite.config.ts vite.config.ts.deprecated` if preservation desired for history).

**Why:** per-widget configs (#5, #6) replace the env-gated multi-entry hack. The root config would be misleading (not used by any script) and would break `vitest` auto-discovery (vitest picks up `vite.config.ts` at root by default if no `vitest.config.ts` exists).

Handled by #14 (`vitest.config.ts` takes precedence), but deleting the deprecated file is cleaner per 18-RESEARCH §State of the Art.

---

### 19. `widgets/revenue-today/{index.html, src/*}` — migrate unchanged

**Role:** v1 code carried into new dir shape.
**Analog:** **Self** — `widgets/revenue-today.html` + `widgets/src/{main.tsx, App.tsx, styles.css}`.

**Migration:**
- `widgets/revenue-today.html` → `widgets/revenue-today/index.html` (update script src to `./src/main.tsx`)
- `widgets/src/main.tsx` → `widgets/revenue-today/src/main.tsx` (unchanged — already imports from `./App`, `./styles.css`)
- `widgets/src/App.tsx` → `widgets/revenue-today/src/App.tsx` (unchanged)
- `widgets/src/styles.css` → `widgets/revenue-today/src/styles.css` (unchanged)

---

## Shared Patterns

### Cross-repo twin file header

**Source:** 18-RESEARCH §Shared Token Module pattern.
**Apply to:** #1 and #2 (`widget-tokens.ts` twins); #13 and #14 (contract test twins).

```typescript
// KEEP IN SYNC WITH <other-repo-path>.
// 12 tokens locked per Phase 18 D-18-03. Do NOT add or remove keys.
```

The two token files differ only in the header path sentence. The two contract-test files differ only in the import path (both resolve to their local `../widget-tokens`).

---

### `useMemo`-stabilized hook return (mandatory)

**Source:** `G:/01_OPUS/Projects/PORTAL/src/modules/revenue-intelligence/hooks/useMcpProxy.ts:66-77`.
**Apply to:** #9 (`useHostTokens`), #15 (`useThemePublisher`).
**Memory reference:** `feedback_react_hook_identity_churn` (global).

```typescript
// Required pattern — every new hook in this phase
export function useXxx() {
  // ... state, effects
  return useMemo(() => ({ /* ... */ }), [/* deps */])
}
```

Without this, the widget's AppRenderer (`RevenueIntelligencePage.tsx:129-141`) sees a new callback identity on every render, which re-fires `useEffect([callback])` chains and DDoSes `mcp-proxy`.

---

### StrictMode double-fire defense

**Source:** `G:/01_OPUS/Projects/PORTAL/src/modules/revenue-intelligence/components/RevenueIntelligencePage.tsx:46-64` (ref-guard + cancellation flag pattern).
**Apply to:** #9 (`useHostTokens`) — specifically `hostReplyReceivedRef` guards against 300ms fallback firing after host reply arrives during the second mount.

```typescript
const guardRef = useRef(false)
useEffect(() => {
  if (guardRef.current) return
  guardRef.current = true
  let cancelled = false
  // ... async logic that respects `cancelled`
  return () => { cancelled = true }
}, [])
```

---

### Postmessage source-identity gate (not origin gate)

**Source:** `G:/01_OPUS/Projects/PORTAL/public/sandbox-proxy.html:58-75` (existing comment + code pattern).
**Apply to:** #17 (new relay block).

```javascript
// WRONG: origin check fails for srcdoc iframes (origin=null)
if (e.origin !== selfOrigin) return;

// RIGHT: source-identity check for widget→host, origin check for host→widget
if (e.source === inner.contentWindow) { /* widget→host */ }
else if (e.source === window.parent && e.origin === selfOrigin) { /* host→widget */ }
```

---

### German UI strings

**Source:** CLAUDE.md Architecture Rule 6 + existing widget `title` (`Tagesbriefing`).
**Apply to:** #8 (dev harness labels: `Hell`, `Dunkel (Platzhalter)`, `Basis-Fixture`, `Widget neu geladen`).
**Exception:** Console logs may remain English (developer-facing, not user-facing).

---

### Sequential spawn build runner

**Source:** `G:/01_OPUS/Projects/mcp-poc/scripts/build-widgets.mjs:11-23` (current pattern).
**Apply to:** #11 (refactored build runner).

The `spawn + Promise + for-await` idiom stays; only the discovery mechanism changes.

---

### vitest minimal config for non-DOM tests

**Source:** `G:/01_OPUS/Projects/PORTAL/vitest.config.ts:1-12` (trimmed).
**Apply to:** #14 (new mcp-poc vitest.config.ts).

For the contract test specifically (#13): `environment: 'node'` is sufficient — no DOM needed. If `useHostTokens` unit tests are added (Wave 1), flip to `environment: 'jsdom'` and add `setupFiles` akin to `PORTAL/src/test/setup.ts:1-20` (IntersectionObserver stub, etc.).

---

## Files → Requirements Map

| Requirement | Files |
|-------------|-------|
| MCPAPP-BUILD-01 (Vite single-file config) | #3 (types), #4 (vite.base.ts), #5, #6 (per-widget configs), #7 (index.html) |
| MCPAPP-BUILD-02 (Tailwind v4 via plugin) | #4 (vite.base — plugin order), #10 (styles.css — `@import "tailwindcss"` on Phase 19; Phase 18 preserves v1 CSS) |
| MCPAPP-BUILD-03 (Motion v12 + reduced-motion) | #12 (package.json — `motion` dep); actual usage is Phase 19 |
| MCPAPP-BUILD-04 (300KB gz budget) | #4 (vite.base — optimization), #11 (build runner — could add gzip check), #12 (React 19 deps) |
| MCPAPP-BUILD-05 (Preact fallback documented) | #4 (vite.base — comment block) |
| MCPAPP-BUILD-06 (Dev harness on :5174) | #8 (dev-host.html), #12 (package.json — `dev:widget` script) |
| MCPAPP-BUILD-07 (Vercel single `npm run build`) | #11 (build runner — unchanged entry point), `mcp-poc/vercel.json` (already correct, unchanged) |
| MCPAPP-TOKEN-01 (Widget posts request) | #9 (useHostTokens mount effect) |
| MCPAPP-TOKEN-02 (sandbox-proxy relay) | #17 (public/sandbox-proxy.html insertion) |
| MCPAPP-TOKEN-03 (Portal responds) | #15 (useThemePublisher), #16 (RevenueIntelligencePage 1-line edit) |
| MCPAPP-TOKEN-04 (Widget applies CSS vars) | #9 (useHostTokens setProperty loop) |
| MCPAPP-TOKEN-05 (300ms fallback) | #9 (useHostTokens setTimeout + ref-guard) |
| MCPAPP-TOKEN-06 (Re-emit survives mount cycles) | #15 (MutationObserver + persistent listener) |
| MCPAPP-TOKEN-07 (widget-tokens.ts 12-key frozen set) | #1, #2 (token modules), #13, #14 (contract tests) |
| MCPAPP-TOKEN-08 (Protocol version asymmetry) | #9 (widget-side warn+ignore), #15 (portal-side warn+ignore) |
| D-18-01 (React 19 upgrade) | #12 (package.json deps) |
| D-18-02 (Per-widget dirs) | #5, #6, #7, #8, #9 (structure); #19 (revenue-today migration); #23 (root vite.config deletion) |
| D-18-02a (Dir-scan build) | #11 (build-widgets.mjs refactor) |
| D-18-02b (Shared vite base) | #4 (vite.base.ts) |
| D-18-03 (Manual duplication + contract tests) | #1, #2 (file header), #13, #14 (twin tests), #18 (vitest.config.ts) |
| D-18-04 (Full dev harness + fixture params) | #8 (dev-host.html — theme toggle + fixture dropdown + handshake log) |
| D-18-05 (Re-emit infra from day 1) | #15 (MutationObserver wired even without portal dark mode) |

---

## No Analog Found (edge cases with no internal precedent)

| File | Reason | Mitigation |
|------|--------|------------|
| `widgets/shared/types.ts` | No existing TS-only protocol-types file in mcp-poc; adjacent `connectors/kmn-bridge-schemas.ts` uses Zod (wrong here, bundle size). | 18-RESEARCH §Protocol Message Shapes provides the full canonical body. |
| `widgets/shared/vite.base.ts` | No existing factory-pattern Vite config in either repo. | 18-RESEARCH §Pattern 1 provides factory shape; carries over plugins from current `mcp-poc/vite.config.ts`. |
| `widgets/daily-briefing/dev-host.html` | No existing dev-harness file anywhere — this is the first. | 18-RESEARCH §Dev Harness Shell provides canonical body. Architecture mirrors `public/sandbox-proxy.html` (iframe + postMessage relay) but inverts the direction (harness = mock host). |
| Cross-repo twin file drift audit (one-shot script, optional) | Not requested in CONTEXT.md but called out as a "stretch" in Pitfall 9. | Optional — if planner wants, add `scripts/verify-token-contract.ts` that globs both repos and diffs key sets. Otherwise, CI running both vitest suites is the contract. |

---

## Metadata

**Analog search scope:**
- `G:/01_OPUS/Projects/mcp-poc/{vite.config.ts, scripts/build-widgets.mjs, package.json, tsconfig.widgets.json, widgets/**, src/{widget-bundle.ts, mcp-server.ts}}`
- `G:/01_OPUS/Projects/PORTAL/{public/sandbox-proxy.html, src/shared/styles/tokens.css, src/shared/__tests__/**, src/modules/revenue-intelligence/**, vitest.config.ts, src/test/setup.ts}`

**Files read:** 16 (8 mcp-poc source files + 8 PORTAL source/config/test files).

**Pattern extraction date:** 2026-04-24.

**Primary design-doc reference:** `docs/ideas/MCP_UI_RESOURCE_BUILD_PIPELINE.md` (401 lines; sections 1-13 fully cited by 18-CONTEXT.md and 18-RESEARCH.md).
