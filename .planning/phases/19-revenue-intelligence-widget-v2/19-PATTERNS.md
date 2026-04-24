# Phase 19: Revenue Intelligence Widget v2 — Pattern Map

**Mapped:** 2026-04-24
**Files analyzed:** 14 new + 2 extended + 3 replaced/deleted (mcp-poc side) + 0 PORTAL-side code files (PORT-04 zero-diff)
**Analogs found:** 14 / 14 (13 strong, 1 partial)

> Phase 19 is a single-repo implementation inside `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/`. PORTAL sees zero TypeScript diff (PORT-04). The closest analogs live in **two tiers**:
> 1. **v1 widget** (`mcp-poc/widgets/daily-briefing/src/App.tsx` + `styles.css`) — in-place replacement target; provides lifecycle, `AdminLink`/`app.openLink`, `AttentionCard`, `de-DE` formatters.
> 2. **Phase 18 shared rails** (`widgets/shared/*`) — already-shipped handshake, tokens, vite factory, test patterns.
>
> The planner MUST preserve the **`useMemo`-stabilized hook return** discipline from PORTAL (`useMcpProxy.ts`, `useThemePublisher.ts`) and Phase 18 (`useHostTokens.ts`) in every new hook (`useCountUp`, HeatmapBlock internal state reducers if any).

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `widgets/daily-briefing/src/App.tsx` (REPLACED in-place) | app shell / block composer | request-response (toolResult) + event (handshake) | `mcp-poc/widgets/daily-briefing/src/App.tsx` (v1) lines 109–245 | **exact** — same file, v1 is the blueprint for MCP lifecycle + state machine |
| `widgets/daily-briefing/src/blocks/HeuteBlock.tsx` | block component | transform (RunRateData → JSX) | v1 `RevenueCard` lines 420–467 + v1 `KPIRow` lines 252–289 | **role-match** — card w/ header + stacked rows + payment method list |
| `widgets/daily-briefing/src/blocks/HeatmapBlock.tsx` | block component + local state | transform + request-response (`app.callServerTool`) | v1 `onRefresh` lines 186–206 (callServerTool shape) + no card analog for heatmap grid | **partial** — lifecycle pattern exists; 7×24 CSS grid is new ground (pure JSX/CSS per D-19-01) |
| `widgets/daily-briefing/src/blocks/RepeatBlock.tsx` | block component | transform (RepeatData → JSX) | v1 `RevenueCard` lines 420–467 (card shell) | **role-match** — read-only metric card |
| `widgets/daily-briefing/src/blocks/BasketOrAovBlock.tsx` | block component (mode switch) | transform (BasketData.mode → 3 branches) | v1 `AttentionCard` lines 337–416 (mode-switch via category slicing) | **role-match** — single component that switches render by payload-shape |
| `widgets/daily-briefing/src/blocks/AttentionList.tsx` | block sub-component | transform + event (`app.openLink`) | v1 `AttentionCard` lines 337–416 + `AdminLink` lines 12–24 | **exact** — literal port, compressed per D-19-04 |
| `widgets/daily-briefing/src/blocks/BlockSkeleton.tsx` | block component (variant) | transform (props → JSX) | v1 `loading` state lines 208–214 + v1 `error` state lines 216–228 | **role-match** — two inline variants in v1 become a single propsed component |
| `widgets/daily-briefing/src/lib/types.ts` | type duplication | — | `widgets/shared/widget-tokens.ts` lines 1–2 (`KEEP IN SYNC` header pattern) + `mcp-poc/src/connectors/kmn-bridge-schemas.ts` (source types) + `mcp-poc/src/mcp-server.ts` lines 31–44 (BriefingPayload) | **exact** — same duplication discipline as Phase 18 D-18-03 |
| `widgets/daily-briefing/src/lib/formatters.ts` | lib helper (pure) | transform (number/date → string) | v1 `formatMoney` lines 530–535, `formatHours` 538–542, `formatTimestamp` 544–557 | **exact** — migrate + expand v1 helpers |
| `widgets/daily-briefing/src/lib/theme.ts` | lib helper (re-export) | event (imports useHostTokens) | `widgets/shared/hooks/useHostTokens.ts` (full file, direct consumer) | **exact** — thin re-export / consumer |
| `widgets/daily-briefing/src/lib/useCountUp.ts` | hook (motion) | transform (number target → spring) | `widgets/shared/hooks/useHostTokens.ts` lines 80–83 (useMemo-stabilized return pattern) | **role-match** — new pattern domain (spring), same stability discipline |
| `widgets/daily-briefing/src/lib/fixtures.ts` (EXTENDED) | lib helper (parser + loader) | transform (URL → fixture mode) | `widgets/daily-briefing/src/lib/fixtures.ts` lines 1–13 (existing `getFixtureMode`) | **exact** — extend in-place |
| `widgets/daily-briefing/src/lib/fixtures-payloads.ts` | fixture data (lib) | transform (mode → BriefingPayload) | no direct analog — new file; shape must match types.ts | **partial** — pattern-match v1 `mockData()` lines 582–669 for shape authoring |
| `widgets/daily-briefing/src/lib/__tests__/formatters.test.ts` | test (pure lib) | — | `widgets/shared/__tests__/widget-tokens.contract.test.ts` | **role-match** — pure lib + vitest pattern |
| `widgets/daily-briefing/src/lib/__tests__/fixtures.test.ts` | test (pure lib) | — | `widgets/shared/__tests__/widget-tokens.contract.test.ts` | **role-match** |
| `widgets/daily-briefing/src/blocks/__tests__/*.test.tsx` | test (component snapshot) | — | `widgets/shared/hooks/__tests__/useHostTokens.test.ts` | **role-match** — jsdom + @testing-library/react + vitest |
| `widgets/daily-briefing/src/styles.css` (REPLACED) | config / stylesheet | — | `widgets/daily-briefing/src/styles.css` (v1) line 1 (`@import "tailwindcss";`) | **partial** — drop custom CSS vars, keep only Tailwind import + minimal global resets |
| `widgets/daily-briefing/src/main.tsx` (UNCHANGED) | entry point | — | existing file lines 1–13 | **exact — verify intact** |
| PORTAL code files | — | — | — | **zero-diff verification only (PORT-02..05)** |

---

## Pattern Assignments

