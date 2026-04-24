# Phase 17: kamanda-mcp Server Expansion — Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Expand the Node.js MCP server at `G:/01_OPUS/Projects/mcp-poc` to:

1. Expose 5 new MCP tools (`revenue_run_rate`, `weekly_heatmap`, `repeat_metrics`, `market_basket_or_aov`, `weekly_briefing_data`) that proxy the Phase 16 WP abilities via HTTP POST to `/wp-json/mcp/kmn-revenue`.
2. Refactor the existing `daily_briefing` tool to a resilient `Promise.allSettled` fan-out over the 4 analytics abilities + the existing `payment_attention_orders` data source.
3. Remove deprecated tools (`stuck_orders`, `low_stock_products`, `incomplete_orders`) from the Node registration surface.
4. Update the portal's `supabase/functions/mcp-proxy/index.ts` ALLOWED_TOOLS whitelist to match the new tool surface (PORT-01 lands here, coupled to the rename).

**Explicitly out of scope:** widget build pipeline (Phase 18), Revenue Intelligence v2 widget (Phase 19), Monday briefing email Edge Function (Phase 20). Production deployment of Revenue Intelligence v2 to MBM (future milestone).

</domain>

<decisions>
## Implementation Decisions

### Bridge Client

- **D-01:** Single typed client at `mcp-poc/src/connectors/kmn-bridge.ts` exposing 5 methods (`runRate()`, `heatmap(args)`, `repeat(args)`, `marketBasket()`, `weeklyBriefing()`) wrapping one shared `callAbility(name, args)` helper. Mirrors the existing `createWooClient()` pattern in `src/connectors/woocommerce.ts`.
- **D-02:** The 5 methods map Node-side underscored tool names (`revenue_run_rate` etc.) to the WP-side hyphenated ability names (`kmn-revenue-run-rate` etc.) inside the client — tool handlers never see the hyphenated form. Typo surface reduced to the client file only.
- **D-03:** Shared fetch + Basic Auth header construction + error-envelope unwrapping (`JSON.parse(result.content[0].text)` → `{ success, data, error, _meta }`) lives once inside `callAbility()`. On `success === false` the client throws a typed `KmnBridgeError` carrying `error` diagnostic.

### Response Validation

- **D-04:** Every bridge method validates its response against a Zod schema before returning. Zod is already a declared dependency (`zod ^3.23.8`). Schemas live alongside the client in `mcp-poc/src/connectors/kmn-bridge-schemas.ts`.
- **D-05:** Each schema mirrors the WP ability's documented output shape (RESEARCH §seeded_data_facts + 16-03-SUMMARY handoff). Schema parse failure throws `ZodError` — in `daily_briefing` fan-out this becomes `{ status: 'error', message: 'bridge schema drift' }` for that block only.
- **D-06:** Zod inferred types (`z.infer<typeof HeatmapSchema>`) are the single source of truth for the bridge response types — no hand-maintained TS types that could drift from the schema.

### `daily_briefing` Payload Shape

- **D-07:** `daily_briefing` handler fans out 5 parallel operations via `Promise.allSettled`: the 4 KMN bridge abilities (`runRate`, `heatmap({weeks:8})`, `repeat({days:90})`, `marketBasket()`) + the existing `buildPaymentAttention(wooClient)`. The WooCommerce REST v3 attention path is retained because `payment_attention_orders` already works and is cited by WIDG-BLOCK-05.
- **D-08:** Response shape:
  ```ts
  {
    blocks: {
      run_rate: { status: 'ok', data: RunRateData } | { status: 'error', message: string },
      heatmap:  { status: 'ok', data: HeatmapData } | { status: 'error', message: string },
      repeat:   { status: 'ok', data: RepeatData } | { status: 'error', message: string },
      basket:   { status: 'ok', data: BasketData } | { status: 'error', message: string },
    },
    attention: { status: 'ok', data: PaymentAttentionPayload } | { status: 'error', message: string },
  }
  ```
  The widget can render 4 block-level skeletons + an attention-sub-section skeleton independently (WIDG-QA-03 contract).
