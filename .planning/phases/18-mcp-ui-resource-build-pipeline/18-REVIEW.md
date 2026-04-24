---
phase: 18-mcp-ui-resource-build-pipeline
reviewed: 2026-04-24T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - src/shared/styles/widget-tokens.ts
  - src/shared/styles/__tests__/widget-tokens.contract.test.ts
  - src/modules/revenue-intelligence/hooks/useThemePublisher.ts
  - src/modules/revenue-intelligence/components/RevenueIntelligencePage.tsx
  - public/sandbox-proxy.html
  - ../../../../mcp-poc/widgets/shared/widget-tokens.ts
  - ../../../../mcp-poc/widgets/shared/types.ts
  - ../../../../mcp-poc/widgets/shared/hooks/useHostTokens.ts
  - ../../../../mcp-poc/widgets/shared/__tests__/widget-tokens.contract.test.ts
  - ../../../../mcp-poc/widgets/shared/hooks/__tests__/useHostTokens.test.ts
  - ../../../../mcp-poc/widgets/shared/vite.base.ts
  - ../../../../mcp-poc/widgets/daily-briefing/dev-host.html
  - ../../../../mcp-poc/widgets/daily-briefing/src/lib/fixtures.ts
  - ../../../../mcp-poc/widgets/daily-briefing/vite.config.ts
  - ../../../../mcp-poc/widgets/revenue-today/vite.config.ts
  - ../../../../mcp-poc/widgets/daily-briefing/src/main.tsx
  - ../../../../mcp-poc/widgets/daily-briefing/src/App.tsx
  - ../../../../mcp-poc/widgets/revenue-today/src/main.tsx
  - ../../../../mcp-poc/widgets/revenue-today/src/App.tsx
  - ../../../../mcp-poc/widgets/jsx-global.d.ts
  - ../../../../mcp-poc/scripts/build-widgets.mjs
  - ../../../../mcp-poc/scripts/check-widget-bundle-size.mjs
findings:
  critical: 0
  warning: 3
  info: 6
  total: 9
status: warnings
---

# Phase 18: Code Review Report

**Reviewed:** 2026-04-24
**Depth:** standard
**Files Reviewed:** 22
**Status:** warnings (non-blocking)

## Summary

Phase 18 delivers the cross-repo token bridge (`kmn/theme/*` postMessage protocol) plus the widget build pipeline refactor. Overall code quality is high — the postMessage protocol is defensively written with protocol-version guards, source-identity gates, and a value-shape regex, and the React hooks follow the `useMemo`-stabilization rule from ADR-034. The 12-token frozen contract is enforced on both sides by a strict-equality test on sorted keys, and a byte-identical diff confirms the twins match below their path-sentence headers.

Three non-blocking warnings cover: (1) a misleading comment about IE-specific CSS `expression()` defense when the regex does not actually block the literal string `expression(`, (2) the Vite HTML rename plugin's brittle last-write-wins behavior if the bundle ever emits multiple `.html` assets, and (3) the host-side `useThemePublisher` broadcasting token updates to every `<iframe>` on the page indiscriminately via the MutationObserver rebroadcast path. The remaining info items are minor cleanups and design-doc propagation notes.

No critical issues. The postMessage trust model, the sandbox-proxy relay, the contract tests, and the useMemo-stabilized hook returns are all correct. The 12-token twins are byte-identical below their headers (verified via diff).

## Warnings

### WR-01: SAFE_VALUE regex does not block `expression(` as the comment claims

**File:** `mcp-poc/widgets/shared/hooks/useHostTokens.ts:15-16`
**Issue:** The comment states the regex "Defends against postMessage-injected `expression(alert(1))` (IE-only, but defense-in-depth)." The regex is `/^[\d#.a-z%, ()/-]+$/i` — a character-set whitelist. The string `expression(alert(1))` consists entirely of whitelisted characters (letters, digits, parens), so it PASSES the regex. The comment misrepresents the defense.