### `widgets/daily-briefing/src/App.tsx` (app shell, request-response + event)

**Analog:** `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/App.tsx` (v1, in-place replaced)

**Imports pattern** (v1 lines 1–2; extended for Phase 19):
```tsx
// from v1 — keep
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { App, PostMessageTransport } from "@modelcontextprotocol/ext-apps";
// add in v2
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useHostTokens } from "../../shared/hooks/useHostTokens";
import { getFixtureMode } from "./lib/fixtures";
import { getFixturePayload } from "./lib/fixtures-payloads";
import type { BriefingPayload } from "./lib/types";
import { HeuteBlock } from "./blocks/HeuteBlock";
import { HeatmapBlock } from "./blocks/HeatmapBlock";
import { RepeatBlock } from "./blocks/RepeatBlock";
import { BasketOrAovBlock } from "./blocks/BasketOrAovBlock";
import { BlockSkeleton } from "./blocks/BlockSkeleton";
```

**State machine** (v1 lines 102–106 — preserved literally):
```tsx
type State =
  | { kind: "loading" }
  | { kind: "ok"; data: BriefingPayload }   // BriefingPayload shape swaps to Phase 19 import
  | { kind: "error"; message: string };
```

**MCP App lifecycle** (v1 lines 115–184 — keep dev-harness bypass + `autoResize:false` + `notifySize` + `ResizeObserver`; swap payload guards):
```tsx
useEffect(() => {
  if (window.parent === window) {
    // Dev harness: honour ?mock=* URL param
    const mode = getFixtureMode();
    setState({ kind: "ok", data: getFixturePayload(mode) });
    return;
  }
  const app = new App({ name: "DailyBriefing", version: "2.0.0" }, {}, { autoResize: false });
  appRef.current = app;

  let lastHeight = 0;
  const notifySize = () => {
    const h = Math.ceil(document.documentElement.scrollHeight);
    if (h === lastHeight) return;
    lastHeight = h;
    void (app as unknown as { sendSizeChanged: (p: { height: number }) => Promise<unknown> })
      .sendSizeChanged({ height: h }).catch(() => {});
  };

  app.ontoolresult = (params) => {
    const structured = params.structuredContent as unknown;
    if (isBriefingPayload(structured)) {
      setState({ kind: "ok", data: structured });
    } else {
      setState({ kind: "error", message: "invalid payload" });
    }
  };

  void app.connect(new PostMessageTransport(window.parent))
    .then(() => notifySize())
    .catch((err) => console.error("App.connect failed:", err));

  const ro = new ResizeObserver(notifySize);
  ro.observe(document.documentElement);
  ro.observe(document.body);
  return () => ro.disconnect();
}, []);
```

**AppContext + provider** (v1 lines 10 + 234–244 — keep as-is for `AttentionList` consumption):
```tsx
const AppContext = createContext<InstanceType<typeof App> | null>(null);
// ...
return (
  <AppContext.Provider value={appRef.current}>
    {/* 4 blocks inside AnimatePresence */}
  </AppContext.Provider>
);
```

**New: 4-block AnimatePresence + stagger** (D-19-03 locked; NOT in v1):
```tsx
const reduced = useReducedMotion();
const list = reduced
  ? { animate: { transition: { duration: 0.2 } } }
  : { animate: { transition: { staggerChildren: 0.08 } } };
const item = reduced
  ? { initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: 0.2 } } }
  : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } } };

return (
  <AppContext.Provider value={appRef.current}>
    <motion.div className="..." variants={list} initial="initial" animate="animate">
      <motion.div variants={item}><HeuteBlock .../></motion.div>
      <motion.div variants={item}><HeatmapBlock app={appRef.current} .../></motion.div>
      <motion.div variants={item}><RepeatBlock .../></motion.div>
      <motion.div variants={item}><BasketOrAovBlock .../></motion.div>
    </motion.div>
  </AppContext.Provider>
);
```

**`isBriefingPayload` guard** (v1 lines 572–576 — replace shape check):
```tsx
function isBriefingPayload(v: unknown): v is BriefingPayload {
  if (!v || typeof v !== "object") return false;
  const o = v as { blocks?: unknown; attention?: unknown };
  return !!o.blocks && !!o.attention; // shallow; per-block status checks inside block components
}
```

**Drop from v1:**
- `KPIRow`, `RevenueCard`, `IncompleteCard`, `BriefingHeader`, `BriefingFooter`, `onRefresh` (no v2 refresh button per UI-SPEC).
- `mockData()` (moved to `lib/fixtures-payloads.ts`).
- `formatMoney`/`formatHours`/`formatTimestamp`/`formatRelative` (moved to `lib/formatters.ts`).
- `isErrorPayload` — replaced by per-block `status` checks inside blocks.

---

### `widgets/daily-briefing/src/blocks/HeuteBlock.tsx` (block, transform)

**Analog:** v1 `RevenueCard` (lines 420–467) for card-with-stacked-rows shape; v1 `KPIRow` (lines 252–289) for positive/negative change styling.

**Imports + shell** (adapted from v1 `RevenueCard`):
```tsx
import type { RunRateData, Block } from "../lib/types";
import { formatCurrency, formatPercent } from "../lib/formatters";
import { useCountUp } from "../lib/useCountUp";
import { BlockSkeleton } from "./BlockSkeleton";
import { AttentionList } from "./AttentionList";

export function HeuteBlock({
  block,
  attention,
}: {
  block: Block<RunRateData>;
  attention: BriefingPayload["attention"];
}) {
  if (block.status === "error") return <BlockSkeleton variant="error" approxHeight={220} />;
  const { data } = block;
  // ...
}
```

**Confidence branches** (D-19-06 — no v1 analog; implement inline replacement):
```tsx
function ProjectionRow({ data }: { data: RunRateData }) {
  const hourNow = new Date().getHours();
  const baselineOk = (data.baseline_days_used ?? 0) >= 5 && hourNow > 0;
  if (!baselineOk || data.confidence === "low") {
    return <div className="text-[15px] text-[color:var(--color-muted)]">
      {hourNow === 0 ? "Noch zu früh für Hochrechnung" : "Nicht genug Daten für Hochrechnung"}
    </div>;
  }
  const projected = useCountUp(data.projected_revenue);
  return (
    <div>
      <div className="text-3xl font-semibold leading-tight tabular-nums">
        Hochrechnung ▶ {formatCurrency(projected)} <span className="text-[13px] font-normal">bis 23:59</span>
      </div>
      <div className="text-[13px] text-[color:var(--color-muted)]">Bei aktuellem Tempo</div>
      {data.confidence === "medium" && (
        <div className="text-[13px] text-[color:var(--color-warning)]">(Schätzung, geringe Datenbasis)</div>
      )}
    </div>
  );
}
```

