Source: Context Hub (`playwright/playwright`, JS, version 1.58.2)
CDN path: https://cdn.aichub.org/v1/playwright/docs/playwright/javascript/DOC.md

Playwright JavaScript Package Guide

Golden Rule

Use the official `playwright` package for browser automation in JavaScript/Node.js, keep browser binaries aligned with the installed package version, prefer locator-based actions, and use a fresh browser context per test or workflow.

Important notes for this project:
- install browser binaries explicitly on fresh machines: `npx playwright install chromium`
- prefer locator-based actions over brittle selectors
- use isolated browser contexts where possible
- keep auth state artifacts and traces out of git
- `@playwright/test` is separate from `playwright`

Official sources:
- https://playwright.dev/docs/intro
- https://playwright.dev/docs/library
- https://playwright.dev/docs/locators
- https://playwright.dev/docs/auth
- https://playwright.dev/docs/network
- https://playwright.dev/docs/codegen
- https://playwright.dev/docs/browsers
