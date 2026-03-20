# Browser Testing Setup

## Purpose

This project now has a project-local Playwright MCP setup for real browser-based verification.

## MCP server
Configured via `mcporter` as project-local server:
- server name: `playwright`
- config file: `config/mcporter.json`

Current command:
- `npx -y @playwright/mcp --headless --isolated --output-dir G:\\01_OPUS\\Projects\\PORTAL_staging\\.playwright-mcp`

## Browser binaries
Chromium browser binaries have been installed locally for Playwright.

## How to inspect available tools
From the project root:

```bash
mcporter list playwright --schema
```

## Typical use
Use Playwright MCP for:
- visual verification of portal flows
- real browser interaction checks
- screenshots and snapshots
- validating that the product actually behaves as expected, not just that tests/build pass

## Documentation rule
Before writing browser automation or Playwright code, consult:
- `docs/reference/context-hub/playwright.md`
- official Playwright docs

## Important note
Context Hub remains the preferred curated doc source where available.
On this Windows setup, `chub search` works, but `chub get` currently appears unreliable, so some local references were imported via direct Context Hub CDN paths.