**Pace indicator styling** (adapted from v1 `KPIRow` lines 261–266):
```tsx
// v1 pattern (literal):
//   const changeClass = change === null ? "neutral" : change >= 0 ? "up" : "down";
//   const changeLabel = change === null ? "n/v" : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(1)}%`;
//
// v2 adaptation — hide when baseline unusable (D-19-06) + Tailwind instead of CSS class names:
const pace = data.pace_vs_7day_avg_pct;
const baselineOk = (data.baseline_days_used ?? 0) >= 5;
{baselineOk && (
  <div className="flex items-baseline justify-between text-[13px]">
    <span className="text-[color:var(--color-muted)]">vs. Ø gleiche Stunde letzte 7 Tage</span>
    <span className={pace >= 0 ? "text-[color:var(--color-success)]" : "text-[color:var(--color-danger)]"}>
      {formatPercent(pace / 100)}
    </span>
  </div>
)}
```

**Payment-method bars** (new; D-19-01 + UI-SPEC Color section):
```tsx
// Sort payment_split by revenue desc, then render 3 rows with opacity 100%/60%/30%.
// No v1 analog — v1 listed methods as rows without bars.
const sorted = [...data.payment_split].sort((a, b) => b.revenue - a.revenue);
const total = sorted.reduce((s, m) => s + m.revenue, 0);
{sorted.map((m, i) => {
  const pct = total > 0 ? (m.revenue / total) * 100 : 0;
  const opacity = i === 0 ? 1 : i === 1 ? 0.6 : 0.3;
  return (
    <div key={m.method} className="flex items-center gap-2 text-[13px]">
      <span className="flex-1 text-[color:var(--color-fg)] truncate">{m.method}</span>
      <div className="h-2 flex-1 rounded-full" style={{ background: "color-mix(in oklch, var(--color-accent) 4%, var(--color-surface))" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `color-mix(in oklch, var(--color-accent) ${opacity * 100}%, transparent)` }} />
      </div>
      <span className="text-[color:var(--color-muted)] tabular-nums">{pct.toFixed(0)} %</span>
    </div>
  );
})}
```

**Attention sub-section** (D-19-04 — render inside HeuteBlock after divider):
```tsx
{attention.status === "ok" && hasEntries(attention.data) && (
  <>
    <hr className="border-t border-[color:var(--color-border)] my-4" />
    <AttentionList data={attention.data} />
  </>
)}
{attention.status === "error" && (
  <>
    <hr className="border-t border-[color:var(--color-border)] my-4" />
    <div className="text-[13px] text-[color:var(--color-muted)] text-center py-2">Daten nicht verfügbar</div>
  </>
)}
```

---

### `widgets/daily-briefing/src/blocks/HeatmapBlock.tsx` (block, transform + request-response)

**Analog:** v1 `onRefresh` lines 186–206 (callServerTool signature + error handling); v1 has no heatmap grid analog — 7×24 CSS grid is new code per D-19-01.

**`app.callServerTool` pattern** (v1 lines 186–206 — adapt for `weekly_heatmap` instead of `daily_briefing`):
```tsx
// v1 literal pattern:
//   const result = await app.callServerTool({ name: "daily_briefing", arguments: {} });
//   const structured = (result as { structuredContent?: unknown }).structuredContent;
//
// v2 adaptation:
async function refetch(weeks: 4 | 8 | 12) {
  if (!app) return;
  setView((v) => ({ ...v, loading: true, error: null }));
  try {
    const result = await app.callServerTool({ name: "weekly_heatmap", arguments: { weeks } });
    const structured = (result as { structuredContent?: unknown }).structuredContent;
    if (isHeatmapData(structured)) {
      setView({ weeks, data: structured, error: null, loading: false });
    } else {
      setView((v) => ({ ...v, loading: false, error: "invalid payload" }));
    }
  } catch (err) {
    setView((v) => ({ ...v, loading: false, error: err instanceof Error ? err.message : String(err) }));
  }
}
```

**Local state** (D-19-05; `useState<object>` per Claude's Discretion):
```tsx
type HeatmapViewState = {
  weeks: 4 | 8 | 12;
  data: HeatmapData | null;
  error: string | null;
  loading: boolean;
};
const [view, setView] = useState<HeatmapViewState>({
  weeks: 8, data: initialData, error: null, loading: false,
});
```

**7×24 CSS grid** (new; pure JSX + `color-mix` inline style per D-19-01 + UI-SPEC intensity table):
```tsx
// Compute quintiles on non-zero cells; map cells to 5 intensities.
// 168 <div>s. Hour axis row above, weekday column left (w-10).
<div className="grid grid-cols-[40px_repeat(24,minmax(0,1fr))] gap-[2px]">
  {/* Hour axis: empty corner + 24 hour labels */}
  <div />
  {Array.from({ length: 24 }, (_, h) => (
    <div key={`hour-${h}`} className="text-[13px] text-[color:var(--color-subtle)] tabular-nums text-center">{h}</div>
  ))}
  {/* 7 rows */}
  {["Mo","Di","Mi","Do","Fr","Sa","So"].map((day, rowIdx) => (
    <Fragment key={day}>
      <div className="text-[13px] text-[color:var(--color-subtle)] text-right pr-2">{day}</div>
      {Array.from({ length: 24 }, (_, hour) => {
        const cell = buckets.find((b) => b.day_of_week === rowIdx + 1 && b.hour_of_day === hour);
        const count = cell?.order_count ?? 0;
        return (
          <div
            key={`${rowIdx}-${hour}`}
            className="aspect-square"
            style={{ background: colorForCount(count, quintiles), borderRadius: 2 }}
            aria-label={`${day}, ${hour}:00, ${count} Bestellungen`}
          />
        );
      })}
    </Fragment>
  ))}
