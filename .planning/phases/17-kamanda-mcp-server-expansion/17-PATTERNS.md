# Phase 17: kamanda-mcp Server Expansion — Pattern Map

**Mapped:** 2026-04-24
**Files analyzed:** 11 (8 new, 2 modified in mcp-poc + 1 modified in PORTAL, 1 deleted)
**Analogs found:** 11 / 11 (100% — CONTEXT.md explicitly cites analogs for every file)

## Scope Split Across Two Repos

| Repo | Path root | Files touched |
|------|-----------|---------------|
| **mcp-poc** (Node MCP server) | `G:/01_OPUS/Projects/mcp-poc/` | 10 (connector + schemas + 5 tool builders + mcp-server.ts + .env.example + deleted file) |
| **PORTAL** (Supabase EF) | `G:/01_OPUS/Projects/PORTAL/` | 1 (`supabase/functions/mcp-proxy/index.ts`, 6-line whitelist diff) |

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `mcp-poc/src/connectors/kmn-bridge.ts` | connector | request-response (HTTP-POST JSON-RPC + Basic Auth) | `mcp-poc/src/connectors/woocommerce.ts` | exact (role + flow; swap REST v3 GET → MCP JSON-RPC POST) |
| `mcp-poc/src/connectors/kmn-bridge-schemas.ts` | schema | transform (Zod validation) | inline Zod usage in `mcp-poc/src/mcp-server.ts:146-152` (stuck-orders stub) | role-match (Zod already in use in the repo, same `zod ^3.23.8` dep) |
| `mcp-poc/src/tools/revenue-run-rate.ts` | tool-builder | request-response | `mcp-poc/src/tools/revenue-today.ts` (prefer) + `payment-attention.ts` | exact |
| `mcp-poc/src/tools/weekly-heatmap.ts` | tool-builder | request-response | `mcp-poc/src/tools/revenue-today.ts` | exact |
| `mcp-poc/src/tools/repeat-metrics.ts` | tool-builder | request-response | `mcp-poc/src/tools/revenue-today.ts` | exact |
| `mcp-poc/src/tools/market-basket-or-aov.ts` | tool-builder | request-response | `mcp-poc/src/tools/revenue-today.ts` | exact |
| `mcp-poc/src/tools/weekly-briefing-data.ts` | tool-builder | request-response | `mcp-poc/src/tools/revenue-today.ts` | exact |
| `mcp-poc/src/mcp-server.ts` | server-wiring | event-driven (MCP tool registry) | self — in-place refactor of lines 44-76 (`daily_briefing`) + 79-137 + 140-182 | self (modify existing patterns) |
| `mcp-poc/.env.example` | config | — | self — append 3 new vars below line 16 | self |
| `supabase/functions/mcp-proxy/index.ts` | proxy-whitelist | request-response (gate) | self — in-place edit of lines 141-146 | self |
| `mcp-poc/src/tools/incomplete-orders.ts` | deleted-file | — | — (outright delete) | — |

---

## Pattern Assignments

### 1. `mcp-poc/src/connectors/kmn-bridge.ts` (NEW, connector, request-response)

**Analog:** `mcp-poc/src/connectors/woocommerce.ts` (full file — `createWooClient` factory pattern)

**Credentials type + error class pattern** (analog lines 11-15, 79-88):

```typescript
// ANALOG — woocommerce.ts:11-15
export type WooCredentials = {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
};

// ANALOG — woocommerce.ts:79-88
export class WooApiError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly endpoint: string,
  ) {
    super(message);
    this.name = "WooApiError";
  }
}
```

**Copy, swap:**
- `WooCredentials` → `KmnBridgeCredentials = { bridgeUrl, wpUser, appPass }`
- `WooApiError` → `KmnBridgeError` with `readonly code: 'timeout' | 'http' | 'envelope' | 'schema'` **in addition to** `endpoint` (per D-03, D-15). `status` field optional — bridge errors are higher-level than HTTP status.

**Env loader pattern** (analog lines 90-100):

```typescript
// ANALOG — woocommerce.ts:90-100
export function loadCredentialsFromEnv(): WooCredentials {
  const storeUrl = process.env.WOOCOMMERCE_STORE_URL;
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;
  if (!storeUrl || !consumerKey || !consumerSecret) {
    throw new Error(
      "WooCommerce credentials missing. Set WOOCOMMERCE_STORE_URL, WOOCOMMERCE_CONSUMER_KEY, WOOCOMMERCE_CONSUMER_SECRET.",
    );
  }
  return { storeUrl: storeUrl.replace(/\/+$/, ""), consumerKey, consumerSecret };
}
```

