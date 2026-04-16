# Phase 10: org-edge-functions — Pattern Map

**Mapped:** 2026-04-14
**Files analyzed:** 10
**Analogs found:** 10 / 10

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/functions/_shared/org.ts` | utility | request-response | `supabase/functions/_shared/cors.ts` | role-match (shared utility module) |
| `supabase/functions/fetch-clickup-tasks/index.ts` | service | request-response | self (MODIFY — lines 358–373 replace profiles read) | exact |
| `supabase/functions/fetch-single-task/index.ts` | service | request-response | self (MODIFY — lines 207–222 replace profiles read) | exact |
| `supabase/functions/nextcloud-files/index.ts` | service | file-I/O | self (MODIFY — 7 profile read locations hoisted to 1) | exact |
| `supabase/functions/create-clickup-task/index.ts` | service | request-response | self (MODIFY — lines 280–288 replace profiles read + role guard) | exact |
| `supabase/functions/post-task-comment/index.ts` | service | request-response | `supabase/functions/update-task-status/index.ts` | exact (both need role guard only) |
| `supabase/functions/update-task-status/index.ts` | service | request-response | `supabase/functions/post-task-comment/index.ts` | exact (both need role guard only) |
| `supabase/functions/clickup-webhook/index.ts` | service | event-driven | self (MODIFY — `findProfilesForTask` + support fan-out) | exact |
| `supabase/functions/send-reminders/index.ts` | service | batch | self (MODIFY — sendTicketReminders + sendProjectReminders restructure) | exact |
| `supabase/functions/invite-member/index.ts` | service | request-response | `supabase/functions/create-clickup-task/index.ts` | role-match (same auth/admin pattern) |

---

## Pattern Assignments

### `supabase/functions/_shared/org.ts` (utility, shared helper)

**Analog:** `supabase/functions/_shared/cors.ts` (shared utility with named exports)

**Imports pattern** (`cors.ts` lines 1–0, established shared-module convention):
```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
```

**Core pattern — named export functions, no default export:**
Shared helpers export named functions. Callers import by name:
```typescript
// cors.ts pattern
export function isAllowedOrigin(origin: string | null): boolean { ... }
export function getCorsHeaders(origin: string | null): Record<string, string> { ... }
export const corsHeaders = { ... };
```

**Supabase client type annotation pattern** (used across all functions):
```typescript
// Pattern from fetch-clickup-tasks/index.ts line 520, fetch-single-task/index.ts line 330
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
// Type: ReturnType<typeof createClient>
```

**The full proposed interface for `_shared/org.ts` is specified verbatim in RESEARCH.md Section 2** (lines 196–328). Extract exactly those 5 exported functions:
- `OrgConfig` interface
- `getOrgForUser(supabaseAdmin, userId): Promise<OrgConfig | null>`
- `getOrgMemberIds(supabaseAdmin, organizationId): Promise<string[]>`
- `getUserOrgRole(supabaseAdmin, userId): Promise<string | null>`
- `findOrgByListId(supabaseAdmin, listId): Promise<{ organizationId, profileIds } | null>`
- `findOrgBySupportTaskId(supabaseAdmin, taskId): Promise<{ organizationId, profileIds } | null>`

---

### `supabase/functions/fetch-clickup-tasks/index.ts` (service, request-response — MODIFY)

**Analog:** self — exact lines to replace

**Existing imports** (lines 1–4, no change):
```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders, corsHeaders as defaultCorsHeaders } from "../_shared/cors.ts";
import { parseClickUpTimestamp } from "../_shared/utils.ts";
import { getVisibilityFromFields } from "../_shared/clickup-contract.ts";
```

**New import to add:**
```typescript
import { getOrgForUser } from "../_shared/org.ts";
```

**Auth + service client pattern** (lines 339–354 — anon client; lines 518–520 — service client):
```typescript
// Anon client (user JWT)
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { headers: { Authorization: authHeader } },
});
const token = authHeader.replace("Bearer ", "");
const { data: { user }, error: userError } = await supabase.auth.getUser(token);
if (userError || !user) {
  return new Response(
    JSON.stringify({ error: "Unauthorized" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// Service role client (for org_members — bypasses RLS)
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (supabaseServiceKey) {
  const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
  // ... admin writes
}
```

**Profiles read to REPLACE** (lines 358–373 — the block to swap):
```typescript
// BEFORE (remove this):
const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("clickup_list_ids")
  .eq("id", user.id)
  .single();
if (profileError) {
  return new Response(
    JSON.stringify({ error: "Failed to fetch user profile" }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
const listIds = profile?.clickup_list_ids || [];

// AFTER (dual-read pattern):
const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const org = await getOrgForUser(supabaseAdmin, user.id);
const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("clickup_list_ids")
  .eq("id", user.id)
  .single();
if (profileError) {
  return new Response(
    JSON.stringify({ error: "Failed to fetch user profile" }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
const listIds = org?.clickup_list_ids ?? profile?.clickup_list_ids ?? [];
```

**Error response format** (consistent throughout):
```typescript
return new Response(
  JSON.stringify({ error: "message" }),
  { status: NNN, headers: { ...corsHeaders, "Content-Type": "application/json" } }
);
```

---

### `supabase/functions/fetch-single-task/index.ts` (service, request-response — MODIFY)

**Analog:** self — exact lines to replace

**New import to add:**
```typescript
import { getOrgForUser } from "../_shared/org.ts";
```

**Profiles read to REPLACE** (lines 207–222):
```typescript
// BEFORE:
const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("clickup_list_ids")
  .eq("id", user.id)
  .single();
if (profileError) { ... }
const userListIds = profile?.clickup_list_ids || [];

// AFTER:
const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const org = await getOrgForUser(supabaseAdmin, user.id);
const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("clickup_list_ids")
  .eq("id", user.id)
  .single();
if (profileError) { ... }
const userListIds = org?.clickup_list_ids ?? profile?.clickup_list_ids ?? [];
```

**Service role client creation** (line 330 — existing pattern for cache write):
```typescript
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (supabaseServiceKey) {
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  // ...
}
```
Note: for Phase 10 the org lookup needs `supabaseAdmin` before the profile query. The existing service client at line 330 is created later in the handler. Create the admin client earlier and reuse it for both org lookup and cache write.

---

### `supabase/functions/nextcloud-files/index.ts` (service, file-I/O — MODIFY)

**Analog:** self — existing multi-action handler pattern

**Existing dual-client setup** (lines 302–338 — already present, already correct pattern):
```typescript
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  return new Response(
    JSON.stringify({ ok: false, code: "SERVER_ERROR", correlationId: requestId }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { headers: { Authorization: authHeader } },
});
// ... getUser verify ...
const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
```

**New import to add:**
```typescript
import { getOrgForUser } from "../_shared/org.ts";
```

**Strategy — hoist org lookup before action dispatch:**
The 7 profile reads (lines 804, 929, 1006, 1123, 1220, 1344, 1506) all read `nextcloud_client_root`. Replace ALL 7 with a single lookup immediately after user verification, before the action routing block:

```typescript
// After user verification, before if (action === "browse-client") {
const supabaseAdmin = supabaseService; // already constructed at line 338
const org = await getOrgForUser(supabaseAdmin, user.id);
const { data: profileRow } = await supabase
  .from("profiles")
  .select("nextcloud_client_root")
  .eq("id", user.id)
  .maybeSingle();
const clientRoot = org?.nextcloud_client_root ?? profileRow?.nextcloud_client_root ?? null;
```

Then in each action block, use the pre-resolved `clientRoot` instead of re-querying profiles. Each action's existing "profile not found" guard becomes:
```typescript
if (!clientRoot) {
  return new Response(
    JSON.stringify({ ok: false, code: "NEXTCLOUD_NOT_CONFIGURED", ... }),
    { status: 200, ... }
  );
}
```

**Existing per-action profile read pattern** (lines 803–817 — example for browse-client):
```typescript
const { data: profileRow, error: profileErr } = await supabase
  .from("profiles")
  .select("nextcloud_client_root")
  .eq("id", user.id)
  .maybeSingle();

if (profileErr || !profileRow) {
  return new Response(
    JSON.stringify({ ok: false, code: "FORBIDDEN", correlationId: requestId }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
const clientRoot: string | null = profileRow.nextcloud_client_root;
```
This pattern repeats 7 times — all 7 are eliminated by the hoisted lookup above.

---

### `supabase/functions/create-clickup-task/index.ts` (service, request-response — MODIFY)

**Analog:** self — exact lines to replace, plus role guard addition

**New import to add:**
```typescript
import { getOrgForUser, getUserOrgRole } from "../_shared/org.ts";
```

**Existing service role client** (line 357 — already present):
```typescript
const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || supabaseAnonKey);
```

**Role guard to add** — insert after user verification, before body parse (~line 194):
```typescript
// ORG-BE-11: Role guard — viewer cannot create tasks
const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || supabaseAnonKey);
const role = await getUserOrgRole(supabaseAdmin, user.id);
if (role === 'viewer') {
  return new Response(
    JSON.stringify({ error: 'Insufficient permissions' }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

**Profiles read to REPLACE** (lines 280–308):
```typescript
// BEFORE:
const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("clickup_list_ids, full_name, clickup_chat_channel_id")
  .eq("id", user.id)
  .single();
// ...
const listIds = profile?.clickup_list_ids || [];
// listId = listIds[0]

// AFTER — org for list/chat, profile still for full_name:
const org = await getOrgForUser(supabaseAdmin, user.id); // supabaseAdmin already constructed for role guard
const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("clickup_list_ids, full_name, clickup_chat_channel_id")
  .eq("id", user.id)
  .single();
if (profileError) { ... }
// Dual-read fallback:
const listIds = org?.clickup_list_ids ?? profile?.clickup_list_ids ?? [];
const chatChannelId = org?.clickup_chat_channel_id ?? profile?.clickup_chat_channel_id ?? null;
const fullName = profile?.full_name; // full_name stays in profiles — no fallback needed
```

---

### `supabase/functions/post-task-comment/index.ts` (service, request-response — MODIFY)

**Analog:** `supabase/functions/update-task-status/index.ts` (identical change needed)

**New import to add:**
```typescript
import { getUserOrgRole } from "../_shared/org.ts";
```

**Existing service client construction** (line 336):
```typescript
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
```

**Role guard to add** — insert after user verification (after line 370), before comment validation:
```typescript
// ORG-BE-11: Role guard — viewer cannot post comments
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (supabaseServiceKey) {
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const role = await getUserOrgRole(supabaseAdmin, user.id);
  if (role === 'viewer') {
    return new Response(
      JSON.stringify({ error: 'Insufficient permissions' }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
```

**No profiles changes** — `full_name` stays in profiles (lines 375–381 unchanged).

---

### `supabase/functions/update-task-status/index.ts` (service, request-response — MODIFY)

**Analog:** `supabase/functions/post-task-comment/index.ts` (identical change)

**New import to add:**
```typescript
import { getUserOrgRole } from "../_shared/org.ts";
```

**Existing service client pattern** (line 141):
```typescript
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
```

**Role guard to add** — insert after user verification (after line 173), before action validation:
```typescript
// ORG-BE-11: Role guard — viewer cannot update task status
if (supabaseServiceKey) {
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const role = await getUserOrgRole(supabaseAdmin, userId);
  if (role === 'viewer') {
    return new Response(
      JSON.stringify({ error: 'Insufficient permissions' }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
```

**No profiles changes** — `full_name` stays in profiles (multiple reads at lines 404, 518, 580, 661 are unchanged).

---

### `supabase/functions/clickup-webhook/index.ts` (service, event-driven — MODIFY)

**Analog:** self — `findProfilesForTask` function (lines 345–402) and support chat block (lines 1820–1886)

**New import to add:**
```typescript
import { findOrgByListId, findOrgBySupportTaskId } from "../_shared/org.ts";
```

**Existing service role client** (line 226 — already in webhook handler):
```typescript
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
```

**`ProfileResolutionSource` type — extend** (line 345):
```typescript
// BEFORE:
type ProfileResolutionSource = "task_cache" | "list_fallback" | "none" | "ambiguous_fallback";
// AFTER:
type ProfileResolutionSource = "org_members" | "task_cache" | "list_fallback" | "none" | "ambiguous_fallback";
```

**`findProfilesForTask` — new 3-step logic** (replaces lines 357–402):
```typescript
async function findProfilesForTask(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  listId: string | null,
  log: ReturnType<typeof createLogger>
): Promise<ProfileResolutionResult> {
  // Step 1 (NEW): org_members primary lookup
  if (listId) {
    const orgResult = await findOrgByListId(supabase, listId);
    if (orgResult && orgResult.profileIds.length > 0) {
      log.info("Profiles resolved via org_members", { taskId, count: orgResult.profileIds.length });
      return { profileIds: orgResult.profileIds, source: "org_members" };
    }
  }

  // Step 2 (existing): task_cache fallback
  const { data: cacheEntries } = await supabase
    .from("task_cache")
    .select("profile_id")
    .eq("clickup_id", taskId);
  if (cacheEntries && cacheEntries.length > 0) {
    const ids = Array.from(new Set(cacheEntries.map((e: { profile_id: string }) => e.profile_id)));
    log.info("Profiles resolved via task_cache", { taskId, count: ids.length });
    return { profileIds: ids, source: "task_cache" };
  }

  // Step 3 (existing): profiles.clickup_list_ids list_fallback
  // ... (keep existing code lines 374–401 unchanged)
}
```

**Support chat fan-out — replace block** (lines 1820–1886):
```typescript
// BEFORE (single profile):
const { data: supportProfiles } = await supabase
  .from("profiles")
  .select("id, email, full_name, email_notifications, notification_preferences")
  .eq("support_task_id", normalizedTaskId);
// ... uses supportProfiles[0] throughout

// AFTER (org fan-out with fallback):
const orgResult = await findOrgBySupportTaskId(supabase, normalizedTaskId);
let supportProfileIds: string[];
if (orgResult && orgResult.profileIds.length > 0) {
  supportProfileIds = orgResult.profileIds;
  log.info("Support task resolved via org", { count: supportProfileIds.length });
} else {
  // Fallback: existing profiles.support_task_id lookup
  const { data: supportProfiles } = await supabase
    .from("profiles")
    .select("id")
    .eq("support_task_id", normalizedTaskId);
  supportProfileIds = (supportProfiles || []).map((p: { id: string }) => p.id);
}

// Fan-out: loop over supportProfileIds
for (const profileId of supportProfileIds) {
  // comment_cache upsert (existing structure, per profileId)
  await supabase.from("comment_cache").upsert({
    clickup_comment_id: commentId,
    task_id: taskId,
    profile_id: profileId,  // was: profile.id (single)
    // ... rest unchanged
  }, { onConflict: "clickup_comment_id,profile_id" });

  // notification insert (existing structure, per profileId)
  await supabase.from("notifications").insert({
    profile_id: profileId,  // was: profile.id (single)
    // ... rest unchanged
  });
}
```

**Note on `supabase` client in webhook:** The webhook uses `supabase` (service role) throughout — `findOrgByListId` and `findOrgBySupportTaskId` expect the admin client. Pass the service role `supabase` directly.

---

### `supabase/functions/send-reminders/index.ts` (service, batch — MODIFY)

**Analog:** self — `sendTicketReminders` (lines 514–652) and `sendProjectReminders` (lines 655–784)

**New import to add:**
```typescript
import { getOrgMemberIds } from "../_shared/org.ts";
```

**Existing service role client** (lines 508–511 — already uses service role):
```typescript
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
```

**`sendTicketReminders` restructure — new org-first loop:**

Replace the profile-centric query + `profileMap` loop (lines 514–652) with an org-centric loop:

```typescript
// 1. Query org admins with their profile data
const { data: orgAdminRows } = await supabase
  .from("org_members")
  .select(`
    organization_id,
    profile_id,
    organizations!inner ( id, name, clickup_list_ids ),
    profiles!inner (
      email,
      full_name,
      email_notifications,
      notification_preferences,
      last_reminder_sent_at
    )
  `)
  .eq("role", "admin")
  .eq("profiles.email_notifications", true);

// 2. For each org admin, query task_cache for their org's list_ids
for (const adminRow of orgAdminRows || []) {
  const org = adminRow.organizations as { id: string; name: string; clickup_list_ids: string[] };
  const profile = adminRow.profiles as { email: string; full_name: string | null; ... };

  // Get all tasks pending for this org
  const { data: orgTasks } = await supabase
    .from("task_cache")
    .select("clickup_id, name, status, last_activity_at")
    .in("status", ["client review", "awaiting approval"])
    .eq("is_visible", true)
    .in("list_id", org.clickup_list_ids);

  if (!orgTasks || orgTasks.length === 0) continue;

  // Apply 5-day cooldown against admin's last_reminder_sent_at
  const lastReminder = profile.last_reminder_sent_at;
  const cooldownMs = 5 * 24 * 60 * 60 * 1000;
  if (lastReminder && Date.now() - new Date(lastReminder).getTime() < cooldownMs) {
    skipped++;
    continue;
  }

  // Send email to admin only (existing email send pattern — unchanged)
  // Update profiles.last_reminder_sent_at on admin's profile (existing pattern — unchanged)
}
```

**Email send pattern** (existing — copy from lines 600–650, unchanged):
```typescript
const mailjetApiKey = Deno.env.get("MAILJET_API_KEY");
const mailjetSecretKey = Deno.env.get("MAILJET_SECRET_KEY");
// ... buildReminderHtml + fetch to Mailjet API
```

**`sendProjectReminders` restructure** — same pattern but query `project_task_cache` filtered by org's project_config_ids:
```typescript
// For each org, find project_config_ids via project_access for any org member
const allOrgMemberIds = await getOrgMemberIds(supabase, org.id);
const { data: accessRows } = await supabase
  .from("project_access")
  .select("project_config_id")
  .in("profile_id", allOrgMemberIds);
// Then query project_task_cache filtered by those project_config_ids
// Send to org admin only (3-day cooldown via profiles.last_project_reminder_sent_at)
```

---

### `supabase/functions/invite-member/index.ts` (service, request-response — NEW)

**Analog:** `supabase/functions/create-clickup-task/index.ts` (same auth+admin pattern, same response format)

**Imports pattern** (copy from create-clickup-task, adapt):
```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders, corsHeaders } from "../_shared/cors.ts";
import { getEmailCopy } from "../_shared/emailCopy.ts";
import { getUserOrgRole } from "../_shared/org.ts";
```

**Cors preflight pattern** (universal — from any existing function):
```typescript
if (req.method === "OPTIONS") {
  const origin = req.headers.get("origin");
  return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
}
```

**Auth + anon client pattern** (lines 340–354 of fetch-clickup-tasks):
```typescript
const authHeader = req.headers.get("authorization") ?? "";
if (!authHeader.startsWith("Bearer ")) {
  return new Response(
    JSON.stringify({ error: "Unauthorized" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { headers: { Authorization: authHeader } },
});
const token = authHeader.replace("Bearer ", "");
const { data: { user }, error: userError } = await supabase.auth.getUser(token);
if (userError || !user) {
  return new Response(
    JSON.stringify({ error: "Unauthorized" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

**Service role / admin client** (same pattern used in create-clickup-task line 357):
```typescript
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
```

**Admin role guard — SPECIFIC ORG** (RESEARCH.md Section 3 — critical nuance):
```typescript
// Must check role for the SPECIFIC organizationId from request body
const { data: roleRow } = await supabaseAdmin
  .from("org_members")
  .select("role")
  .eq("profile_id", user.id)
  .eq("organization_id", organizationId)
  .maybeSingle();
if (roleRow?.role !== "admin") {
  return new Response(
    JSON.stringify({ error: "Insufficient permissions" }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

**Auth admin API pattern** (from RESEARCH.md Section 3):
```typescript
// Create user
const { data: { user: newUser }, error: createError } =
  await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
  });

// Generate recovery link (GoTrue SMTP broken — use recovery link, NOT inviteUserByEmail)
const { data: { properties }, error: linkError } =
  await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: "/passwort-setzen" },
  });
const recoveryUrl = properties.action_link;
```

**Email send pattern — direct Mailjet** (copy from send-reminders `sendMail` helper, lines ~620–650):
```typescript
const mailjetApiKey = Deno.env.get("MAILJET_API_KEY");
const mailjetSecretKey = Deno.env.get("MAILJET_SECRET_KEY");
const emailCopy = getEmailCopy("invite", "de");
// Build HTML, POST to https://api.mailjet.com/v3.1/send
```

**Rollback pattern on email failure** (locked decision):
```typescript
if (!emailSent) {
  await supabaseAdmin.auth.admin.deleteUser(newUser.id);
  return new Response(
    JSON.stringify({ error: "Email send failed — invite rolled back" }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

**org_members + project_access insert** (after successful email):
```typescript
await supabaseAdmin.from("org_members").insert({
  organization_id: organizationId,
  profile_id: newUser.id,
  role: inviteeRole, // "member" | "viewer" from request body
});

// Copy project_access from org admin
const { data: adminMember } = await supabaseAdmin
  .from("org_members")
  .select("profile_id")
  .eq("organization_id", organizationId)
  .eq("role", "admin")
  .limit(1)
  .maybeSingle();

if (adminMember) {
  const { data: adminAccess } = await supabaseAdmin
    .from("project_access")
    .select("project_config_id")
    .eq("profile_id", adminMember.profile_id);

  for (const row of adminAccess || []) {
    await supabaseAdmin.from("project_access").insert({
      profile_id: newUser.id,
      project_config_id: row.project_config_id,
    });
  }
}
```

**Request body shape:**
```typescript
const { organizationId, email, role }: { organizationId: string; email: string; role: "member" | "viewer" } = await req.json();
```

**Router registration:** No edit to `main/index.ts` needed. Creating the folder `supabase/functions/invite-member/` with `index.ts` auto-registers via the `servicePath = /home/deno/functions/${service_name}` dispatch pattern (main/index.ts line 66).

---

## Shared Patterns

### Dual-Read Fallback (ALL 5 data-read functions)

**Source:** Locked in CONTEXT.md, verified in RESEARCH.md Section 2
**Apply to:** `fetch-clickup-tasks`, `fetch-single-task`, `nextcloud-files`, `create-clickup-task`, `send-reminders`

```typescript
// Pattern: org first, fall back to profile, then empty default
const listIds = org?.clickup_list_ids ?? profile?.clickup_list_ids ?? [];
const nextcloudRoot = org?.nextcloud_client_root ?? profile?.nextcloud_client_root ?? null;
const supportTaskId = org?.support_task_id ?? profile?.support_task_id ?? null;
const chatChannelId = org?.clickup_chat_channel_id ?? profile?.clickup_chat_channel_id ?? null;
```

### Auth Guard + 401 Response

**Source:** `supabase/functions/fetch-clickup-tasks/index.ts` lines 344–354
**Apply to:** All functions (already present in all existing functions; `invite-member` copies the same)

```typescript
const token = authHeader.replace("Bearer ", "");
const { data: { user }, error: userError } = await supabase.auth.getUser(token);
if (userError || !user) {
  log.error("Failed to verify token", { error: userError?.message });
  return new Response(
    JSON.stringify({ error: "Unauthorized" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

### Viewer Role Guard + 403 Response

**Source:** RESEARCH.md Section 6 (Option B — no org_id needed)
**Apply to:** `create-clickup-task`, `post-task-comment`, `update-task-status`

```typescript
const role = await getUserOrgRole(supabaseAdmin, user.id);
if (role === 'viewer') {
  return new Response(
    JSON.stringify({ error: 'Insufficient permissions' }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
// Legacy fallback: getUserOrgRole returns null → no org_members row → treat as 'member' (permissive)
```

### Service Role Client Construction

**Source:** `supabase/functions/nextcloud-files/index.ts` line 338
**Apply to:** All Phase 10 functions (already present in most)

```typescript
const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
// OR the conditional variant:
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (supabaseServiceKey) {
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
}
```

### Error Response Format

**Source:** All existing functions (universal)
**Apply to:** All functions

```typescript
return new Response(
  JSON.stringify({ error: "message" }),
  { status: NNN, headers: { ...corsHeaders, "Content-Type": "application/json" } }
);
```

### CORS Preflight

**Source:** All existing functions (universal)
**Apply to:** `invite-member` (new function)

```typescript
const origin = req.headers.get("origin");
const corsHeaders = getCorsHeaders(origin);
if (req.method === "OPTIONS") {
  return new Response(null, { status: 204, headers: corsHeaders });
}
```

---

## No Analog Found

All files have close analogs. No entries.

---

## Metadata

**Analog search scope:** `supabase/functions/` (all Edge Functions)
**Files scanned:** 10 modified/new files + 6 existing functions read as analogs
**Pattern extraction date:** 2026-04-14