</div>
```

**Period toggle buttons** (UI-SPEC PeriodToggle; D-19-05 interaction):
```tsx
<div className="flex gap-2 mt-4">
  {[4, 8, 12].map((w) => {
    const active = view.weeks === w;
    return (
      <button
        key={w}
        onClick={() => refetch(w as 4 | 8 | 12)}
        disabled={view.loading}
        className={`px-3 py-1.5 text-[13px] rounded-[var(--radius-md)] border transition-colors ${
          active
            ? "bg-[color:var(--color-accent)] text-[color:var(--color-surface)] border-[color:var(--color-accent)] font-semibold"
            : "bg-[color:var(--color-surface)] text-[color:var(--color-fg)] border-[color:var(--color-border)]"
        } ${view.loading ? "opacity-60 cursor-wait" : ""}`}
      >
        {w} Wochen{active ? " ✓" : ""}
      </button>
    );
  })}
</div>
```

**Loading overlay during refetch** (D-19-03 / UI-SPEC Motion):
```tsx
<div className="relative">
  <div className={`transition-opacity duration-200 ${view.loading ? "opacity-60" : "opacity-100"}`}>
    {/* 7×24 grid */}
  </div>
  {view.loading && (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-[14px] h-[14px] rounded-full border-2 border-[color:var(--color-accent)] border-t-transparent animate-spin" />
    </div>
  )}
</div>
```

---

### `widgets/daily-briefing/src/blocks/RepeatBlock.tsx` (block, transform)

**Analog:** v1 `RevenueCard` (card shell, lines 420–467).

**Core pattern** — simple card with Heading + Display number + trend arrow + benchmark + median + basis:
```tsx
export function RepeatBlock({ block }: { block: Block<RepeatData> }) {
  if (block.status === "error") return <BlockSkeleton variant="error" approxHeight={180} />;
  const { data } = block;
  const rate = useCountUp(data.repeat_rate_pct);  // Display number count-up
  const trend = data.trend_pp;
  return (
    <section className="bg-[color:var(--color-surface)] p-6 rounded-[var(--radius-lg)] border border-[color:var(--color-border)]">
      <h2 className="text-lg font-semibold leading-snug">Wiederkäufer — letzte 90 Tage</h2>
      <div className="flex items-baseline justify-between mt-4">
        <span className="text-[15px]">Wiederkaufrate</span>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">{rate.toFixed(0)} %</span>
          {typeof trend === "number" && trend !== 0 && (
            <span className={`text-[13px] ${trend > 0 ? "text-[color:var(--color-success)]" : "text-[color:var(--color-danger)]"}`}>
              {trend > 0 ? "↑" : "↓"} {trend > 0 ? `+${trend}` : trend} PP
            </span>
          )}
        </div>
      </div>
      <div className="text-[15px] mt-3">Branchen-Benchmark ~{data.benchmark_pct.toFixed(0)} %</div>
      <div className="text-[13px] text-[color:var(--color-subtle)]">(Shopify B2C, 2024)</div>
      {data.median_days_to_2nd !== null && (
        <div className="flex items-baseline justify-between mt-3">
          <span className="text-[13px] text-[color:var(--color-muted)]">Ø Tage bis 2. Kauf</span>
          <span className="text-[15px]">{data.median_days_to_2nd} Tage</span>
        </div>
      )}
      <div className="text-[13px] text-[color:var(--color-subtle)] mt-3">
        Basis: {data.total_orders.toLocaleString("de-DE")} Bestellungen in 90 Tagen
      </div>
    </section>
  );
}
```

---

### `widgets/daily-briefing/src/blocks/BasketOrAovBlock.tsx` (block, mode-switch)

**Analog:** v1 `AttentionCard` lines 337–416 — pattern: single block that branches render by a payload field (`category` in v1, `mode` in v2).

**Mode switch** (D-19-07):
```tsx
export function BasketOrAovBlock({ block }: { block: Block<BasketData> }) {
  if (block.status === "error") return <BlockSkeleton variant="error" approxHeight={240} />;
  const { data } = block;
  switch (data.mode) {
    case "market_basket_product": return <BasketView data={data} headerCopy="Häufig zusammen gekauft" categoryGloss={false} />;
    case "market_basket_category": return <BasketView data={data} headerCopy="Häufig zusammen gekauft (Kategorien)" categoryGloss={true} />;
    case "aov_bands": return <AovBandsView data={data} />;
  }
}
```

**Basket pair rendering** (UI-SPEC trio):
```tsx
// Line 1: {A} + {B} with accent `+`
// Line 2: plain-language gloss
// Line 3: mono technical trio
(data.basket_pairs ?? []).slice(0, 3).map((p, i) => (
  <div key={i} className="flex flex-col gap-1">
    <div className="text-[15px] text-[color:var(--color-fg)]">
      {p.a_name} <span className="text-[color:var(--color-accent)]">+</span> {p.b_name}
    </div>
    <div className="text-[15px] text-[color:var(--color-muted)]">
      {Math.round((p.confidence ?? 0) * 100)}% der {p.a_name}-Käufer kauften auch {p.b_name}
    </div>
    <div className="text-[13px] font-mono text-[color:var(--color-subtle)]">
      Support {((p.support ?? 0) * 100).toFixed(0)}% · Konfidenz {((p.confidence ?? 0) * 100).toFixed(0)}% · Lift {(p.lift ?? 0).toFixed(1).replace(".", ",")}×
    </div>
  </div>
))
```

**AOV bands twin bars** (UI-SPEC Color section — stacked bars at 50% + 100% opacity):
```tsx
data.aov_bands.map((band, i) => (
  <div key={i} className="flex flex-col gap-1">
    <div className="flex justify-between text-[13px]">
      <span>{band.label}</span>
      <span className="tabular-nums">
        {((band.share_of_count ?? 0) * 100).toFixed(0)} % · {((band.share_of_revenue ?? 0) * 100).toFixed(0)} % Umsatz
      </span>
    </div>
    <div className="h-[6px]" style={{ width: `${(band.share_of_count ?? 0) * 100}%`, background: "color-mix(in oklch, var(--color-accent) 50%, transparent)" }} />
    <div className="h-[6px]" style={{ width: `${(band.share_of_revenue ?? 0) * 100}%`, background: "var(--color-accent)" }} />
  </div>
))
```

---

### `widgets/daily-briefing/src/blocks/AttentionList.tsx` (block, transform + event)

**Analog:** v1 `AttentionCard` (lines 337–416) + `AdminLink` (lines 12–24). **Literal port with compression** per D-19-04.

**AdminLink — port unchanged** (v1 lines 12–24 — critical sandbox-safe pattern):
```tsx
// Source: v1 widgets/daily-briefing/src/App.tsx lines 12-24 — literal reuse
const AppContext = createContext<InstanceType<typeof App> | null>(null);