**Copy, swap:**
- Function name → `loadKmnBridgeCredentialsFromEnv()`
- Env vars → `KMN_BRIDGE_URL`, `WOOCOMMERCE_WP_USER`, `WOOCOMMERCE_WP_APP_PASS` (per D-18, D-19)
- Error message names all 3 vars (keep this for good DX)
- Trailing-slash strip on bridgeUrl too

**Factory function + AbortController timeout** (analog lines 102-163 — THE core pattern):

```typescript
// ANALOG — woocommerce.ts:102-163 (condensed)
export function createWooClient(creds: WooCredentials = loadCredentialsFromEnv()) {
  const base = `${creds.storeUrl}/wp-json/wc/v3`;
  const authHeader = isHttps
    ? `Basic ${Buffer.from(`${creds.consumerKey}:${creds.consumerSecret}`).toString("base64")}`
    : undefined;

  async function request<T>(path: string, params: Record<...> = {}): Promise<...> {
    const url = new URL(`${base}${path}`);
    // ...
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);  // ← 10_000
    const started = Date.now();
    const safeUrl = redactCredentials(url.toString());

    try {
      const headers: Record<string, string> = { accept: "application/json" };
      if (authHeader) headers.authorization = authHeader;

      const res = await fetch(url.toString(), { headers, signal: ctrl.signal });
      const elapsed = Date.now() - started;
      console.log(`[woo] ${res.status} ${path}${qs} ${elapsed}ms`);  // ← log format

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new WooApiError(
          `WooCommerce ${res.status} at ${path}: ${body.slice(0, 200)}`,
          res.status,
          safeUrl,
        );
      }

      const data = (await res.json()) as T;
      return { data, headers: res.headers };
    } catch (err) {
      if (err instanceof WooApiError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new WooApiError(
          `WooCommerce request timed out after ${DEFAULT_TIMEOUT_MS}ms at ${path}`,
          undefined,
          safeUrl,
        );
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new WooApiError(`WooCommerce request failed: ${msg}`, undefined, safeUrl);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async fetchOrders(params: {...}): Promise<WooOrder[]> { ... },
    async fetchProducts(params: {...}): Promise<WooProduct[]> { ... },
    async getStoreInfo(): Promise<WooSystemStatus> { ... },
  };
}

export type WooClient = ReturnType<typeof createWooClient>;
```

**Copy, swap** (produces `createKmnBridgeClient` per D-01, D-02, D-15):