- **D-09:** `daily_briefing` continues to include `_meta: { "openai/outputTemplate": "ui://widgets/daily-briefing.html" }` (MCPS-04). The underlying widget HTML is Phase 19's scope — Phase 17 only guarantees the tool-level contract.
- **D-10:** `summarizeBriefing()` (the text fallback in v1) is rewritten to summarise the 4 blocks + attention. Text content must be in German (WIDG-QA-04).

### Deprecated Tool Cleanup

- **D-11:** Delete `mcp-poc/src/tools/incomplete-orders.ts` (the source file).
- **D-12:** Remove the three `server.registerTool()` blocks in `mcp-poc/src/mcp-server.ts` for: `incomplete_orders`, `stuck_orders` (deprecation stub), `low_stock_products` (stub). Remove associated imports.
- **D-13:** Keep `revenue_today` and `payment_attention_orders` as standalone ad-hoc MCP tools (MCPS-05). They continue hitting WC REST v3 via `createWooClient()` — no change to those handlers.
- **D-14:** After cleanup, the Node server's `tools/list` returns exactly: `daily_briefing`, `revenue_today`, `payment_attention_orders`, `revenue_run_rate`, `weekly_heatmap`, `repeat_metrics`, `market_basket_or_aov`, `weekly_briefing_data` (8 total).

### Fan-out Timeout Safety

- **D-15:** Bridge `callAbility()` wraps every fetch in an `AbortController` with `BRIDGE_TIMEOUT_MS = 5_000`. On abort the method throws a `KmnBridgeError` with `code: 'timeout'`. In `daily_briefing` fan-out the timeout is isolated to one block via `Promise.allSettled` — other blocks still render.
- **D-16:** WP's 2s DB timeout (Phase 16 `kmn_revenue_set_query_timeout_ms(2000)`) remains the inner ceiling. 5s Node timeout is the outer net for network-level hangs (cold-start, DNS, container pause).
- **D-17:** WIDG-QA-01 target latency (2s end-to-end) applies to the **healthy** path only. Under timeout the widget shows per-block skeleton — still a healthy UI outcome, just not within 2s.

### Deploy & Env Runbook

- **D-18:** Three new env vars added to `mcp-poc/.env.example` with inline comments:
  - `WOOCOMMERCE_WP_USER` — WP username for the MCP service account (e.g. `dev-admin` on DDEV)
  - `WOOCOMMERCE_WP_APP_PASS` — WP Application Password generated via `wp-admin → Users → Application Passwords`
  - `KMN_BRIDGE_URL` — full URL to `{STORE}/wp-json/mcp/kmn-revenue` (e.g. `https://summerfield.ddev.site/wp-json/mcp/kmn-revenue`)
- **D-19:** Per MCPS-07 these names are **distinct** from the pre-existing `WP_MCP_USER` / `WP_MCP_APP_PASS` used by portal's `supabase/functions/_shared/wp-audit.ts`. No credential coupling.
- **D-20:** `KMN_BRIDGE_URL` in Phase 17 points at Summerfield DDEV only (`https://summerfield.ddev.site/wp-json/mcp/kmn-revenue`). Non-DDEV bridge URL deferred to future MBM rollout milestone.
- **D-21:** Plan SUMMARY ships with a runbook section covering: (a) `.env.local` paste for local dev, (b) Vercel project → Settings → Environment Variables paste for the mcp-poc deployment. Yuri executes the Vercel env step manually when ready to deploy (not scripted — avoids CLI auth/secret-leak surface).
- **D-22:** `mcp-poc/.gitignore` keeps `.env.local` excluded (already configured). `NODE_EXTRA_CA_CERTS` for mkcert trust is a dev-only concern already documented in Phase 15.