function AdminLink({ href, children }: { href: string; children: React.ReactNode }): JSX.Element {
  const app = useContext(AppContext);
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!app) return; // standalone preview: let the browser open the link normally
    e.preventDefault();
    void app.openLink({ url: href }).catch((err) => console.error("openLink failed:", err));
  };
  return (
    <a href={href} onClick={onClick} rel="noopener noreferrer" className="text-[13px] text-[color:var(--color-accent)]">
      {children}
    </a>
  );
}
// NOTE: AppContext must live in App.tsx (exported), re-imported here. OR: lift AdminLink into App.tsx alongside AppContext.
```

**Row list** (v1 lines 394–413 — adapt classes to Tailwind, compress visual weight per D-19-04):
```tsx
// v1 literal structure:
//   <ul className="list">
//     {allItems.map((item) => (
//       <li key={item.key}>
//         <div className="item-main">
//           <div className="item-label">{item.label}</div>
//           <div className="item-name">{item.name}</div>
//           <div className="item-meta">{item.meta}</div>
//         </div>
//         <div className="item-right">
//           <div className="item-amount">{formatMoney(item.amount, data.currency)}</div>
//           <AdminLink href={item.admin_url}>Öffnen →</AdminLink>
//         </div>
//       </li>
//     ))}
//   </ul>
//
// v2 Tailwind port (D-19-04 "visually subordinate"):
<ul className="flex flex-col gap-3">
  {allItems.map((item) => (
    <li key={item.key} className="flex items-start justify-between gap-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-[color:var(--color-muted)]">{item.label}</div>
        <div className="text-[15px] text-[color:var(--color-fg)]">{item.name}</div>
        <div className="text-[13px] text-[color:var(--color-subtle)]">{item.meta}</div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <div className="text-[15px] tabular-nums">{formatCurrency(item.amount)}</div>
        <AdminLink href={item.admin_url}>Öffnen →</AdminLink>
      </div>
    </li>
  ))}
</ul>
```

**Breakdown chips** (v1 lines 382–392 — keep as-is, Tailwind port):
```tsx
<div className="flex flex-wrap gap-1 my-2">
  {cats.payment_failed.length > 0 && <Chip variant="danger">{cats.payment_failed.length} fehlgeschlagen</Chip>}
  {cats.invoice_overdue.length > 0 && <Chip variant="warning">{cats.invoice_overdue.length} überfällig</Chip>}
  {cats.on_hold.length > 0 && <Chip variant="muted">{cats.on_hold.length} zur Prüfung</Chip>}
</div>
```

---

### `widgets/daily-briefing/src/blocks/BlockSkeleton.tsx` (block, variant component)

**Analog:** v1 `loading` state (lines 208–214) + `error` state (lines 216–228) — both inline, consolidated into one component.

**Variant prop pattern** (Claude's Discretion — single component chosen for simpler imports):
```tsx
export function BlockSkeleton({
  variant,
  approxHeight,
}: {
  variant: "loading" | "error";
  approxHeight: number;
}) {
  if (variant === "loading") {
    return (
      <div
        aria-busy="true"
        aria-live="polite"
        aria-label="Lade Daten"
        className="rounded-[var(--radius-lg)] animate-shimmer"
        style={{ height: approxHeight, background: "linear-gradient(90deg, var(--color-bg), color-mix(in oklch, var(--color-subtle) 10%, transparent), var(--color-bg))", backgroundSize: "200% 100%" }}
      />
    );
  }
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] flex flex-col items-center justify-center gap-2"
      style={{ height: approxHeight }}
    >
      <div className="text-[15px] text-[color:var(--color-muted)]">Daten nicht verfügbar</div>
      <div className="text-[13px] text-[color:var(--color-subtle)]">Bitte Seite neu laden</div>
    </div>
  );
}
```

**Shimmer keyframes** (styles.css addition):
```css
@keyframes shimmer {
  from { background-position: 0% 0%; }
  to { background-position: -100% 0%; }
}
.animate-shimmer { animation: shimmer 1.5s linear infinite; }
```

---

### `widgets/daily-briefing/src/lib/types.ts` (type duplication)

**Analog:** `widgets/shared/widget-tokens.ts` lines 1–2 (KEEP IN SYNC header pattern) + source types from `mcp-poc/src/connectors/kmn-bridge-schemas.ts` + envelope from `mcp-poc/src/mcp-server.ts` lines 31–44.

**Header pattern** (literal from Phase 18 D-18-03):
```tsx
// KEEP IN SYNC WITH mcp-poc/src/mcp-server.ts BriefingPayload and mcp-poc/src/connectors/kmn-bridge-schemas.ts types.
// Widget is a sandboxed build artifact and cannot import from ../../src/. Per Phase 19 D-19-12.
// If upstream types change, update this file in the same commit.
```

**Types to mirror** (source: `kmn-bridge-schemas.ts` lines 28–113):
```tsx
// From mcp-server.ts lines 31-44
export type Block<T> =
  | { status: "ok"; data: T }
  | { status: "error"; message: string };

export type BriefingPayload = {
  blocks: {
    run_rate: Block<RunRateData>;
    heatmap: Block<HeatmapData>;
    repeat: Block<RepeatData>;
    basket: Block<BasketData>;
  };
  attention: Block<PaymentAttentionPayload>;
};

// From kmn-bridge-schemas.ts lines 28-46 (strip .passthrough() + z.infer — write TS directly)
export type RunRateData = {
  confidence: "high" | "medium" | "low";
  projected_revenue: number;
  current_revenue?: number;
  expected_by_hour: number[];          // length 24
  pace_vs_7day_avg_pct: number;
  payment_split: Array<{ method: string; order_count: number; revenue: number }>;
  same_hour_last_week?: number;
  baseline_days_used?: number;
  calculated_at?: string;
};

