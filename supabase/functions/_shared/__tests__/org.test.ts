import { assertEquals } from "@std/assert";
import { findOrgByListId, findOrgBySupportTaskId, getOrgMemberIds, getVisibleMemberProfileIds } from "../org.ts";
import { makeMockClient, makeSilentLogger } from "./supabase-mock.ts";

// Tests for _shared/org.ts — org resolution helpers.
// Regression: prior implementations destructured `{ data }` without checking
// `error`, so PostgREST failures (stale schema cache, RLS, missing column)
// silently turned into "org not found". These tests lock in both the happy
// paths and the error-logged paths.

Deno.test("findOrgByListId: returns org + members on single match", async () => {
  const supabase = makeMockClient({
    organizations: { data: [{ id: "org-abc" }], error: null },
    org_members: { data: [{ profile_id: "p1" }, { profile_id: "p2" }], error: null },
  });
  // deno-lint-ignore no-explicit-any
  const result = await findOrgByListId(supabase as any, "list-123");
  assertEquals(result?.organizationId, "org-abc");
  assertEquals(result?.profileIds, ["p1", "p2"]);
});

Deno.test("findOrgByListId: returns null when no org matches", async () => {
  const supabase = makeMockClient({
    organizations: { data: [], error: null },
  });
  // deno-lint-ignore no-explicit-any
  const result = await findOrgByListId(supabase as any, "list-ghost");
  assertEquals(result, null);
});

Deno.test("findOrgByListId: returns null when >1 orgs match (ambiguous)", async () => {
  const supabase = makeMockClient({
    organizations: { data: [{ id: "a" }, { id: "b" }], error: null },
  });
  // deno-lint-ignore no-explicit-any
  const result = await findOrgByListId(supabase as any, "list-shared");
  assertEquals(result, null);
});

Deno.test("getOrgMemberIds: returns all profile_ids for org", async () => {
  const supabase = makeMockClient({
    org_members: { data: [{ profile_id: "p1" }, { profile_id: "p2" }], error: null },
  });
  // deno-lint-ignore no-explicit-any
  const ids = await getOrgMemberIds(supabase as any, "org-abc");
  assertEquals(ids, ["p1", "p2"]);
});

Deno.test("findOrgByListId: returns null AND logs warn when PostgREST errors", async () => {
  const supabase = makeMockClient({
    organizations: {
      data: null,
      error: { message: "column organizations.clickup_list_ids does not exist" },
    },
  });
  const log = makeSilentLogger();
  // deno-lint-ignore no-explicit-any
  const result = await findOrgByListId(supabase as any, "list-123", log);
  assertEquals(result, null);
  const warns = log.calls.filter((c) => c.level === "warn");
  assertEquals(warns.length, 1);
  assertEquals(warns[0].msg, "findOrgByListId: query failed");
});

Deno.test("getOrgMemberIds: returns [] AND logs warn on query error", async () => {
  const supabase = makeMockClient({
    org_members: { data: null, error: { message: "RLS denied" } },
  });
  const log = makeSilentLogger();
  // deno-lint-ignore no-explicit-any
  const ids = await getOrgMemberIds(supabase as any, "org-abc", log);
  assertEquals(ids, []);
  const warns = log.calls.filter((c) => c.level === "warn");
  assertEquals(warns.length, 1);
  assertEquals(warns[0].msg, "getOrgMemberIds: query failed");
});

Deno.test("findOrgBySupportTaskId: returns null AND logs warn on query error", async () => {
  const supabase = makeMockClient({
    organizations: { data: null, error: { message: "boom" } },
  });
  const log = makeSilentLogger();
  // deno-lint-ignore no-explicit-any
  const result = await findOrgBySupportTaskId(supabase as any, "task-xyz", log);
  assertEquals(result, null);
  const warns = log.calls.filter((c) => c.level === "warn");
  assertEquals(warns.length, 1);
  assertEquals(warns[0].msg, "findOrgBySupportTaskId: query failed");
});