### Portal Proxy Whitelist (PORT-01)

- **D-23:** `supabase/functions/mcp-proxy/index.ts` `ALLOWED_TOOLS` (lines 141-146) becomes exactly:
  ```ts
  new Set([
    "daily_briefing",
    "revenue_today",
    "payment_attention_orders",
    "revenue_run_rate",
    "weekly_heatmap",
    "repeat_metrics",
    "market_basket_or_aov",
    "weekly_briefing_data",
  ])
  ```
  `incomplete_orders` is removed.
- **D-24:** Deploy the updated mcp-proxy to staging Cloud Supabase via existing CI path (`.github/workflows/deploy-edge-functions-staging.yml`, triggered by push to `staging` branch). Prod deploy is manual scp (see memory `project_edge_functions_deploy` + `reference_coolify_ef_deploy`) but is out-of-scope for Phase 17 since v3.0 targets staging only.

### Claude's Discretion

- **Error message copy** — user-visible text stays German (WIDG-QA-04), but internal error diagnostics (for logs) stay English.
- **Schema naming** — `HeatmapSchema`, `RunRateSchema` etc. (Zod convention).
- **Log format inside the bridge client** — `[kmn-bridge]` prefix + HTTP status + elapsed-ms, mirroring the existing `[woo]` logs in `woocommerce.ts`.
- **File layout choice** — co-locate schemas with the client (`kmn-bridge.ts` + `kmn-bridge-schemas.ts` side-by-side) vs. inline in one file — Claude picks based on line count.

### Folded Todos

None.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §MCPS-* + §PORT-* — the exact REQ-IDs Phase 17 satisfies
- `.planning/ROADMAP.md` Phase 17 section — 5 deliverable acceptance tests
- `.planning/PROJECT.md` — Milestone v3.0 goals + non-negotiables

### Upstream Phase Artifacts
- `.planning/phases/16-kmn-revenue-abilities-wp-plugin/16-03-SUMMARY.md` §"Handoff to Phase 17" — tool-name mapping (hyphenated WP ↔ underscored Node), response envelope contract, combined briefing payload shape, fail-fast semantics that Node layer must compensate for with `Promise.allSettled`
- `.planning/phases/16-kmn-revenue-abilities-wp-plugin/16-RESEARCH.md` §seeded_data_facts — expected response shapes + value ranges for Zod schema construction
- `.planning/phases/15-local-dev-synthetic-seeder/` — DDEV access credentials + app-password generation + seeded-data baseline

### Architecture & Design Docs
- `docs/ideas/REVENUE_INTELLIGENCE_V2_PLAN.md` §5 (tool surface) + §6 (widget strategy) + §7 (data sufficiency) + §8 (Day 2 — MCP server tools)
- `docs/ideas/WP_BRIDGE_ARCHITECTURE.md` §4 (ability JSON Schemas) + §9 (App Password rotation + rate limit context)
- `docs/ideas/MCP_UI_RESOURCE_BUILD_PIPELINE.md` — referenced for context on how Phase 18/19 consume `daily_briefing`'s v2 shape

### Existing mcp-poc Code to Pattern-Match
- `G:/01_OPUS/Projects/mcp-poc/src/mcp-server.ts` — file to refactor; v1 `daily_briefing` handler at lines 45-76 is the concrete refactor target
- `G:/01_OPUS/Projects/mcp-poc/src/connectors/woocommerce.ts` — template for the new `kmn-bridge.ts` client (timeout pattern, error class, env loader)
- `G:/01_OPUS/Projects/mcp-poc/src/tools/revenue-today.ts` + `payment-attention.ts` — template for the 5 new tool builders
- `G:/01_OPUS/Projects/mcp-poc/src/tools/incomplete-orders.ts` — file to delete
- `G:/01_OPUS/Projects/mcp-poc/.env.example` — file to update with 3 new vars
- `G:/01_OPUS/Projects/mcp-poc/vercel.json` — deployment config (no change expected, but referenced for env-var runbook)

