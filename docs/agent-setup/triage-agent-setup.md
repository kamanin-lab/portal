# KAMANDA Triage Agent — Setup Guide

## Overview

The KAMANDA Triage Agent automatically estimates time and cost for new ClickUp tasks.
When a task is created in a monitored list, the agent fetches optional WordPress site context
via Maxi AI Core, calls Claude Haiku (via OpenRouter), and posts a structured `[Triage]` comment
to the ClickUp task within 15 seconds. A developer then replies `[approve]` or `[reject]`
in ClickUp, and the webhook updates the `agent_jobs` database record accordingly.

## Prerequisites

- [ ] Maxi AI Core v3+ installed and active on the WordPress site (required for site audit)
- [ ] WordPress Application Password created for the service account user (`kamanin-agent`)
- [ ] ClickUp list IDs identified for all lists to be monitored by the triage agent
- [ ] `OPENROUTER_API_KEY` configured in Coolify (already used by `fetch-project-tasks`)
- [ ] Environment variables `TRIAGE_ENABLED_LIST_IDS`, `WP_MCP_USER`, `WP_MCP_APP_PASS` set in Coolify
- [ ] ClickUp webhook re-registered to include the `taskCreated` event (see Section 4)
- [ ] `agent_jobs` migration applied to the production database

## 1. Configure Environment Variables

Add the following to **Coolify → Edge Functions → Environment Variables**
(or run `npx tsx scripts/sync-staging-secrets.ts` for staging):

| Variable | Description | Format |
|----------|-------------|--------|
| `TRIAGE_ENABLED_LIST_IDS` | Comma-separated ClickUp list IDs to monitor | `901305442177,901305442178` |
| `WP_MCP_USER` | WordPress username for Maxi AI Core REST API auth | `kamanin-agent` |
| `WP_MCP_APP_PASS` | WordPress Application Password for `WP_MCP_USER` | `xxxx xxxx xxxx xxxx xxxx xxxx` |

`OPENROUTER_API_KEY` is already set in production — it is shared between `fetch-project-tasks`
and `triage-agent`. No additional key is needed.

See `supabase/functions/.env.example` for the full list of Edge Function secrets and their sources.

### Finding ClickUp List IDs

Open ClickUp and navigate to the list you want to monitor. The list ID is in the URL:

```
https://app.clickup.com/t/901305442177/...
                            ^^^^^^^^^^^^
                            This is the list ID
```

Set `TRIAGE_ENABLED_LIST_IDS=901305442177` (multiple lists: comma-separated, no spaces).

Example: `TRIAGE_ENABLED_LIST_IDS=901305442177,901305442178`

## 2. Configure WordPress Application Password

The triage agent authenticates with the WordPress site using a WordPress Application Password.
This is required for Maxi AI Core REST API access (site audit feature).

1. Log in to **WordPress Admin** on the client's WordPress site
2. Go to **Users → All Users** and open the service account user (`kamanin-agent`)
3. Scroll down to the **Application Passwords** section
4. In the "New Application Password Name" field, enter: `KAMANIN Triage Agent`
5. Click **Add New Application Password**
6. Copy the generated password — it is shown **only once** and has the format:
   `xxxx xxxx xxxx xxxx xxxx xxxx` (spaces are part of the password, keep them)
7. Set the following in Coolify → Edge Functions → Environment Variables:
   - `WP_MCP_USER` = the WordPress username (e.g. `kamanin-agent`)
   - `WP_MCP_APP_PASS` = the password you just copied (with spaces)

If the Application Passwords section is not visible, the site may have it disabled via
a plugin or `define('WP_APPLICATION_PASSWORDS_ENABLED', false)` in `wp-config.php`.

## 3. Enable WordPress Site Audit for a Client

The triage agent fetches WordPress site context (plugins, WP version, product count) when
a `wp_mcp_url` is set on the client's profile. Without this, triage still works but without
site-specific context.

**Enable WP site audit for a client:**

```sql
UPDATE profiles
SET wp_mcp_url = 'https://staging.client-site.com'
WHERE email = 'client@example.com';
```

The URL must be the WordPress site root (no trailing slash). Maxi AI Core must be installed
and active at that URL, and `WP_MCP_USER` / `WP_MCP_APP_PASS` must be valid credentials.

**Disable (revert to audit-less triage):**

```sql
UPDATE profiles
SET wp_mcp_url = NULL
WHERE email = 'client@example.com';
```

When `wp_mcp_url` is NULL, the `[Triage]` comment is posted without the "Site context" line.
Triage always completes — the audit is optional and its failure never blocks the estimate.

## 4. Re-register the ClickUp Webhook

The existing ClickUp webhook must be updated to subscribe to the `taskCreated` event.
The current webhook only handles `taskStatusUpdated` and `taskCommentPosted`.