// ... similarly: HeatmapData (lines 51-58), RepeatData (63-73), BasketData (79-111).
// PaymentAttentionPayload: mirror from mcp-poc/src/tools/payment-attention.ts line 32.
```

---

### `widgets/daily-briefing/src/lib/formatters.ts` (lib, pure)

**Analog:** v1 `formatMoney` lines 530–535 + `formatHours` 538–542 + `formatTimestamp` 544–557.

**Existing v1 `formatMoney`** (literal reuse with rename):
```tsx
// Source: v1 App.tsx lines 530-535 — lifted unchanged, renamed + currency-defaulted
export function formatCurrency(amount: number, currency = "EUR"): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
```

**New formatters** (UI-SPEC Copywriting Contract):
```tsx
export function formatPercent(ratio: number): string {
  // ratio is 0..1 or full percent points — caller decides; example shows +18 % with sign.
  const pct = ratio * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : ""; // U+2212 minus
  return `${sign}${Math.abs(pct).toFixed(0)} %`;
}

export function formatPP(pp: number): string {
  const sign = pp > 0 ? "+" : pp < 0 ? "−" : "";
  return `${sign}${Math.abs(pp)} PP`;
}

export function formatDate(iso: string): string {
  // Mo, 21.04. style for heatmap row labels
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short", day: "2-digit", month: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(new Date(iso));
}
```

---

### `widgets/daily-briefing/src/lib/theme.ts` (lib, re-export)

**Analog:** `widgets/shared/hooks/useHostTokens.ts` (direct consumer).

**Thin wrapper pattern** (satisfies WIDG-STRUCT-03):
```tsx
// Thin wrapper — the real work lives in widgets/shared/hooks/useHostTokens.ts.
// Kept so Phase 19 files can import a local `theme.ts` per WIDG-STRUCT-03 without
// reaching across the shared boundary in every block.
export { useHostTokens } from "../../../shared/hooks/useHostTokens";

import { WIDGET_TOKENS, DEFAULT_TOKEN_VALUES, type TokenKey } from "../../../shared/widget-tokens";

/**
 * Imperative helper for non-React consumers (e.g., tests / dev harness).
 * useHostTokens already performs this internally — do NOT call twice at mount.
 */
export function applyTokens(tokens: Partial<Record<TokenKey, string>> = {}) {
  for (const key of Object.keys(WIDGET_TOKENS) as TokenKey[]) {
    const value = tokens[key] ?? DEFAULT_TOKEN_VALUES[key];
    document.documentElement.style.setProperty(WIDGET_TOKENS[key], value);
  }
}
```

---

### `widgets/daily-briefing/src/lib/useCountUp.ts` (hook, motion)

**Analog:** `widgets/shared/hooks/useHostTokens.ts` lines 80–83 (useMemo-stabilized return discipline) — **mandatory per feedback_react_hook_identity_churn**. Pattern for spring physics itself is from Motion v12 docs (see RESEARCH.md Pattern 4).

**Hook shape** (~30 LOC per D-19-03):
```tsx
import { useEffect, useState } from "react";
import { useMotionValue, useSpring, useMotionValueEvent, useReducedMotion } from "motion/react";

/**
 * Count-up hook — drives a number from 0 to `target` over ~600ms on first render.
 * Returns a plain number (current frame value) so callers can run it through formatters.
 *
 * - Reduced motion: returns target immediately (no intermediate frames).
 * - Re-render with a different `target`: spring animates to the new value.
 * - Identity: returns a primitive — no useMemo needed on the return itself.
 *   (The feedback_react_hook_identity_churn rule applies to hooks returning OBJECTS.)
 */
export function useCountUp(target: number): number {
  const reduced = useReducedMotion();
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 120, damping: 20, mass: 0.8 });
  const [display, setDisplay] = useState(reduced ? target : 0);

  useEffect(() => {
    if (reduced) {
      setDisplay(target);
      return;
    }
    mv.set(target);
  }, [target, reduced, mv]);

  useMotionValueEvent(spring, "change", (v) => {
    setDisplay(v);
  });

  return display;
}
```

**Note:** returns a primitive (`number`), so the `useMemo` return-stabilization rule (which applies to hooks returning **objects**) does not apply. Consumers call `formatCurrency(useCountUp(target))`.

---

### `widgets/daily-briefing/src/lib/fixtures.ts` (EXTENDED)

**Analog:** existing file (lines 1–13) — extend in-place, keep narrow-union discipline.

**Extension** (adds the missing `run-rate-sparse` mode from UI-SPEC mock fixtures table; keeps Phase 18 contract):
```tsx
// EXISTING (Phase 18 — keep):
export type FixtureMode = 'basket-aov' | 'one-block-failing' | 'run-rate-sparse';

export function getFixtureMode(): FixtureMode | null {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('mock')
  if (mode === 'basket-aov' || mode === 'one-block-failing' || mode === 'run-rate-sparse') return mode
  return null
}
```

Pair with new `fixtures-payloads.ts` (no analog; authored from types.ts shape + Phase 16 seeded numerics):
```tsx
import type { BriefingPayload, FixtureMode } from "./...";
export function getFixturePayload(mode: FixtureMode | null): BriefingPayload { /* ... */ }
```

---

### `widgets/daily-briefing/src/lib/fixtures-payloads.ts` (new — fixture data)

**Analog:** v1 `mockData()` lines 582–669 — literal shape-authoring template; re-author against Phase 19 `BriefingPayload` shape.

**Pattern** (fixture factory per UI-SPEC mock table):
```tsx
// Pattern lifted from v1 App.tsx mockData() lines 582-669: nest all required fields
// with realistic numerics derived from Phase 16 seeded data (1099 paid orders, 20.1% repeat, day=4/hour=20 peak).
export function getFixturePayload(mode: FixtureMode | null): BriefingPayload {
  const healthy = buildHealthyPayload();
  if (mode === null) return healthy;
  if (mode === "run-rate-sparse") {
    return { ...healthy, blocks: { ...healthy.blocks,
      run_rate: { status: "ok", data: { ...healthy.blocks.run_rate.data, confidence: "medium", baseline_days_used: 3 } } } };
  }
  if (mode === "basket-aov") {
    return { ...healthy, blocks: { ...healthy.blocks,
      basket: { status: "ok", data: buildAovBandsData() } } };
  }
  // one-block-failing: repeat fails, others stay ok.
  return { ...healthy, blocks: { ...healthy.blocks,
    repeat: { status: "error", message: "forced fixture error" } } };
}

