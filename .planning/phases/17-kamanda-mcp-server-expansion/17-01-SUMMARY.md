---
phase: 17-kamanda-mcp-server-expansion
plan: 01
subsystem: api
tags: [mcp-poc, node, connector, zod, http-client, json-rpc, basic-auth]

requires:
  - phase: 16-kmn-revenue-abilities-wp-plugin
    provides: "5 WP abilities at /wp-json/mcp/kmn-revenue with JSON-RPC envelope contract"

provides:
  - "kmn-bridge-schemas.ts: Zod schemas + inferred types for all 5 kmn-revenue-abilities responses"
  - "kmn-bridge.ts: createKmnBridgeClient() factory with 5 methods, KmnBridgeError, env loader"

affects:
  - 17-02 (5 new MCP tool builders — each is a one-liner calling createKmnBridgeClient())
  - 17-03 (daily_briefing fan-out refactor uses createKmnBridgeClient())

tech-stack:
  added: []
  patterns:
    - "Zod passthrough schemas for forward-compat WP response validation (D-04, D-05)"
    - "JSON-RPC callAbility() wrapper: build envelope → POST → unwrap content[0].text → JSON.parse → Zod validate"
    - "KmnBridgeError: 4-code union (timeout/http/envelope/schema) mirrors WooApiError pattern"
    - "AbortController 5s timeout with clearTimeout in finally (mirrors woocommerce.ts pattern)"
    - "Re-export payload types from bridge entry point so tool builders import from one file (D-06)"

key-files:
  created:
    - mcp-poc:src/connectors/kmn-bridge-schemas.ts
    - mcp-poc:src/connectors/kmn-bridge.ts
  modified: []

key-decisions:
  - "No test runner present in mcp-poc (no vitest/jest in devDependencies) — TDD applied as type-level verification via tsc --noEmit; both tasks pass cleanly"
  - "All root schemas use .passthrough() for forward-compat with future WP-side field additions (plan spec)"
  - "top_products_3.length(3) and expected_by_hour.length(24) and aov_bands.length(3) are strict — guaranteed by Phase 16 WP abilities"
  - "safeEndpoint() is a no-op redaction function kept for structural parity with woocommerce.ts; bridge URL carries no secrets"

patterns-established:
  - "Connector pattern: createKmnBridgeClient mirrors createWooClient — env loader, AbortController, typed error class, factory return type"
  - "Schema-as-types: z.infer<typeof ...Schema> is single source of truth; no hand-maintained TS types"

requirements-completed: [MCPS-01, MCPS-07]

duration: 18min
completed: "2026-04-24"
---

# Phase 17 Plan 01: kmn-bridge Connector + Zod Schemas — Summary

**Typed WP bridge client (createKmnBridgeClient) + Zod response schemas for all 5 kmn-revenue-abilities endpoints, with Basic Auth, 5s timeout, JSON-RPC unwrap, and schema-validated return types**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-04-24T14:21:00Z
- **Completed:** 2026-04-24T14:39:00Z
- **Tasks:** 2
- **Files created:** 2 (both in mcp-poc/src/connectors/)

## Accomplishments

- Zod schemas for all 5 abilities with seeded-data range constraints (DayOfWeek 1–7, HourOfDay 0–23, confidence enum, etc.)
- `createKmnBridgeClient()` factory: 5 methods mapping Node underscore names to WP hyphenated ability names (D-02)
- `KmnBridgeError` with 4-code union `timeout|http|envelope|schema`, mirrors `WooApiError` pattern
- `loadKmnBridgeCredentialsFromEnv()` reads `KMN_BRIDGE_URL`, `WOOCOMMERCE_WP_USER`, `WOOCOMMERCE_WP_APP_PASS` — distinct from WP_MCP_* (D-19, MCPS-07)
- `tsc --noEmit` passes cleanly on the full mcp-poc project after both files added

## Task Commits (mcp-poc repo)

1. **Task 1: Zod response schemas** — `93f72f7` feat(17-01)
2. **Task 2: Bridge client factory** — `4fac2ef` feat(17-01)

