// Minimal chainable mock for supabase-js query builder.
// Supports the subset used by _shared/org.ts and friends:
//   supabase.from(table).select(cols).contains(col, val) -> {data, error}
//   supabase.from(table).select(cols).eq(col, val) -> {data, error}
//   supabase.from(table).select(cols).eq(col, val).limit(n).maybeSingle() -> {data, error}
//
// Usage:
//   const supabase = makeMockClient({
//     organizations: { data: [{ id: "abc" }], error: null },
//     org_members:   { data: [{ profile_id: "p1" }, { profile_id: "p2" }], error: null },
//   });
//
// Each entry in the map keys a table name to a fixed response. If the test
// needs to distinguish multiple shapes for the same table (e.g. different
// filters), pass a function (calls) => response.

export type MockResponse = { data: unknown; error: unknown };
export type MockResolver = MockResponse | ((call: MockCall) => MockResponse);

export interface MockCall {
  table: string;
  select: string | null;
  filters: Array<{ op: string; column: string; value: unknown }>;
  terminal: string | null; // maybeSingle | single | null
  limit: number | null;
}

export function makeMockClient(
  tables: Record<string, MockResolver>,
  // Optional call-tracking array the test can inspect
  calls: MockCall[] = [],
) {
  function buildBuilder(table: string): unknown {
    const state: MockCall = {
      table,
      select: null,
      filters: [],
      terminal: null,
      limit: null,
    };

    const resolve = (): MockResponse => {
      const resolver = tables[table];
      calls.push({ ...state, filters: [...state.filters] });
      if (!resolver) return { data: null, error: { message: `no mock for table ${table}` } };
      return typeof resolver === "function" ? resolver(state) : resolver;
    };

    const builder: Record<string, unknown> = {
      select(cols: string) { state.select = cols; return builder; },
      contains(column: string, value: unknown) {
        state.filters.push({ op: "contains", column, value });
        return builder;
      },
      eq(column: string, value: unknown) {
        state.filters.push({ op: "eq", column, value });
        return builder;
      },
      in(column: string, value: unknown[]) {
        state.filters.push({ op: "in", column, value });
        return builder;
      },
      ilike(column: string, value: unknown) {
        state.filters.push({ op: "ilike", column, value });
        return builder;
      },
      gte(column: string, value: unknown) {
        state.filters.push({ op: "gte", column, value });
        return builder;
      },
      or(expr: string) {
        state.filters.push({ op: "or", column: expr, value: null });
        return builder;
      },
      order(_col: string, _opts?: unknown) { return builder; },
      limit(n: number) { state.limit = n; return builder; },
      maybeSingle() {
        state.terminal = "maybeSingle";
        const res = resolve();
        const data = Array.isArray(res.data) ? (res.data[0] ?? null) : res.data;
        return Promise.resolve({ data, error: res.error });
      },
      single() {
        state.terminal = "single";
        return Promise.resolve(resolve());
      },
      then(onFulfilled: (v: MockResponse) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(resolve()).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  return {
    from(table: string) { return buildBuilder(table); },
    __calls: calls,
  };
}

export function makeSilentLogger(): {
  warn: (msg: string, data?: unknown) => void;
  info: (msg: string, data?: unknown) => void;
  error: (msg: string, data?: unknown) => void;
  calls: Array<{ level: string; msg: string; data?: unknown }>;
} {
  const calls: Array<{ level: string; msg: string; data?: unknown }> = [];
  return {
    warn: (msg, data) => { calls.push({ level: "warn", msg, data }); },
    info: (msg, data) => { calls.push({ level: "info", msg, data }); },
    error: (msg, data) => { calls.push({ level: "error", msg, data }); },
    calls,
  };
}
