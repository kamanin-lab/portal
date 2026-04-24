# Phase 17: kamanda-mcp Server Expansion — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-24
**Phase:** 17-kamanda-mcp-server-expansion
**Areas discussed:** Bridge client shape, Response validation, daily_briefing payload, Deprecated tool cleanup, Fan-out timeout safety, Deploy & env runbook

---

## Bridge Client Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Typed client w/ 5 methods | `createKmnBridgeClient()` exposes `runRate()`, `heatmap(args)`, `repeat(args)`, `marketBasket()`, `weeklyBriefing()`. Matches existing `createWooClient()` pattern. Single shared fetch+auth+error path, full IDE autocomplete in tool handlers. | ✓ |
| Generic `callAbility()` helper | Single low-level helper; every tool handler passes the hyphenated name as a string literal. Less code, harder to refactor safely. | |
| 5 standalone wrappers | One file per ability in `src/connectors/`. Max isolation, max boilerplate, hardest to share auth/error code. | |

**User's choice:** Typed client w/ 5 methods
**Notes:** Pattern-match against `src/connectors/woocommerce.ts`. Preview showed the exact `createKmnBridgeClient()` shape user accepted.

---

## Response Validation

| Option | Description | Selected |
|--------|-------------|----------|
| Zod schemas per ability | Each bridge method validates via Zod before returning. Catches contract drift immediately, gives typed inference for free. Zod already a dep (`^3.23.8`). | ✓ |
| TypeScript types only | Declare types, trust the contract. Smaller bundle, drift only surfaces when widget breaks. | |
| Minimal guard + TS types | Check envelope (`success===true`, data present) but skip field-by-field. | |

**User's choice:** Zod schemas per ability
**Notes:** Preview showed `HeatmapSchema` concrete example. User accepted runtime-safety tradeoff for bundle-size cost.

---

## `daily_briefing` Payload Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Fan-out 4 blocks + attention | `daily_briefing` fans out to 4 KMN abilities + `buildPaymentAttention()` via `Promise.allSettled`. One widget render = one tool call. Matches WIDG-BLOCK-05. | ✓ |
| Fan-out 4 blocks only | `daily_briefing` returns only the 4 blocks. Widget does a 2nd AppBridge `callTool('payment_attention_orders')`. Doubles round-trips, risks WIDG-QA-01 2s budget. | |
| Drop attention from v2 | Widget has 4 blocks only, no payment-attention sub-section. Violates WIDG-BLOCK-05. | |

**User's choice:** Fan-out 4 blocks + attention
**Notes:** Preview showed the exact `Promise.allSettled` structure with 5 parallel operations. `settled()` helper returns `{status:'ok', data}` or `{status:'error'}` per block.

---

## Deprecated Tool Cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Full removal | Delete `src/tools/incomplete-orders.ts` + its registration. Remove `stuck_orders` + `low_stock_products` stub registrations entirely. Matches Phase 17 deliverable #1. | ✓ |
| Remove from whitelist + hide registration | Drop whitelist + remove `server.registerTool()` calls, but keep source files on disk. Dead code. | |
| Minimum — proxy whitelist only | Just update `ALLOWED_TOOLS`; leave Node-side registrations intact. Tools still callable via non-portal MCP clients. | |

**User's choice:** Full removal
**Notes:** Preview showed before/after file shrinkage (~230 lines → ~140 lines in `mcp-server.ts`). Kept tools: `revenue_today`, `payment_attention_orders`.

---

## Fan-out Timeout Safety

| Option | Description | Selected |
|--------|-------------|----------|
| AbortController 5s per call | Each `kmn.*()` call wrapped in `AbortController` with 5s ceiling. WP's 2s DB timeout is inner ceiling; 5s HTTP timeout defends against network hangs. Matches existing `createWooClient()` pattern. | ✓ |
| No Node-side timeout, trust WP | Trust WP's 2s DB timeout. Risk: HTTP layer hang stalls `Promise.allSettled` indefinitely. | |
| Shorter 3s timeout | Tighter ceiling (2s WP + 1s margin). Risk: marginal DDEV cold-start probes exceed 3s. | |

**User's choice:** AbortController 5s per call
**Notes:** Preview showed concrete `BRIDGE_TIMEOUT_MS = 5_000` wrapping fetch. Isolation semantics verified — one timeout = one block error, other 3 blocks render normally (WIDG-QA-03).

---

## Deploy & Env Runbook — Env Var Rollout

| Option | Description | Selected |
|--------|-------------|----------|
| Document + you set them | Plan adds 3 vars to `.env.example` with inline comments + runbook section for Vercel dashboard paste. User executes manual env steps. | ✓ |
| Script + you run it | Write `deploy-env` helper using `vercel` CLI. User runs it once. More automation, risks auth prompts / secret leakage in shell history. | |
| Defer — local dev only in Phase 17 | Only wire `.env.local` + `.env.example`. Vercel deploy deferred to Phase 18/19. Risk: Phase 19 needs live staged daily_briefing v2. | |

**User's choice:** Document + you set them
**Notes:** Standard operator runbook approach. No auto-deploy — Yuri controls when Vercel env updates.

---

## Deploy & Env Runbook — KMN_BRIDGE_URL Scope

| Option | Description | Selected |
|--------|-------------|----------|
| DDEV only in Phase 17 | `KMN_BRIDGE_URL=https://summerfield.ddev.site/wp-json/mcp/kmn-revenue`. Production bridge URL deferred to MBM rollout. Matches v3.0 "Summerfield DDEV only" target. | ✓ |
| Parameterise per environment | Per-env overrides: DDEV for dev, staged URL for Vercel staging. Over-engineering — no non-DDEV deployment exists yet. | |

**User's choice:** DDEV only in Phase 17
**Notes:** Aligns with Milestone v3.0 out-of-scope list — MBM rollout is its own future milestone.

---

## Claude's Discretion

- **Error message copy** — German for user-visible, English for internal logs
- **Zod schema naming** — `HeatmapSchema`, `RunRateSchema`, etc. (standard convention)
- **Log format inside bridge client** — `[kmn-bridge]` prefix mirroring `[woo]`
- **File layout** — co-locate schemas with client (`kmn-bridge.ts` + `kmn-bridge-schemas.ts`) vs. inline in one file — Claude picks based on line count

## Deferred Ideas

- Widget HTML rebuild (4-block layout) — Phase 19
- Widget build pipeline (Vite + Tailwind + Motion) — Phase 18
- Monday briefing email Edge Function — Phase 20
- Rate-limit activation (60/min) — v3.1 per Phase 16-03 close
- Production bridge URL (non-DDEV) — future MBM rollout milestone
- Per-environment bridge-URL parameterisation
- Scripted `vercel env push` helper