function buildHealthyPayload(): BriefingPayload { /* ~60 LOC, see v1 mockData for structure */ }
```

---

### `widgets/daily-briefing/src/lib/__tests__/formatters.test.ts` (test, pure)

**Analog:** `widgets/shared/__tests__/widget-tokens.contract.test.ts` — full file.

**Pattern** (vitest + describe/it + literal assertions):
```tsx
import { describe, it, expect } from "vitest";
import { formatCurrency, formatPercent, formatPP, formatDate } from "../formatters";

describe("formatters (Phase 19 D-19-10)", () => {
  it("formatCurrency(1240) → '1.240 €' (de-DE, thousands dot, space before €)", () => {
    expect(formatCurrency(1240)).toBe("1.240 €");
  });
  it("formatPercent(0.18) → '+18 %' with sign and thin space", () => {
    expect(formatPercent(0.18)).toBe("+18 %");
  });
  it("formatPercent(-0.07) → '−7 %' with U+2212 minus", () => {
    expect(formatPercent(-0.07)).toBe("−7 %");
  });
  it("formatPP(4) → '+4 PP'", () => {
    expect(formatPP(4)).toBe("+4 PP");
  });
  it("formatCurrency(0) → '0 €'; formatPercent(0) → '0 %'", () => { /* edge */ });
});
```

---

### `widgets/daily-briefing/src/blocks/__tests__/*.test.tsx` (test, component)

**Analog:** `widgets/shared/hooks/__tests__/useHostTokens.test.ts` — full file (jsdom + @testing-library/react + vi.useFakeTimers).

**Pattern** (adapted for components — `render()` instead of `renderHook()`):
```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HeuteBlock } from "../HeuteBlock";
import { getFixturePayload } from "../../lib/fixtures-payloads";

describe("HeuteBlock (Phase 19 snapshots)", () => {
  it("healthy run_rate renders projection + pace", () => {
    const payload = getFixturePayload(null);
    const { asFragment } = render(<HeuteBlock block={payload.blocks.run_rate} attention={payload.attention} />);
    expect(asFragment()).toMatchSnapshot();
  });
  it("error status renders BlockSkeleton variant=error", () => {
    const { getByText } = render(<HeuteBlock block={{ status: "error", message: "x" }} attention={{ status: "ok", data: /*...*/ }} />);
    expect(getByText("Daten nicht verfügbar")).toBeInTheDocument();
    expect(getByText("Bitte Seite neu laden")).toBeInTheDocument();
  });
});
```

**RESEARCH.md caveat:** snapshot tests on Motion-animated DOM are brittle. Either (a) wrap in `<ReducedMotionProvider>` to disable Motion in test env, or (b) pass `reduced` through props to blocks, or (c) assert on `getByText`/`toBeInTheDocument` instead of full snapshots. Planner picks per Claude's Discretion in D-19-10.

---

## Shared Patterns

### Pattern S1: `useMemo`-stabilized hook returns (MANDATORY)

**Source:** `widgets/shared/hooks/useHostTokens.ts` lines 80–83 + PORTAL `useMcpProxy.ts` lines 61–77 + PORTAL `useThemePublisher.ts` lines 62–63.

**Apply to:** every new hook in Phase 19 that returns an object (`useCountUp` returns a primitive and is exempt; any future HeatmapBlock state hook that returns `{view, refetch}` is NOT exempt).

**Concrete excerpt** (widget-side):
```tsx
// useMemo-stabilized per ADR-034 + feedback_react_hook_identity_churn.
return useMemo(() => ({ tokens, source, protocolVersion }), [tokens, source, protocolVersion])
```

**PORTAL excerpt** (`useMcpProxy.ts` lines 66–77):
```tsx
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

**Rule:** if a Phase 19 hook returns `{ data, error, loading, refetch }` style, it MUST wrap in `useMemo` with a correct dep array. Feedback memory `feedback_react_hook_identity_churn` explicitly calls out this pitfall.

---

### Pattern S2: `// KEEP IN SYNC WITH …` header for duplicated files

**Source:** `widgets/shared/widget-tokens.ts` lines 1–2 (Phase 18 D-18-03).

**Apply to:** `widgets/daily-briefing/src/lib/types.ts` (D-19-12 mirror of `BriefingPayload` + 4 bridge types + PaymentAttentionPayload).

**Concrete excerpt:**
```tsx
// KEEP IN SYNC WITH PORTAL/src/shared/styles/widget-tokens.ts
// 12 tokens locked per Phase 18 D-18-03. Do NOT add or remove keys.
// If you need a 13th token, reopen Phase 18 scope with Yuri first.
```

**Phase 19 application:**
```tsx
// KEEP IN SYNC WITH mcp-poc/src/mcp-server.ts BriefingPayload (lines 31-44)
// and mcp-poc/src/connectors/kmn-bridge-schemas.ts (RunRateData, HeatmapData, RepeatData, BasketData).
// Widget is a sandboxed build artifact — cannot import across the boundary. Per Phase 19 D-19-12.
// No contract test (runtime signal is sufficient — widget can't render if payload drifts).
```

---

### Pattern S3: Sandbox-safe admin deep-links via `app.openLink`

**Source:** v1 `App.tsx` lines 10–24 (AppContext + AdminLink pattern).

**Apply to:** `AttentionList.tsx` admin-URL columns. **Do NOT use `<a target="_blank">` — sandbox blocks it.**

**Concrete excerpt (literal from v1):**
```tsx
const AppContext = createContext<InstanceType<typeof App> | null>(null);

function AdminLink({ href, children }: { href: string; children: React.ReactNode }) {
  const app = useContext(AppContext);
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!app) return;            // standalone dev harness: let browser open
    e.preventDefault();
    void app.openLink({ url: href }).catch((err) => console.error("openLink failed:", err));
  };
  return <a href={href} onClick={onClick} rel="noopener noreferrer">{children}</a>;
}
```

**Why:** iframe sandbox does not grant `allow-popups`; `window.open` / `<a target="_blank">` are blocked. The AppBridge round-trip hands the URL to the portal host, which opens it via `window.open()` in portal origin.