| From (`woocommerce.ts`) | To (`kmn-bridge.ts`) |
|-------------------------|----------------------|
| `DEFAULT_TIMEOUT_MS = 10_000` | `BRIDGE_TIMEOUT_MS = 5_000` (per D-15) |
| `base = ${creds.storeUrl}/wp-json/wc/v3` | `base = creds.bridgeUrl` (already full URL per D-18) |
| `Basic ${btoa(consumerKey:consumerSecret)}` | `Basic ${btoa(wpUser:appPass)}` (always HTTPS, no fallback branch — DDEV has cert) |
| `fetch(url, { headers, signal })` with GET | `fetch(bridgeUrl, { method: 'POST', headers: { ...auth, 'content-type': 'application/json', accept: 'application/json,text/event-stream' }, body: JSON.stringify(rpcEnvelope), signal })` |
| `console.log('[woo] ${res.status} ${path}${qs} ${elapsed}ms')` | `console.log('[kmn-bridge] ${res.status} ${abilityName} ${elapsed}ms')` (per D's "Claude's Discretion" §Log format) |
| `throw new WooApiError(..., res.status, safeUrl)` | `throw new KmnBridgeError(..., 'http', safeUrl)` |
| AbortError branch → `WooApiError` | AbortError branch → `KmnBridgeError('...timed out after 5000ms...', 'timeout', safeUrl)` |
| Return object: `{ fetchOrders, fetchProducts, getStoreInfo }` | Return object: `{ runRate(), heatmap({weeks}), repeat({days}), marketBasket(), weeklyBriefing() }` — 5 methods (D-01) |

**Shared `callAbility()` helper** (D-03 — lives inside `createKmnBridgeClient`, NOT exported). Skeleton:

```typescript
async function callAbility<T>(abilityName: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  // Build JSON-RPC envelope: { jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call", params: { name: abilityName, arguments: args } }
  // POST with timeout+abort per woocommerce.ts pattern
  // Log: [kmn-bridge] 200 kmn-weekly-heatmap 234ms
  // On 4xx/5xx → throw KmnBridgeError(code: 'http', ...)
  // On abort → throw KmnBridgeError(code: 'timeout', ...)
  // Parse JSON-RPC response → extract result.content[0].text → JSON.parse → { success, data, error, _meta }
  // If success === false → throw KmnBridgeError(code: 'envelope', ...) carrying error.message
  // Validate data against schema → throw KmnBridgeError(code: 'schema', ...) on ZodError
  // Return data
}
```

Tool name mapping table (inside `kmn-bridge.ts`, per D-02):

```typescript
// Node-side underscored → WP-side hyphenated. Typo surface lives here ONLY.
// Handlers never see hyphens.
// (This mapping is used literally by the 5 methods below.)
```

| Method | Ability name sent to bridge |
|--------|----------------------------|
| `runRate()` | `kmn-revenue-run-rate` |
| `heatmap({ weeks })` | `kmn-weekly-heatmap` |
| `repeat({ days })` | `kmn-repeat-metrics` |
| `marketBasket()` | `kmn-market-basket` |
| `weeklyBriefing()` | `kmn-weekly-briefing-data` |

**Redaction helper** (analog lines 213-215): copy `redactCredentials()` but adapt — bridge URL doesn't carry secrets in the URL, so `safeUrl` is just the bridge URL itself. Keep the function shape for consistency.

---

### 2. `mcp-poc/src/connectors/kmn-bridge-schemas.ts` (NEW, schema, transform)

**Analog:** inline Zod usage in `mcp-poc/src/mcp-server.ts:146-152` (stuck-orders stub — the only existing Zod in repo):

```typescript
// ANALOG — mcp-server.ts:146-152 (inputSchema pattern; shows Zod is wired)
inputSchema: {
  thresholdDays: z
    .number()
    .int()
    .min(1)
    .max(30)
    .default(3)
    .describe("Days in processing to consider stuck"),
},
```

**This is an inputSchema shape, not a response schema.** The new file needs **response schemas** — no existing analog in the repo, but the `specifics` section of CONTEXT.md gives the exact range constraints (D-04, D-05, §specifics).

**Pattern for each schema** (Claude constructs, using Phase 16 seeded-data facts from RESEARCH):

```typescript
import { z } from "zod";

// Heatmap — 7×24 grid + best_slot (per 16-03-SUMMARY handoff + RESEARCH §seeded_data_facts)
export const HeatmapSchema = z.object({
  best_slot: z.object({
    day_of_week: z.number().int().min(1).max(7),
    hour_of_day: z.number().int().min(0).max(23),
    order_count: z.number().int().min(0),
  }),
  buckets: z.array(z.object({
    day_of_week: z.number().int().min(1).max(7),
    hour_of_day: z.number().int().min(0).max(23),
    order_count: z.number().int().min(0),
  })).min(1),
  weeks_analyzed: z.number().int().min(1).optional(),
});
export type HeatmapData = z.infer<typeof HeatmapSchema>;   // ← D-06: schema is source of truth
```

**One schema per ability, 5 total:** `RunRateSchema`, `HeatmapSchema`, `RepeatSchema`, `BasketSchema`, `WeeklyBriefingSchema`. Each exports `z.infer`-derived type.

**Range constraints from §specifics:**
- `day_of_week: z.number().int().min(1).max(7)`
- `hour_of_day: z.number().int().min(0).max(23)`
- `repeat_rate_pct`: non-negative number
- `confidence: z.enum(["high", "medium", "low"])` (per 16-03-SUMMARY verify-wp-bridge.sh assertions)
- `expected_by_hour: z.array(...).length(24)`
- `basket_pairs: z.array(...).min(3)` (seeded baseline)
- `aov_bands: z.array(...).length(3)`
- `top_products_3: z.array(z.object({product_id, name, qty_sold})).length(3)`

**Combined briefing schema** — see 16-03-SUMMARY "Handoff to Phase 17" §Combined briefing payload shape for the exact 4-section structure (`last_week_summary`, `best_slot`, `repeat_metrics`, `top_products_3`, `calculated_at`).

**File layout** (per §"Claude's Discretion"): co-locate `kmn-bridge.ts` + `kmn-bridge-schemas.ts` side-by-side in `src/connectors/`. `kmn-bridge.ts` imports the schemas; nothing else imports from `kmn-bridge-schemas.ts` (types leak via `kmn-bridge.ts` re-exports).

---

### 3. `mcp-poc/src/tools/revenue-run-rate.ts` (NEW, tool-builder, request-response)

**Analog:** `mcp-poc/src/tools/revenue-today.ts` (prefer — most similar: pure function, takes client, returns typed payload).

**Imports + payload type pattern** (analog lines 1, 32-43):

```typescript
// ANALOG — revenue-today.ts:1
import type { WooClient, WooOrder, WooSystemStatus } from "../connectors/woocommerce.js";

// ANALOG — revenue-today.ts:32-43
export type RevenueTodayPayload = {
  storeUrl: string;
  // ... fields
  generated_at: string;
};
```

**Copy, swap:**
- Import source → `import type { KmnBridgeClient, RunRateData } from "../connectors/kmn-bridge.js"`
- `RevenueTodayPayload` type → re-export the Zod-inferred `RunRateData` directly; no hand-maintained field list (per D-06)

**Builder function pattern** (analog lines 51-94):

```typescript
// ANALOG — revenue-today.ts:51-94 (shape only)
export async function buildRevenueToday(
  client: WooClient,
  now: Date = new Date(),
): Promise<RevenueTodayPayload> {
  const storeInfo = await safeGetStoreInfo(client);
  // ... transforms, Promise.all fetches
  return {
    storeUrl,
    // ... computed fields
    generated_at: new Date().toISOString(),
  };
}
```

**Copy, swap for run-rate (and the other 4):**

```typescript
export async function buildRevenueRunRate(
  client: KmnBridgeClient,
): Promise<RunRateData> {
  return client.runRate();  // client already validates via Zod + unwraps envelope
}
```

Tool builders become one-liners because the bridge client owns the heavy lifting (unwrap + validate). The `revenue-today.ts` analog is heavy because it does in-JS aggregation from raw Woo orders; bridge tools just proxy already-computed payloads.

**Per-file mapping:**

| New file | Bridge method | Input args | Return type |
|----------|---------------|------------|-------------|
| `revenue-run-rate.ts` | `client.runRate()` | none | `RunRateData` |
| `weekly-heatmap.ts` | `client.heatmap({ weeks })` | `{ weeks: number }` (defaults to 8) | `HeatmapData` |
| `repeat-metrics.ts` | `client.repeat({ days })` | `{ days: number }` (defaults to 90) | `RepeatData` |
| `market-basket-or-aov.ts` | `client.marketBasket()` | none | `BasketData` |
| `weekly-briefing-data.ts` | `client.weeklyBriefing()` | none | `WeeklyBriefingData` |

---

### 4-7. `mcp-poc/src/tools/weekly-heatmap.ts`, `repeat-metrics.ts`, `market-basket-or-aov.ts`, `weekly-briefing-data.ts` (NEW)

**Analog:** same as run-rate (`revenue-today.ts`). Same pattern — different bridge method + input args. See table above.

---

### 8. `mcp-poc/src/mcp-server.ts` (MODIFIED, server-wiring)

**Analog:** self — in-place refactor.

#### 8a. `daily_briefing` refactor (lines 44-76)

**Current v1 handler** (lines 44-76):

```typescript
// EXISTING — to be replaced
registerAppTool(
  server,
  "daily_briefing",
  {
    description: "Open the store-owner daily briefing dashboard for Nadine. ...",
    inputSchema: {},
    _meta: { ui: { resourceUri: DAILY_BRIEFING_URI } },  // ← KEEP per D-09
  },
  async () => {
    try {
      const client = createWooClient();
      const [revenue, attention, incomplete] = await Promise.all([     // ← REPLACE Promise.all
        buildRevenueToday(client),
        buildPaymentAttention(client),
        buildIncompleteOrders(client),
      ]);
      const payload = { revenue, attention, incomplete };              // ← REPLACE payload shape
      return {
        content: [{ type: "text", text: summarizeBriefing(payload) }],
        structuredContent: payload,
      };
    } catch (err) {                                                    // ← REPLACE: no outer try/catch needed, Promise.allSettled never throws
      // ...
    }
  },
);
```

**Target v2 shape (per D-07, D-08):**

```typescript
// Replace the async handler body with:
async () => {
  const wooClient = createWooClient();
  const bridgeClient = createKmnBridgeClient();

  const [runRate, heatmap, repeat, basket, attention] = await Promise.allSettled([
    bridgeClient.runRate(),
    bridgeClient.heatmap({ weeks: 8 }),
    bridgeClient.repeat({ days: 90 }),
    bridgeClient.marketBasket(),
    buildPaymentAttention(wooClient),   // ← retained per D-07 (WC REST v3 path)
  ]);

  const payload = {
    blocks: {
      run_rate: toBlock(runRate),
      heatmap:  toBlock(heatmap),
      repeat:   toBlock(repeat),
      basket:   toBlock(basket),
    },
    attention: toBlock(attention),
  };

  return {
    content: [{ type: "text", text: summarizeBriefing(payload) }],
    structuredContent: payload,
  };
}

// Helper (new, co-located):
function toBlock<T>(r: PromiseSettledResult<T>): { status: 'ok', data: T } | { status: 'error', message: string } {
  if (r.status === 'fulfilled') return { status: 'ok', data: r.value };
  return { status: 'error', message: errorMessage(r.reason) };
}
```

**Load-bearing invariants (do NOT change):**
- `DAILY_BRIEFING_URI = "ui://widgets/daily-briefing.html"` (line 20) — Phase 19 widget depends on this exact URI (§code_context "Zero TS diff assertion")
- `_meta: { ui: { resourceUri: DAILY_BRIEFING_URI } }` on the tool registration (D-09, §specifics)
- `registerAppTool` call for `daily_briefing` stays (not `server.registerTool`) — this is what exposes `_meta.ui`
- Tool name `"daily_briefing"` stays (D-14)

#### 8b. `summarizeBriefing()` rewrite (lines 187-208)

**Current** (iterates 3 buckets):

```typescript
// EXISTING — revenue/attention/incomplete lines in German
function summarizeBriefing(p: { revenue, attention, incomplete }): string {
  const lines: string[] = [];
  lines.push(`Umsatz heute: ${revenue.today.total_booked.toFixed(2)} ${revenue.currency} ...`);
  // ...
  return lines.join("\n");
}
```

**Target (D-10, §specifics):** keep German, iterate over the 4 blocks + attention sub-section. For `{status:'error'}` blocks, emit `"Tages-Hochrechnung: n/v (Fehler)"` etc. Example phrasings per §specifics: "Tages-Hochrechnung: …", "Zahlungsaufmerksamkeit: …".

#### 8c. Tool registration additions (after line 117, before legacy stubs at 139)

**Pattern for the 5 new tools** (analog = `revenue_today` registration at lines 79-97):

```typescript
// ANALOG — mcp-server.ts:79-97 — the ad-hoc tool registration shape
server.registerTool(
  "revenue_today",
  {
    description: "...",
    inputSchema: {},
  },
  async () => {
    try {
      const payload = await buildRevenueToday(createWooClient());
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
      };
    } catch (err) {
      return failure("revenue_today", err);
    }
  },
);
```

**Copy, swap for each new tool:**
- Name → `revenue_run_rate` / `weekly_heatmap` / `repeat_metrics` / `market_basket_or_aov` / `weekly_briefing_data`
- Description → short German-aware text
- `inputSchema` → `{}` for the 3 arg-less tools; for `weekly_heatmap` use `{ weeks: z.number().int().min(1).max(52).optional() }`; for `repeat_metrics` use `{ days: z.number().int().min(1).max(365).optional() }`
- Body → `const payload = await buildWeeklyHeatmap(createKmnBridgeClient(), args)` etc.
- Error path → reuse existing `failure(tool, err)` helper (line 210) — it already accepts any error; extend `errorMessage()` to recognize `KmnBridgeError` the way it recognizes `WooApiError`:

```typescript
// EXISTING — mcp-server.ts:222-227 (errorMessage helper)
function errorMessage(err: unknown): string {
  if (err instanceof WooApiError) {
    return `WooCommerce ${err.status ?? "network"} — ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}