### Portal Code to Pattern-Match
- `supabase/functions/mcp-proxy/index.ts` lines 141-146 — exact ALLOWED_TOOLS Set to edit
- `supabase/functions/mcp-proxy/index.ts` lines 130-170 — whitelist-check pattern surrounding the edit

### Auth & Deployment Docs
- `docs/DECISIONS.md` — Application Password rotation runbook (added in Phase 16)
- `.github/workflows/deploy-edge-functions-staging.yml` — CI path for portal Edge Function deploy to staging on push to `staging` branch

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`createWooClient()` in `mcp-poc/src/connectors/woocommerce.ts`** — blueprint for the new `createKmnBridgeClient()`: env loader, shared `request()` closure, `WooApiError` class, `AbortController` timeout pattern at line 123-124, redacted logging. Copy the shape, swap WC REST v3 for MCP JSON-RPC POST to `/wp-json/mcp/kmn-revenue`.
- **`buildRevenueToday()` / `buildPaymentAttention()` in `mcp-poc/src/tools/*.ts`** — template for the 5 new tool builders. Each is a pure function that takes a client, hits one data source, returns a typed payload. The 5 new tool builders will take a `KmnBridgeClient` instead of a `WooClient`.
- **`registerAppTool()` helper from `@modelcontextprotocol/ext-apps/server`** — already used for `daily_briefing`, exposes `_meta.ui.resourceUri`. Keep as-is for the refactored `daily_briefing`; use plain `server.registerTool()` for the 5 new ad-hoc tools (they return JSON, no widget).
- **`widgets.dailyBriefing()` from `mcp-poc/src/widget-bundle.ts`** — loads `dist/widgets/daily-briefing.html`. Phase 17 doesn't touch this; it's Phase 18/19's concern. Tool-level `daily_briefing` can keep pointing at `ui://widgets/daily-briefing.html`.
- **Zod (`zod ^3.23.8`)** — already a dependency (see `mcp-poc/package.json`). Used in the `stuck_orders` stub at `mcp-server.ts:146-152`. Free to use extensively in the new client.
- **Portal proxy pattern at `supabase/functions/mcp-proxy/index.ts` lines 141-156** — `Set`-based whitelist check. Trivial string-set edit.

### Established Patterns

- **Env loader pattern** — `loadCredentialsFromEnv()` in `woocommerce.ts:90-100` throws on missing env with a specific message naming each var. Copy this for `loadKmnBridgeCredentialsFromEnv()`.
- **Error class pattern** — `WooApiError extends Error` with `status` + `endpoint` fields. Create `KmnBridgeError extends Error` with `code` (`'timeout' | 'http' | 'envelope' | 'schema'`) + `endpoint`.
- **Timeout pattern** — `DEFAULT_TIMEOUT_MS = 10_000`, `AbortController`, `clearTimeout` in `finally`. Already exactly what D-15 needs — just use 5_000.
- **MCP tool return contract** — `{ content: [{ type: 'text', text: ... }], structuredContent: {...}, isError?: true }`. All 5 new tools must return this shape; `daily_briefing` fan-out returns it too.
- **Response envelope unwrap** — MCP Adapter wraps the WP `kmn_revenue_response()` as `JSON.parse(result.content[0].text)` → `{ success, data, error, _meta }` per 16-03-SUMMARY handoff. This unwrap is centralised in `callAbility()`.

### Integration Points