In practice the injection risk is near-zero because `.style.setProperty('--color-bg', value)` stores a raw token value for a CSS custom property; the browser's CSS engine interprets it only at usage site, and `var(--color-bg)` cannot pivot into script execution. The regex still serves a real purpose (blocks `<`, `>`, `"`, `'`, `;`, `\n`, backtick, colon — so `url(javascript:...)` and HTML-breaking payloads are rejected), but the comment overstates the threat model.

**Fix:** Update the comment to reflect what the regex actually does:
```typescript
// Reject values that contain anything beyond hex, units, %, commas, parens, slashes, and letters.
// Real defense comes from the browser's CSS parser — setProperty on a custom property stores
// a token, it does not execute. This regex is a belt-and-suspenders filter that rejects the
// obvious injection shapes (colons in url(javascript:...), angle brackets, quotes, semicolons).
const SAFE_VALUE = /^[\d#.a-z%, ()/-]+$/i
```

### WR-02: HTML rename plugin loses assets if bundle emits more than one `.html` file

**File:** `mcp-poc/widgets/shared/vite.base.ts:31-47`
**Issue:** The `renameHtmlAsset` plugin loops over all `.html` assets in the bundle and renames every one of them to the same `outFileName`. If a future change ever causes more than one HTML asset to be emitted (e.g. if `dev-host.html` is included, or if a nested HTML import is added), each iteration overwrites the previous `bundle[outFileName]` entry — only the last one survives, silently dropping the others.

Today each widget's Vite build emits exactly one `index.html` asset, so the bug is latent. The combination `.endsWith('.html') && type === 'asset'` will also re-match the newly-inserted `bundle[outFileName]` if the iteration order placed it before another `.html` key — though `Object.keys(bundle)` is captured once before the loop, so this specific variant is not hit today. Still, the loop shape invites future breakage.

**Fix:** Assert the invariant explicitly and fail loudly if violated:
```typescript
generateBundle(_options, bundle) {
  const htmlKeys = Object.keys(bundle).filter(
    (k) => k.endsWith('.html') && (bundle[k] as { type?: string }).type === 'asset',
  )
  if (htmlKeys.length === 0) return
  if (htmlKeys.length > 1) {
    this.error(
      `kmn:rename-html-asset expected exactly one .html asset, found ${htmlKeys.length}: ${htmlKeys.join(', ')}`,
    )
  }
  const [key] = htmlKeys
  const asset = bundle[key]
  delete bundle[key]
  ;(asset as { fileName: string }).fileName = outFileName
  bundle[outFileName] = asset
},
```

### WR-03: `useThemePublisher` rebroadcasts tokens to every `<iframe>` on the page, not just MCP widget iframes

**File:** `src/modules/revenue-intelligence/hooks/useThemePublisher.ts:43-50`
**Issue:** The MutationObserver callback iterates `document.querySelectorAll('iframe')` and posts `kmn/theme/set` to every iframe's `contentWindow`, regardless of origin or purpose. On the Revenue Intelligence page today there is only the sandbox-proxy iframe, so this is harmless in practice. But the hook is installed at page scope — any other iframe mounted into the page (a future embedded preview, a YouTube embed, a payment widget, a help-center chat) would receive a `kmn/theme/set` message containing all 12 portal color tokens.

The tokens are non-sensitive (color codes, radii), so this is a leak of low-value data only. The larger concern is that an unrelated iframe may inadvertently act on a `kmn/theme/set` if it happens to have a matching listener — a future integration could conflict in a subtle way.

The same class of issue affects the `window.addEventListener('message', onMessage)` on the request side — the hook replies to a `kmn/theme/request` from any frame, not just from the sandbox-proxy. Origin validation is impossible because the widget's srcdoc has origin=null, but the hook does not gate on `e.source` identity either.

**Fix:** Scope the rebroadcast to iframes known to be MCP sandboxes. One option: tag the sandbox-proxy iframe with a data attribute in `RevenueIntelligencePage.tsx` (e.g. `data-kmn-sandbox="true"`) and filter the selector:
```typescript
document.querySelectorAll('iframe[data-kmn-sandbox="true"]').forEach((iframe) => {
  ;(iframe as HTMLIFrameElement).contentWindow?.postMessage(
    { type: 'kmn/theme/set', protocolVersion: PROTOCOL_VERSION, tokens: readCurrentTokens() },
    '*',
  )
})
```
The `AppRenderer` component sets the iframe `src` to `sandbox-proxy.html`; you'd need to either extend AppRenderer's iframe props or wrap it. Alternatively, on the request-response path, track the reply source in a `WeakSet<Window>` and only rebroadcast to those sources.

For the listener side, document the scope limitation explicitly — the design explicitly accepts that tokens are public information, so no gating is required. Add a one-line comment to the `onMessage` handler clarifying this acceptance.

## Info

### IN-01: `useHostTokens` does not reset CSS vars when a subsequent ThemeSet omits keys

**File:** `mcp-poc/widgets/shared/hooks/useHostTokens.ts:53-60`
**Issue:** When a second `kmn/theme/set` arrives carrying only a subset of the 12 keys (e.g. `{bg: '#000'}` only), the loop applies only the keys present and leaves the rest of `document.documentElement.style` at whatever earlier value was set. `applied[key]` falls back to `DEFAULT_TOKEN_VALUES[key]` for state reporting, but `setProperty` is not called — so the in-state report and the actual applied styles diverge for omitted keys.

Today's portal publisher always sends all 12 tokens from `readCurrentTokens()`, so this is latent. If a future publisher implements delta updates, the bug would surface.

**Fix:** Either (a) when a key is missing, explicitly setProperty the default value, or (b) document that publishers MUST send the full 12-token set. Option (b) matches the current contract and requires only a comment.

### IN-02: `setIsReady((prev) => prev || true)` is equivalent to `setIsReady(() => true)`

**File:** `src/modules/revenue-intelligence/components/RevenueIntelligencePage.tsx:117-119`
**Issue:** `prev || true` always evaluates to `true`. The functional form is harmless, but the intent (idempotent flip-to-true) is clearer written as:
```typescript
const handleSizeChanged = useCallback(() => {
  setIsReady(true)
}, [])
```
React's `useState` setter bails on equal values, so the rebind-avoidance comment still holds — passing `true` directly triggers the same short-circuit as the functional form.

### IN-03: Protocol version checks handle `>` but not `<` — behavior on future version bumps is ambiguous

**File:**
- `src/modules/revenue-intelligence/hooks/useThemePublisher.ts:25-30`
- `mcp-poc/widgets/shared/hooks/useHostTokens.ts:43-48`

**Issue:** Both sides reject messages with `protocolVersion > PROTOCOL_VERSION` and warn. They accept messages with `protocolVersion < PROTOCOL_VERSION` silently (current `PROTOCOL_VERSION = 1` means this path is unreachable today). When v2 ships and a v2 host meets a v1 widget (or vice-versa), the v2 side needs an explicit downgrade policy — today the code would accept the older message without any log.

**Fix:** When `PROTOCOL_VERSION` is bumped to 2, add an explicit `else if (data.protocolVersion < PROTOCOL_VERSION)` branch that either (a) logs a debug line documenting the downgrade, or (b) applies a compatibility shim. No code change needed today; flag this as a TODO in the phase's deferred-items tracker.

### IN-04: Dev harness uses `innerHTML +=` for log rendering

**File:** `mcp-poc/widgets/daily-briefing/dev-host.html:51-55`
**Issue:** The log append does `log.innerHTML += \`<div class="log-entry">${now} — ${msg}</div>\``. All `msg` values are hard-coded strings from the harness script, so no untrusted input flows into the interpolation today. The pattern is still an anti-pattern — a future edit that interpolates `e.target.value` or `e.data.tokens` would immediately be an XSS sink.

**Fix:** Use DOM methods:
```javascript
const append = (msg) => {
  const now = new Date().toLocaleTimeString('de-DE')
  const entry = document.createElement('div')
  entry.className = 'log-entry'
  entry.textContent = `${now} — ${msg}`
  log.appendChild(entry)
  log.scrollTop = log.scrollHeight
}
```

### IN-05: `build-widgets.mjs` uses `shell: true` which is only needed on Windows

**File:** `mcp-poc/scripts/build-widgets.mjs:17-22`
**Issue:** `shell: true` tells Node to run the command through `cmd.exe` / `/bin/sh`. On POSIX this is unnecessary and slightly increases attack surface. The widget names come from `readdirSync` so there is no shell-injection risk today. Keeping it for Windows compatibility is fine — `shell: true` is required to resolve `.cmd` shims for `npx` on Windows.

**Fix:** Either document the reason (`// shell:true required on Windows for npx.cmd resolution`) or platform-gate: `shell: process.platform === 'win32'`. Low priority.

### IN-06: `revenue-today/App.tsx` does not pass `autoResize: false` — pre-existing v1 behavior, documented

**File:** `mcp-poc/widgets/revenue-today/src/App.tsx:40`
**Issue:** Unlike `daily-briefing/src/App.tsx` (which explicitly passes `{ autoResize: false }` as the third `App` constructor argument to suppress width reporting), `revenue-today/src/App.tsx` uses the default `new App({...}, {})`. This means AppRenderer may pin the revenue-today iframe to its intrinsic fit-content width in embedded hosts.

This is pre-existing v1 code carried over byte-identical per D-18-01 + `project_v1_widget_cleanup`. Phase 19 replaces both widgets with v2 block implementations, so this is out of Phase 18 scope.

**Fix:** None required for Phase 18. Phase 19 should standardize the `autoResize: false` pattern across both widgets.

---

## Verified Clean

The following points from the special-review-focus list were checked and passed:

- **Twin byte-identity (D-18-03):** `diff -u` between `PORTAL/src/shared/styles/widget-tokens.ts` and `mcp-poc/widgets/shared/widget-tokens.ts` shows exactly one line of drift — the `KEEP IN SYNC WITH` path sentence, which is expected per the pattern-map contract. Everything below the header is byte-identical. Same for the contract-test twins.
- **Contract-test strictness:** Both contract tests assert `expect(keys).toEqual([...FROZEN_KEYS].sort())` — a deep-equality comparison against a hard-coded frozen array, not a bare `.length === 12` check. Adding, removing, or renaming a key would be caught.
- **useMemo-stabilization rule (ADR-034 / feedback_react_hook_identity_churn):** `useThemePublisher` returns `useMemo(() => ({protocolVersion}), [])` (line 63). `useHostTokens` returns `useMemo(() => ({tokens, source, protocolVersion}), [tokens, source, protocolVersion])` (line 82). Both compliant.
- **sandbox-proxy `kmn/theme/*` relay:** Inserted BEFORE the AppBridge gate as specified (line 66-78). Uses source-identity gate for widget→host (needed because srcdoc has origin=null) and source+origin gate for host→widget. Matches the pattern-map exactly.
- **StrictMode double-fire defense:** `useHostTokens` uses `hostReplyReceivedRef` (line 26) and the message listener is symmetric across mounts. The cleanup function on line 75-78 correctly removes the listener and clears the timer.
- **Fixture-mode parser returns a narrow union:** `fixtures.ts` returns `'basket-aov' | 'one-block-failing' | null`, not arbitrary strings. No XSS path into the dev-host iframe via `?mock=` query param.
- **`handleOpenLink` URL validation:** `RevenueIntelligencePage.tsx:99-112` parses the URL via `new URL()`, rejects non-http/https protocols, and opens with `noopener,noreferrer`. Correct.
- **v1 widget migration (18-01):** `DailyBriefingApp.tsx` → `widgets/daily-briefing/src/App.tsx` and `widgets/src/App.tsx` → `widgets/revenue-today/src/App.tsx` were moved with only the import-path rename (`./DailyBriefingApp` → `./App`, `./daily-briefing.css` → `./styles.css`). The component logic is unchanged — pre-existing v1 behavior is out of Phase 18 scope per `project_v1_widget_cleanup`.
- **Bundle-size gate:** `check-widget-bundle-size.mjs` correctly reads all `.html` files from `dist/widgets/`, gzip-sizes them, and exits non-zero if any exceed 300 KB. Clean.
- **jsx-global.d.ts shim:** Correctly scoped as a TEMPORARY React 19 compatibility shim for the byte-frozen v1 widgets; the file header clearly flags the Phase 19 removal schedule.

---

_Reviewed: 2026-04-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