```

**Extend to:**

```typescript
function errorMessage(err: unknown): string {
  if (err instanceof WooApiError) {
    return `WooCommerce ${err.status ?? "network"} — ${err.message}`;
  }
  if (err instanceof KmnBridgeError) {
    return `KMN bridge ${err.code} — ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}
```

#### 8d. Deletions

Per D-11, D-12 remove these blocks from `mcp-server.ts`:

- Import `buildIncompleteOrders` (lines 15-18) — REMOVE
- `import { IncompleteOrdersPayload }` (line 18) — REMOVE
- `server.registerTool("incomplete_orders", ...)` (lines 119-137) — REMOVE
- `server.registerTool("stuck_orders", ...)` stub (lines 140-163) — REMOVE
- `server.registerTool("low_stock_products", ...)` stub (lines 165-182) — REMOVE
- `// ─── Legacy stubs (kept so existing clients don't break) ──────────────────` comment divider (line 139) — REMOVE
- Any `IncompleteOrdersPayload` type reference in `summarizeBriefing`'s signature

After cleanup, `tools/list` returns exactly 8 tools (D-14). Keep `revenue_today` and `payment_attention_orders` unchanged (D-13).

---

### 9. `mcp-poc/.env.example` (MODIFIED, config)

**Analog:** self — append after line 16 (`WOOCOMMERCE_INCLUDE_ON_HOLD=false`), before `# Local dev only / PORT=3000` at lines 18-19.

**Existing file body** (already read, 20 lines):

```
# WooCommerce store base URL, e.g. https://mbm.example.com
WOOCOMMERCE_STORE_URL=

# REST API keys from WooCommerce → Settings → Advanced → REST API
WOOCOMMERCE_CONSUMER_KEY=
WOOCOMMERCE_CONSUMER_SECRET=
# ...
WOOCOMMERCE_INCLUDE_ON_HOLD=false

# Local dev only
PORT=3000
```

**Append pattern** (inline-comment style already established in the file — copy it):

```bash
# WordPress Application Password for the kmn-revenue-abilities MCP bridge.
# Generate in wp-admin → Users → Application Passwords (separate from WP_MCP_*
# used by the portal's wp-audit Edge Function — no credential coupling).
WOOCOMMERCE_WP_USER=
WOOCOMMERCE_WP_APP_PASS=

# Full URL to the kmn-revenue MCP bridge endpoint, e.g.
#   https://summerfield.ddev.site/wp-json/mcp/kmn-revenue
# Staging bridge only for v3.0; production URL TBD (future MBM rollout).
KMN_BRIDGE_URL=
```

Per D-19 these names are **distinct** from `WP_MCP_USER` / `WP_MCP_APP_PASS` used by portal's `wp-audit.ts` — do not reuse or alias.

---

### 10. `supabase/functions/mcp-proxy/index.ts` (MODIFIED, proxy-whitelist) — **PORTAL repo**

**Analog:** self — in-place string-set edit at lines 141-146.

**Current body** (exact current text from the repo):

```typescript
// EXISTING — mcp-proxy/index.ts:141-146
const ALLOWED_TOOLS = new Set([
  "daily_briefing",
  "revenue_today",
  "payment_attention_orders",
  "incomplete_orders",
]);
```

**Replace with** (D-23, identical string-set shape — just swap contents):

```typescript
const ALLOWED_TOOLS = new Set([
  "daily_briefing",
  "revenue_today",
  "payment_attention_orders",
  "revenue_run_rate",
  "weekly_heatmap",
  "repeat_metrics",
  "market_basket_or_aov",
  "weekly_briefing_data",
]);
```

**Net:** remove `"incomplete_orders"`, add 5 new underscored names. 8 tools total — matches Node-side `tools/list` (D-14).

**Surrounding code is unchanged.** The guard at lines 147-156 (`if (method === "tools/call") { ... !ALLOWED_TOOLS.has(toolName) ... }`) is already correct and stays as-is. No other mcp-proxy changes.

**Deploy path (D-24):** push to `staging` branch → `.github/workflows/deploy-edge-functions-staging.yml` fires → Supabase CLI deploys to Cloud Supabase project `ahlthosftngdcryltapu`. Prod deploy is out of scope for Phase 17.

---

### 11. `mcp-poc/src/tools/incomplete-orders.ts` (DELETED)

Per D-11: outright delete the file. No pattern needed. All references in `mcp-server.ts` (imports + tool registration + `summarizeBriefing` signature) are cleaned up under §8d.

---

## Shared Patterns

### Shared Pattern A — AbortController timeout

**Source:** `mcp-poc/src/connectors/woocommerce.ts:123-124 + 151-156 + 160-162`
**Apply to:** `kmn-bridge.ts` `callAbility()`

```typescript
// ANALOG — exact pattern to copy, swap 10_000 → 5_000
const ctrl = new AbortController();
const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
try {
  const res = await fetch(url, { ..., signal: ctrl.signal });
  // ...
} catch (err) {
  if (err instanceof Error && err.name === "AbortError") {
    throw new WooApiError(
      `WooCommerce request timed out after ${DEFAULT_TIMEOUT_MS}ms at ${path}`,
      undefined,
      safeUrl,
    );
  }
} finally {
  clearTimeout(timer);
}
```

### Shared Pattern B — MCP tool return shape

**Source:** used by EVERY tool in `mcp-server.ts` (e.g. lines 89-91, 109-112)
**Apply to:** 5 new tool registrations + refactored `daily_briefing`

```typescript
// MCP tool return contract:
{
  content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  structuredContent: payload,                   // ← typed object, what the widget reads
  // isError?: true                             ← only on error path
}
```

For `daily_briefing` the text-content is the German summary; for ad-hoc tools it's `JSON.stringify(payload, null, 2)` per the `revenue_today` precedent.

### Shared Pattern C — Error failure helper

**Source:** `mcp-poc/src/mcp-server.ts:210-227`
**Apply to:** every new ad-hoc tool's `catch` branch

```typescript
// ANALOG — mcp-server.ts:210-219 (reuse as-is; extend errorMessage to know KmnBridgeError)
function failure(tool: string, err: unknown): { content: [...], structuredContent: { error: string }, isError: true } {
  const message = errorMessage(err);
  return {
    content: [{ type: "text", text: `${tool} failed: ${message}` }],
    structuredContent: { error: message },
    isError: true,
  };
}
```

### Shared Pattern D — Env loader with named-vars error

**Source:** `mcp-poc/src/connectors/woocommerce.ts:90-100`
**Apply to:** `loadKmnBridgeCredentialsFromEnv()`

Same shape; name all 3 vars in the error message: `"KMN bridge credentials missing. Set KMN_BRIDGE_URL, WOOCOMMERCE_WP_USER, WOOCOMMERCE_WP_APP_PASS."`

### Shared Pattern E — Log prefix

**Source:** `mcp-poc/src/connectors/woocommerce.ts:136` (`[woo] 200 /orders?... 1204ms`)
**Apply to:** `kmn-bridge.ts` `callAbility()` → `[kmn-bridge] 200 kmn-weekly-heatmap 234ms` (format specified in CONTEXT.md §"Claude's Discretion" §Log format).

---

## No Analog Found

None. Every new file has a concrete analog in one of the two repos (mcp-poc connector/tool patterns + PORTAL mcp-proxy whitelist pattern). CONTEXT.md §canonical_refs cites all of them explicitly.

---

## Metadata

**Analog search scope:**
- `G:/01_OPUS/Projects/mcp-poc/src/connectors/` — 1 file (woocommerce.ts)
- `G:/01_OPUS/Projects/mcp-poc/src/tools/` — 3 files (revenue-today, payment-attention, incomplete-orders)
- `G:/01_OPUS/Projects/mcp-poc/src/mcp-server.ts` — refactor target + self-analog for tool registration
- `G:/01_OPUS/Projects/mcp-poc/.env.example` — self-analog for env layout
- `G:/01_OPUS/Projects/mcp-poc/package.json` — confirmed `zod ^3.23.8` present (D-04 satisfied)
- `G:/01_OPUS/Projects/PORTAL/supabase/functions/mcp-proxy/index.ts` — self-analog for whitelist edit

**Files scanned:** 7 analog sources (full Reads) + 2 blueprint docs (CONTEXT.md + 16-03-SUMMARY.md).
**Pattern extraction date:** 2026-04-24.

**Key load-bearing invariants (must NOT be changed):**
- `DAILY_BRIEFING_URI = "ui://widgets/daily-briefing.html"` (mcp-server.ts:20) — Phase 19 widget URI
- Tool names `daily_briefing`, `revenue_today`, `payment_attention_orders` (unchanged tool surface for existing consumers)
- `_meta.ui.resourceUri` in `daily_briefing` registration (D-09)
- `registerAppTool` (not `server.registerTool`) for `daily_briefing` — this is what exposes `_meta.ui` to MCP UI clients
- `ui://` URI scheme guard in mcp-proxy lines 161-170 (adjacent to whitelist edit — do NOT touch)