- **Portal → mcp-poc:** `supabase/functions/mcp-proxy/index.ts` POSTs JSON-RPC to `MCP_SERVER_URL` env var. URL unchanged in Phase 17 (same Vercel deployment gets new tools).
- **mcp-poc → WP:** new bridge client POSTs JSON-RPC to `KMN_BRIDGE_URL` with HTTP Basic Auth header. WP Adapter parses, routes to `wp_get_ability('kmn/...')`, returns `CallToolResult` with text-wrapped JSON.
- **mcp-poc → WooCommerce REST v3:** existing path unchanged (`createWooClient()` → `/wp-json/wc/v3/*`). Used by `revenue_today`, `payment_attention_orders`, and `daily_briefing`'s attention sub-call.
- **mcp-poc build + deploy:** `npm run build` (widgets + server) → `vercel.json` rewrites `/mcp` → `/api/mcp.ts`. Vercel auto-deploys on push to the mcp-poc repo's default branch.

### Non-Obvious Constraints

- **Tool-name surface is split**: Node-side uses underscores (`revenue_run_rate`), WP-side uses hyphens (`kmn-revenue-run-rate`). This is locked by upstream — don't try to "unify" them. See memory `feedback_upstream_api_probe` for why probing the API before building is the rule here.
- **Hook identity churn**: not directly relevant to Phase 17 (this is Node server code, not React), but the planner should note it for Phase 19 widget work. See memory `feedback_react_hook_identity_churn`.
- **Response-envelope double-unwrap risk**: the WP Adapter wraps `kmn_revenue_response()` in `CallToolResult.content[0].text` as a JSON string. Forgetting the `JSON.parse` means you get a string where you expect an object. Unit test every bridge method against a recorded fixture.
- **Zero TS diff assertion (PORT-04)**: this is a Phase 19 deliverable, not Phase 17. But Phase 17 must not preemptively rename tool IDs, URIs, or any symbol `RevenueIntelligencePage.tsx` imports — the widget URI `ui://widgets/daily-briefing.html` is load-bearing.

</code_context>

<specifics>
## Specific Ideas

- **Follow the `createWooClient()` pattern literally** for the new bridge client — it's already been through production + review, handles redaction + timeouts + errors cleanly. Do not reinvent.
- **Zod schemas encode the Phase 16 seeded-data expectations** where they constrain the range (e.g. `day_of_week: z.number().int().min(1).max(7)`, `hour_of_day: z.number().int().min(0).max(23)`). This turns "contract drift" into "schema violation" with a precise error.
- **`daily_briefing` keeps its `_meta.ui.resourceUri`** exactly as-is (`ui://widgets/daily-briefing.html`) so Phase 19's widget swap is truly a drop-in.
- **Log format** — `[kmn-bridge] 200 kmn-weekly-heatmap 234ms` at info level, mirroring `[woo] 200 /orders?... 1204ms` from `woocommerce.ts:135`.
- **User-visible German strings** stay German even in summary text (WIDG-QA-04): the v2 `summarizeBriefing()` replacement should say "Tages-Hochrechnung: …", "Zahlungsaufmerksamkeit: …", etc.

</specifics>

<deferred>
## Deferred Ideas

### Out of scope for Phase 17
- **Widget HTML rebuild (4-block layout)** — Phase 19. Phase 17 only ensures `daily_briefing` *returns* the right shape; the widget *reading* that shape is Phase 19.
- **Widget build pipeline (Vite + Tailwind + Motion)** — Phase 18.
- **Monday briefing email Edge Function** — Phase 20.
- **Rate-limit activation (60/min)** — explicitly deferred to v3.1 per Phase 16-03 close. Stub exists at `wordpress-plugins/kmn-revenue-abilities/includes/rate-limit.php`.
- **Production bridge URL** (non-DDEV `KMN_BRIDGE_URL`) — deferred to future MBM rollout milestone.
- **Per-environment bridge-URL parameterisation** — considered and deferred. Only DDEV exists for v3.0.
- **Scripted `vercel env push` helper** — considered and deferred. Manual Vercel dashboard paste is safer for secrets.

### Reviewed Todos (not folded)

None — no pending todos matched the Phase 17 scope.

</deferred>

---

*Phase: 17-kamanda-mcp-server-expansion*
*Context gathered: 2026-04-24*
