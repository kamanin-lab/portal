---
status: partial
phase: 18-mcp-ui-resource-build-pipeline
source: [18-05-PLAN.md, 18-05-SUMMARY.md]
started: 2026-04-24T17:05:00.000Z
updated: 2026-04-24T17:05:00.000Z
---

## Current Test

[awaiting human testing — run `cd G:/01_OPUS/Projects/mcp-poc && npm run dev:widget` to start]

## Tests

### 1. Harness loads and initial handshake appears
expected: Browser auto-opens http://localhost:5174/dev-host.html showing the "Design-Harness" label, Hell/Dunkel buttons, fixture dropdown, empty log box, and widget iframe. Within ~1s of iframe mount, handshake log shows "← kmn/theme/request vom Widget" followed by "→ kmn/theme/set (hell, Auto-Antwort)".
result: [pending]

### 2. Theme toggle visibly changes CSS variables (DevTools required)
expected: With DevTools open and inspecting the widget iframe's `<html>` element Computed styles — initial values are `--color-bg: #FAFAF9`, `--color-fg: #333333`, `--color-surface: #FFFFFF`. Clicking **Dunkel (Platzhalter)** updates those vars within 50ms to `#0B1220`, `#F1F5F9`, `#14192B`, and the log appends "→ kmn/theme/set (dunkel, manuell)". Clicking **Hell** reverts and logs "→ kmn/theme/set (hell, manuell)".
result: [pending]

### 3. Fixture dropdown reloads widget with URL param
expected: Selecting `?mock=basket-aov` reloads the widget iframe; DevTools Elements shows iframe `src` ending in `./index.html?mock=basket-aov`; log appends "↻ Widget neu geladen mit ?mock=basket-aov". Same works for `?mock=one-block-failing` and for `Basis-Fixture` (empty).
result: [pending]

### 4. Built widget opens standalone via file:// with default tokens (MCPAPP-TOKEN-05 fallback)
expected: Double-clicking `G:/01_OPUS/Projects/mcp-poc/dist/widgets/daily-briefing.html` (after a `npm run build:widgets`) opens it in the browser without a parent host. The widget uses DEFAULT_TOKEN_VALUES (light theme) and renders without errors. No postMessage from parent = no crash, just fallback token values.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
