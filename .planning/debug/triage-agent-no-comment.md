---
status: diagnosed
trigger: "После создания задачи в ClickUp, triage agent не присылает никакого комментария. Edge Function не вызывается (или не выполняется до конца)."
created: 2026-04-06T00:00:00Z
updated: 2026-04-06T00:05:00Z
symptoms_prefilled: true
goal: find_root_cause_only
---

## Current Focus

hypothesis: Multiple independent failure points identified. Primary suspect: TRIAGE_ENABLED_LIST_IDS not configured in environment (either empty or missing). Secondary: taskCreated event not subscribed in the ClickUp webhook registration. Tertiary: project routing early-return intercepts taskCreated before triage code is reached.
test: All layers read — evidence gathered
expecting: User confirms which precondition is missing
next_action: return diagnosis to user

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: After task creation in ClickUp, triage agent posts a comment on the task
actual: No comment is posted — Edge Function not invoked or does not complete
errors: none reported
reproduction: create a task in ClickUp in a monitored list
started: unknown / possibly never worked

## Eliminated

- hypothesis: triage-agent Edge Function does not exist or was not deployed
  evidence: supabase/functions/triage-agent/index.ts exists (435 lines, complete implementation); CI workflow deploys it
  timestamp: 2026-04-06T00:03:00Z

- hypothesis: agent_jobs table missing (would cause DB_ERROR return from triage-agent)
  evidence: migration 20260406000000_create_agent_jobs.sql exists and is complete
  timestamp: 2026-04-06T00:03:00Z

- hypothesis: main router does not route to triage-agent
  evidence: main/index.ts routes all functions dynamically by service_name extracted from URL path — no static route table needed
  timestamp: 2026-04-06T00:03:00Z

- hypothesis: handleTaskCreated is not present in clickup-webhook
  evidence: handleTaskCreated exists at lines 405-474; dispatch at line 1180-1187
  timestamp: 2026-04-06T00:03:00Z

## Evidence

- timestamp: 2026-04-06T00:01:00Z
  checked: supabase/functions/clickup-webhook/index.ts lines 1097-1187
  found: taskCreated for PROJECT tasks hits the project routing block (lines 1097-1168) which ends with `return new Response(...)` at line 1166 — it NEVER falls through to triage code at line 1180. The triage block at 1180 is only reached for NON-project tasks.
  implication: If the list where the task is created is configured as a project list in project_config, the triage block is never reached regardless of TRIAGE_ENABLED_LIST_IDS.

- timestamp: 2026-04-06T00:01:30Z
  checked: supabase/functions/clickup-webhook/index.ts lines 417-421
  found: |
    const enabledListIdsRaw = Deno.env.get("TRIAGE_ENABLED_LIST_IDS") ?? "";
    const enabledListIds = enabledListIdsRaw.split(",").map(s => s.trim()).filter(Boolean);
    if (enabledListIds.length === 0) {
      log.debug("TRIAGE_ENABLED_LIST_IDS not configured — skipping triage");
      return;
    }
  implication: If TRIAGE_ENABLED_LIST_IDS is empty string or not set, triage silently skips. This is the most likely cause.

- timestamp: 2026-04-06T00:02:00Z
  checked: supabase/functions/.env.example, triage-agent-setup.md
  found: TRIAGE_ENABLED_LIST_IDS is listed as a new env var requiring manual setup. The setup guide (Section 4) explicitly states the ClickUp webhook must be re-registered to include the 'taskCreated' event. The current webhook was previously subscribed to 'taskStatusUpdated', 'taskCommentPosted', 'taskTagUpdated' — taskCreated was NOT in the original subscription.
  implication: Even if TRIAGE_ENABLED_LIST_IDS is set, if the ClickUp webhook was never re-registered, ClickUp never sends taskCreated events to the function at all.

- timestamp: 2026-04-06T00:02:30Z
  checked: supabase/functions/clickup-webhook/index.ts line 464
  found: supabase.functions.invoke("triage-agent", { body: {...} }) — fire-and-forget, no await. This calls /functions/v1/triage-agent on SUPABASE_URL using SUPABASE_SERVICE_ROLE_KEY as the auth bearer token.
  implication: On production (self-hosted), VERIFY_JWT=true means main/index.ts verifies the JWT. The service role key is a valid JWT signed with JWT_SECRET — this should pass. On staging (Cloud Supabase), verify_jwt was recently set to false via the a24d42e fix. This should also work now.

- timestamp: 2026-04-06T00:03:00Z
  checked: git log — commit a24d42e "fix(staging): remove FUNCTIONS_VERIFY_JWT from sync, auto-disable verify_jwt on all functions"
  found: This recent fix (latest commit) explicitly resolves JWT verification for staging. Before this fix, functions.invoke from within an Edge Function would fail JWT verification on Cloud Supabase because it signs with ES256 but the main router expected HS256 (JWT_SECRET).
  implication: On staging, triage-agent invocations were definitely failing before this fix if the invoke happened — but the invoke may also never have been triggered (see points above).

- timestamp: 2026-04-06T00:04:00Z
  checked: triage-agent-setup.md Section 4
  found: Setup explicitly requires manual re-registration of the ClickUp webhook. The curl commands are documented. This step has a prerequisite checkbox: "ClickUp webhook re-registered to include the taskCreated event".
  implication: This is a one-time manual setup action. There is no code to do this automatically. If this was skipped, no taskCreated events ever arrive.

## Resolution

root_cause: |
  Three independent failure points form the chain. ANY ONE of them breaks the entire flow:

  1. PRIMARY — ClickUp webhook not re-registered for 'taskCreated' event
     The original webhook subscription does not include 'taskCreated'. ClickUp never sends
     taskCreated payloads to the Edge Function. This alone silently breaks the entire chain
     before any code runs. (Setup guide Section 4 requires manual curl re-registration.)

  2. SECONDARY — TRIAGE_ENABLED_LIST_IDS not configured (or empty)
     The env var is a new Phase 6 secret requiring manual setup in Coolify.
     If empty/missing, handleTaskCreated returns at line 419 with a debug log only.
     No agent_jobs row is created, no triage-agent invocation happens.

  3. CONDITIONAL — Project routing early-return intercepts taskCreated for project lists
     If the task is created in a list that maps to project_config (is_active=true),
     the webhook handler returns at line 1166 (project routing block) and never
     reaches the triage dispatch at line 1180. Triage only runs for non-project tasks.

fix: not applicable (goal: find_root_cause_only)
verification: not applicable (goal: find_root_cause_only)
files_changed: []
