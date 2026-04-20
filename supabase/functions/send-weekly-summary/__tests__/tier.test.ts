import { assertEquals } from "@std/assert";
import { determineTier, TEAM_COMMENTS_ACTIVITY_THRESHOLD } from "../index.ts";

// Minimal factory — build only the fields determineTier reads.
// Using `as unknown as` lets us skip the ~20 unrelated fields on WeeklySummaryData.
function data(partial: Record<string, unknown> = {}) {
  const base = {
    completed: [],
    inProgress: [],
    teamCommentsByTask: [],
    teamCommentsTotal: 0,
    peerActivity: [],
    activeProjects: [],
    waitingForClient: [],
    openRecommendations: [],
    unreadCount: 0,
    activityCount: 0,
  };
  // deno-lint-ignore no-explicit-any
  return { ...base, ...partial } as any;
}

Deno.test("SKIP when nothing happened", () => {
  assertEquals(determineTier(data()), "SKIP");
});

Deno.test("SKIP when only pending exists (no agency activity)", () => {
  // The whole point of v1.6: Freigabe/Empfehlungen/unread alone must not trigger a send.
  // Reminders cover those separately.
  assertEquals(
    determineTier(data({
      waitingForClient: [{ taskId: "t1", taskName: "x" }],
      openRecommendations: [{ taskId: "t2", taskName: "y" }],
      unreadCount: 5,
    })),
    "SKIP",
  );
});

Deno.test("SKIP when only in-progress tasks — not agency work this week", () => {
  assertEquals(
    determineTier(data({ inProgress: [{ taskId: "t1", taskName: "x" }] })),
    "SKIP",
  );
});

Deno.test("SKIP when only activityCount > 0 — webhook noise, not meaningful activity", () => {
  assertEquals(determineTier(data({ activityCount: 42 })), "SKIP");
});

Deno.test(`SKIP when team comments below threshold (${TEAM_COMMENTS_ACTIVITY_THRESHOLD})`, () => {
  assertEquals(determineTier(data({ teamCommentsTotal: 2 })), "SKIP");
});

Deno.test(`FULL when team comments reach threshold (${TEAM_COMMENTS_ACTIVITY_THRESHOLD})`, () => {
  assertEquals(
    determineTier(data({ teamCommentsTotal: TEAM_COMMENTS_ACTIVITY_THRESHOLD })),
    "FULL",
  );
});

Deno.test("FULL when at least one task was completed this week", () => {
  assertEquals(
    determineTier(data({ completed: [{ taskId: "t1", taskName: "x" }] })),
    "FULL",
  );
});

Deno.test("FULL when peer activity present (client colleague engaged)", () => {
  assertEquals(
    determineTier(data({
      peerActivity: [{ taskId: "t1", taskName: "x", count: 1, authorLabel: "Nadin" }],
    })),
    "FULL",
  );
});

Deno.test("FULL when a new project was created within the week", () => {
  assertEquals(
    determineTier(data({
      activeProjects: [{
        id: "p1", name: "Blog", type: null, startDate: null,
        targetDate: null, createdWithinWeek: true, tasks: [],
      }],
    })),
    "FULL",
  );
});

Deno.test("SKIP when project exists but was NOT created this week", () => {
  assertEquals(
    determineTier(data({
      activeProjects: [{
        id: "p1", name: "Old", type: null, startDate: null,
        targetDate: null, createdWithinWeek: false, tasks: [],
      }],
    })),
    "SKIP",
  );
});