Deno.test("findOrgBySupportTaskId: returns org + members on match", async () => {
  const supabase = makeMockClient({
    organizations: { data: { id: "org-s" }, error: null },
    org_members: { data: [{ profile_id: "p1" }], error: null },
  });
  // deno-lint-ignore no-explicit-any
  const result = await findOrgBySupportTaskId(supabase as any, "task-xyz");
  assertEquals(result?.organizationId, "org-s");
  assertEquals(result?.profileIds, ["p1"]);
});

// ---- getVisibleMemberProfileIds tests ----

Deno.test("getVisibleMemberProfileIds: returns RPC results on success", async () => {
  const supabase = makeMockClient(
    {},
    [],
    {
      get_visible_member_profile_ids: {
        data: [{ profile_id: "p1" }, { profile_id: "p3" }],
        error: null,
      },
    },
  );
  // deno-lint-ignore no-explicit-any
  const result = await getVisibleMemberProfileIds(supabase as any, "org-abc", ["dept-a"], "creator-1");
  assertEquals(result, ["p1", "p3"]);
});

Deno.test("getVisibleMemberProfileIds: returns [] on RPC error (fail closed)", async () => {
  const supabase = makeMockClient(
    {
      // These would be used by the old permissive fallback — should NOT be called
      org_members: { data: [{ profile_id: "p1" }, { profile_id: "p2" }], error: null },
    },
    [],
    {
      get_visible_member_profile_ids: {
        data: null,
        error: { message: "function get_visible_member_profile_ids does not exist" },
      },
    },
  );
  const log = makeSilentLogger();
  // deno-lint-ignore no-explicit-any
  const result = await getVisibleMemberProfileIds(supabase as any, "org-abc", ["dept-a"], "creator-1", log);
  // Must return empty array (fail closed), NOT all org members
  assertEquals(result, []);
  // Must log an error
  const errors = log.calls.filter((c) => c.level === "error");
  assertEquals(errors.length, 1);
  assertEquals(errors[0].msg, "getVisibleMemberProfileIds: RPC failed — failing closed (no recipients)");
});

Deno.test("getVisibleMemberProfileIds: returns [] on unexpected exception (fail closed)", async () => {
  // Simulate rpc throwing an exception (not just returning error)
  const supabase = makeMockClient(
    {
      org_members: { data: [{ profile_id: "p1" }], error: null },
    },
    [],
    {
      get_visible_member_profile_ids: (_fn, _params) => {
        throw new Error("connection reset");
      },
    },
  );
  const log = makeSilentLogger();
  // deno-lint-ignore no-explicit-any
  const result = await getVisibleMemberProfileIds(supabase as any, "org-abc", [], null, log);
  assertEquals(result, []);
  const errors = log.calls.filter((c) => c.level === "error");
  assertEquals(errors.length, 1);
  assertEquals(errors[0].msg, "getVisibleMemberProfileIds: unexpected error — failing closed (no recipients)");
});

Deno.test("getVisibleMemberProfileIds: returns [] for empty org (no RPC call needed)", async () => {
  // Empty departments + null creator: still calls RPC, returns whatever RPC returns
  const supabase = makeMockClient(
    {},
    [],
    {
      get_visible_member_profile_ids: {
        data: [{ profile_id: "p1" }],
        error: null,
      },
    },
  );
  // deno-lint-ignore no-explicit-any
  const result = await getVisibleMemberProfileIds(supabase as any, "org-abc", [], null);
  assertEquals(result, ["p1"]);
});

// Smoke check for test helper
Deno.test("makeSilentLogger: captures warn + info", () => {
  const log = makeSilentLogger();
  log.warn("hello", { a: 1 });
  log.info("world");
  assertEquals(log.calls.length, 2);
  assertEquals(log.calls[0].level, "warn");
});