---

### Pattern S4: Dev-harness bypass on `window.parent === window`

**Source:** v1 `App.tsx` lines 115–119.

**Apply to:** `App.tsx` `useEffect` mount logic — the widget must render a fixture payload when opened standalone on `dev-host.html` (no parent frame).

**Concrete excerpt (literal from v1, updated target):**
```tsx
useEffect(() => {
  if (window.parent === window) {
    // Dev harness — use fixture
    const mode = getFixtureMode();
    setState({ kind: "ok", data: getFixturePayload(mode) });
    return;
  }
  // ... real App lifecycle
}, []);
```

---

### Pattern S5: Test runner — vitest + jsdom (environmentMatchGlobs)

**Source:** `mcp-poc/vitest.config.ts` (Phase 18) + `widgets/shared/hooks/__tests__/useHostTokens.test.ts` (full pattern).

**Apply to:** all Phase 19 test files.

**Concrete excerpts:**

For pure lib tests (no DOM needed):
```tsx
import { describe, it, expect } from "vitest";
// No setup — vitest.config.ts picks node env for widgets/**/lib/__tests__/.
```

For component / hook tests (needs jsdom):
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render /* or renderHook */ } from "@testing-library/react";
// vitest.config.ts environmentMatchGlobs forces jsdom for widgets/**/__tests__/*.test.tsx
// and widgets/shared/hooks/**/*.test.ts.
```

**For motion-animated components** — use `vi.useFakeTimers()` OR assert `getByText` rather than snapshotting the `style` attribute (which contains animated transforms).

---

### Pattern S6: `color-mix(in oklch, var(--color-accent) {N}%, transparent)` for intensity

**Source:** RESEARCH.md Pattern 5 + UI-SPEC heatmap intensity table. No v1 analog.

**Apply to:** heatmap cells (HeatmapBlock), payment-method bars (HeuteBlock), AOV count bar (BasketOrAovBlock).

**Idiomatic usage** (inline style, NOT Tailwind arbitrary class):
```tsx
// Preferred — inline style, one computed expression per cell:
<div style={{ background: `color-mix(in oklch, var(--color-accent) ${pct}%, transparent)` }} />

// Rejected — 5 Tailwind arbitrary classes × 168 cells would create 840 JIT class names:
// <div className="bg-[color-mix(in_oklch,_var(--color-accent)_60%,_transparent)]" />  // works but unreadable
```

**Why inline:** 168 cells × dynamic opacity → inline `style` wins on readability and avoids JIT class name blowup. Also works in Tailwind v4 arbitrary syntax (underscore-separated) if needed for unit tests of CSS, but blocks author inline.

---

### Pattern S7: PORTAL zero-diff verification (PORT-02..05)

**Source:** `project_revenue_intelligence_module` memory + Phase 18 shipped surfaces.

**Apply to:** verification tasks only — no code changes.

**Concrete verification protocol:**
```bash
# PORT-02: sandbox-proxy relay intact
grep -n "kmn/theme/" G:/01_OPUS/Projects/PORTAL/public/sandbox-proxy.html
# Expected: match around lines 66-78

# PORT-04: RevenueIntelligencePage untouched
cd G:/01_OPUS/Projects/PORTAL
git diff HEAD -- src/modules/revenue-intelligence/components/RevenueIntelligencePage.tsx
# Expected: empty diff after Phase 19 ends

# PORT-05: McpErrorBoundary behavior — force throw via bad fixture, observe German error
# Manual UAT on staging.portal.kamanin.at
```

If any of these fail → STOP. A rails gap routes back to Phase 18 (or triggers a Phase 19.1 escape hatch). Never modify PORTAL code to fit the widget.

---

## No Analog Found

Files where the codebase has no close pattern match; planner should rely on RESEARCH.md + UI-SPEC + Motion v12 + Tailwind v4 docs directly.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| 7×24 heatmap grid (inside `HeatmapBlock.tsx`) | UI primitive | transform | No existing heatmap in either repo. Phase 19 is the first CSS-grid-based heatmap. Pattern S6 (color-mix) + UI-SPEC intensity table cover the visual; grid scaffolding is hand-built per D-19-01. |
| `useCountUp.ts` spring physics | hook | event (motion tween) | No prior Motion `useSpring` usage in either repo. RESEARCH.md Pattern 4 (motion.dev docs) is the primary reference. Pattern S1 governs identity stability. |
| 4-block `AnimatePresence` + stagger | UI composition | event (first-paint trigger) | No prior `AnimatePresence` usage with variant-propagation staggers in either repo. RESEARCH.md Pattern 3 + Motion v12 docs are the refs. |
| CSS shimmer keyframes in `styles.css` | stylesheet | — | v1 styles.css has `@keyframes spin` (lines 430–433) — close but not the same. Shimmer uses `background-position` animation, pattern adapted from common Tailwind skeleton recipes (see UI-SPEC Motion §"Skeleton shimmer"). |

---

## Metadata

**Analog search scope:**
- `G:/01_OPUS/Projects/mcp-poc/widgets/` (v1 widget + Phase 18 shared)
- `G:/01_OPUS/Projects/mcp-poc/src/` (server types — reference only, NOT imported across widget/server boundary per D-19-12)
- `G:/01_OPUS/Projects/PORTAL/src/modules/revenue-intelligence/hooks/` (hook identity patterns — zero-diff targets, pattern reference only)

**Files scanned:** ~25 (v1 App.tsx 670 lines read in full; 4 Phase-18 shared files; 3 PORTAL hooks; 1 schemas file; 2 existing test files)

**Pattern extraction date:** 2026-04-24

**Key insight for planner:** Phase 19 is mostly a **migration + composition** exercise, not greenfield. v1 `App.tsx` is a 670-line single file that already contains the MCP App lifecycle (lines 115–184), the sandbox-safe link pattern (lines 12–24), the attention card shape (lines 337–416), the de-DE currency formatter (lines 530–535), and the fixture mock factory (lines 582–669). Roughly 40–50% of Phase 19 is **lift-and-reshape** from v1; the genuinely new ground is the 7×24 heatmap grid, the `useCountUp` spring hook, the 4-block AnimatePresence stagger, and the Tailwind v4 rewrite of styles.