Both commits on `mcp-poc` branch `main`.

## Files Created

- `G:/01_OPUS/Projects/mcp-poc/src/connectors/kmn-bridge-schemas.ts` — 5 Zod schemas + 5 z.infer types; shared `Slot` sub-shape; `.passthrough()` on all roots
- `G:/01_OPUS/Projects/mcp-poc/src/connectors/kmn-bridge.ts` — factory + `KmnBridgeError` + env loader + `callAbility()` helper + type re-exports

## Decisions Made

- No test runner (vitest/jest) in mcp-poc — TDD applied as type-level verification (tsc --noEmit). The plan's `tdd="true"` annotation was noted; the mcp-poc repo has no test infrastructure. tsc passing is the contract-level gate.
- `.passthrough()` on all 5 root schemas: allows WP-side to add fields in future plugin versions without breaking the Node consumer. Nested sub-shapes (Slot, AovBand, BasketPair) also use passthrough.
- Kept `safeEndpoint()` as a structural no-op (bridge URL has no embedded secrets) to maintain code-shape parity with `woocommerce.ts`.
- `randomUUID()` imported from `node:crypto` — Node ≥20 (engines field in package.json confirms), no polyfill needed.

## Deviations from Plan

None — plan executed exactly as written. The plan body provided verbatim file content; both files match the spec precisely. The only noteworthy observation (not a deviation) is the absence of a test runner in mcp-poc, which the plan anticipated by specifying type-level verification in the `<verify>` blocks.

## Threat Mitigations Applied (from PLAN.md threat model)

| Threat | Mitigation | Verified |
|--------|------------|---------|
| T-17-01 (info disclosure in error messages) | `body.slice(0, 200)` truncation in KmnBridgeError | In kmn-bridge.ts line 140 |
| T-17-02 (info disclosure in logs) | `[kmn-bridge] <status> <ability> <elapsed>ms` only — no headers/body | In kmn-bridge.ts log line |
| T-17-03 (tampering via malformed response) | Every response `schema.safeParse(envelope.data)` before return | callAbility() lines |
| T-17-04 (DoS via hung connection) | `AbortController` with `BRIDGE_TIMEOUT_MS = 5_000` + `clearTimeout` in finally | kmn-bridge.ts |
| T-17-07 (credential coupling) | Env vars `WOOCOMMERCE_WP_USER` / `WOOCOMMERCE_WP_APP_PASS` / `KMN_BRIDGE_URL` distinct from portal's `WP_MCP_*` | loadKmnBridgeCredentialsFromEnv() |

## Known Stubs

None — both files are complete implementations with no placeholder values or TODOs.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes beyond what is documented in the plan's threat model.

## Next Phase Readiness

Plan 17-02 (5 new MCP tool builders) can proceed immediately:

```typescript
import { createKmnBridgeClient, type RunRateData } from "../connectors/kmn-bridge.js";

export async function buildRevenueRunRate(client = createKmnBridgeClient()): Promise<RunRateData> {
  return client.runRate(); // envelope unwrap + Zod validation already handled
}
```

All 5 bridge method signatures are available; payload types are re-exported from the bridge entry point.

## Self-Check: PASSED

- FOUND: `G:/01_OPUS/Projects/mcp-poc/src/connectors/kmn-bridge-schemas.ts`
- FOUND: `G:/01_OPUS/Projects/mcp-poc/src/connectors/kmn-bridge.ts`
- FOUND commit `93f72f7` in mcp-poc git log
- FOUND commit `4fac2ef` in mcp-poc git log
- `tsc --noEmit` exit 0 (confirmed at end of Task 2)
- Schema export count: 5 (RunRateSchema, HeatmapSchema, RepeatSchema, BasketSchema, WeeklyBriefingSchema)
- Type export count: 5 (RunRateData, HeatmapData, RepeatData, BasketData, WeeklyBriefingData)
- z.infer usage count: 5 (all types derived from schemas, D-06 satisfied)

---
*Phase: 17-kamanda-mcp-server-expansion*
*Completed: 2026-04-24*