**Step 1: Find the existing webhook ID**

```bash
curl https://api.clickup.com/api/v2/team/{TEAM_ID}/webhook \
  -H "Authorization: {CLICKUP_API_TOKEN}"
```

Note the `id` field of the webhook pointing to `https://portal.db.kamanin.at/functions/v1/clickup-webhook`.

**Step 2: Delete the existing webhook**

```bash
curl -X DELETE https://api.clickup.com/api/v2/webhook/{WEBHOOK_ID} \
  -H "Authorization: {CLICKUP_API_TOKEN}"
```

**Step 3: Re-create the webhook with `taskCreated` added**

```bash
curl -X POST https://api.clickup.com/api/v2/team/{TEAM_ID}/webhook \
  -H "Authorization: {CLICKUP_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "https://portal.db.kamanin.at/functions/v1/clickup-webhook",
    "events": ["taskCreated", "taskStatusUpdated", "taskCommentPosted", "taskTagUpdated"]
  }'
```

Replace `{TEAM_ID}` with your ClickUp Workspace ID (same as `CLICKUP_WORKSPACE_ID` env var)
and `{CLICKUP_API_TOKEN}` with your token (same as `CLICKUP_API_TOKEN` env var).

Note: `taskTagUpdated` is included because it was already subscribed before this update.
The new registration includes all four events.

## 5. Verify the Triage Flow

After configuring environment variables and re-registering the webhook:

1. **Create a test task** in a monitored ClickUp list (one whose ID is in `TRIAGE_ENABLED_LIST_IDS`)
2. **Wait up to 15 seconds**
3. **Check the `agent_jobs` table** in Supabase:

   ```sql
   SELECT id, status, clickup_task_id, clickup_task_name, audit_fetched, cost_usd, created_at
   FROM agent_jobs
   ORDER BY created_at DESC
   LIMIT 5;
   ```

4. **Expected result:** a row with `status = 'awaiting_hitl'` and `clickup_comment_id` set
5. **In ClickUp:** a `[Triage]` comment should appear on the task within 15 seconds

If the row shows `status = 'failed'`, check `error_message` in the same row for details.

If no row appears at all, the list ID is likely not in `TRIAGE_ENABLED_LIST_IDS`, or the
webhook was not re-registered (Section 4).

## 6. Test the HITL Loop

After the `[Triage]` comment appears on a ClickUp task:

1. **Reply to the `[Triage]` comment** with one of:
   - `[approve]` — accepts the estimate as-is
   - `[approve: 3h 5cr]` — accepts with corrections (3 hours, 5 credits)
   - `[reject: need more details]` — rejects with a reason

   The reply must match the pattern exactly (case-insensitive). Extra text before or after
   the pattern will be ignored.

2. **Check `agent_jobs`** to confirm the HITL was processed:

   ```sql
   SELECT status, hitl_action, hitl_hours, hitl_credits, hitl_comment, hitl_at
   FROM agent_jobs
   WHERE clickup_task_id = '{task_id}'
   ORDER BY created_at DESC
   LIMIT 1;
   ```

3. **Expected result:**
   - `[approve]` → `status = 'approved'`, `hitl_action = 'approved'`
   - `[approve: 3h 5cr]` → `status = 'approved'`, `hitl_hours = 3`, `hitl_credits = 5`
   - `[reject: need more details]` → `status = 'rejected'`, `hitl_comment = 'need more details'`

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| No `agent_jobs` row created | List ID not in `TRIAGE_ENABLED_LIST_IDS` | Add list ID to env var, redeploy Edge Functions in Coolify |
| No `agent_jobs` row created | `taskCreated` webhook event not registered | Re-register the webhook (Section 4) |
| `status = 'failed'`, error about JSON | Claude returned invalid JSON twice | Check OpenRouter quota and model availability at openrouter.ai |
| `status = 'failed'`, ClickUp comment error | `CLICKUP_API_TOKEN` missing or expired | Verify token in Coolify environment variables |
| `audit_fetched = false` with `wp_mcp_url` set | Maxi AI Core unreachable or credentials wrong | Check `WP_MCP_USER`, `WP_MCP_APP_PASS`, and that Maxi AI Core plugin is active |
| HITL comment not detected | Comment text does not exactly match pattern | Must match `[approve]`, `[approve: Xh Ycr]`, or `[reject: reason]` — no extra text before bracket |
| `[Triage]` comment missing site context line | `wp_mcp_url` is NULL for this client | Run the `UPDATE profiles SET wp_mcp_url = ...` SQL from Section 3 |
| Triage fires on wrong tasks | Monitored list IDs too broad | Narrow `TRIAGE_ENABLED_LIST_IDS` to only the intended lists |
