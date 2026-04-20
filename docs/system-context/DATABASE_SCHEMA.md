# Database Schema & Edge Functions Specification

Complete technical reference for the KAMANIN Client Portal backend infrastructure.

---

## 1. Database Tables

### 1.1 profiles

User identity and notification preferences. One row per authenticated user. **Org-config columns (clickup_list_ids, nextcloud_client_root, support_task_id, clickup_chat_channel_id) were moved to `organizations` in Phase 9 (migration 20260414200000) and dropped in Phase 13 (migration 20260416130000).**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, FK → auth.users(id) | Supabase Auth user ID |
| email | text | NOT NULL | User email address |
| full_name | text | | Display name |
| company_name | text | | Client company name (kept for display; canonical name lives in `organizations.name`) |
| organization_id | uuid | nullable, FK → organizations(id) | Back-reference to the user's organization. Set during Phase 9 data migration. Kept nullable for backward safety. |
| email_notifications | boolean | DEFAULT true | Whether to send email notifications (legacy, kept for backward compat) |
| notification_preferences | jsonb | DEFAULT '{"task_review": true, "task_completed": true, "team_comment": true, "support_response": true, "reminders": true, "peer_messages": true}' | Granular per-type email notification preferences. `peer_messages` (added 2026-04-17, no migration needed — JSONB column accepts new keys freely) gates peer-to-peer org member comment emails. |
| avatar_url | text | | Profile picture URL |
| last_project_reminder_sent_at | timestamptz | | Timestamp of the last project-task reminder email sent to this user. Used by `send-reminders` Edge Function to enforce the 3-day cooldown between project reminder emails. Separate from ticket reminder tracking. Added 2026-04-04. |
| last_unread_digest_sent_at | timestamptz | | Timestamp of the last unread message digest email sent to this user. Used by `send-reminders` to enforce the 24h cooldown for daily unread chat reminders. Added 2026-04-14. |
| last_recommendation_reminder_sent_at | timestamptz | NULL | Cooldown timestamp for recommendation_reminder emails (5-day). Used by `send-reminders` to avoid spamming clients about open recommendations. Added 2026-04-14. |
| last_weekly_summary_sent_at | timestamptz | NULL | Cooldown timestamp for weekly summary emails (6-day window). Used by `send-weekly-summary` Edge Function (Monday 09:00 CET cron) to avoid duplicate sends when a run lands slightly late. Added 2026-04-18. |

**RLS Policies:**
- Users can read/update only their own row (`auth.uid() = id`)
- Org members can read basic profile info (`id`, `email`, `full_name`) of fellow org members — enables TeamSection to display member names. Added in Phase 14 (migration 20260416140000).

---

### 1.2 task_cache

Local mirror of ClickUp tasks. One row per (task, user) pair. Provides instant loading and powers Realtime subscriptions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Internal row ID |
| clickup_id | text | NOT NULL | ClickUp task ID |
| profile_id | uuid | NOT NULL, FK → profiles(id) | Owning user |
| name | text | NOT NULL | Task title |
| description | text | DEFAULT '' | Task description (plain text) |
| status | text | NOT NULL | ClickUp status string (e.g., "client review", "in progress") |
| status_color | text | | Hex color from ClickUp status |
| priority | text | | Priority label ("urgent", "high", "normal", "low") |
| priority_color | text | | Hex color from ClickUp priority |
| due_date | timestamptz | | Task due date |
| time_estimate | bigint | | Time estimate in milliseconds |
| clickup_url | text | | Direct link to task in ClickUp |
| list_id | text | | ClickUp List ID the task belongs to |
| list_name | text | | ClickUp List name |
| raw_data | jsonb | | Full transformed task object (used for extended fields) |
| is_visible | boolean | DEFAULT false | Whether task is visible in client portal |
| last_synced | timestamptz | DEFAULT now() | Last sync timestamp |
| last_activity_at | timestamptz | | Timestamp of most recent activity (comment, status change) |
| created_by_name | text | | First name of portal user who created the task (null for ClickUp-created tasks) |
| credits | numeric | | Credit value assigned to this task in ClickUp (synced via webhook custom field handler). NULL means no credits assigned. |
| created_by_user_id | uuid | | Supabase user ID of creator (null for ClickUp-created tasks) |
| created_at | timestamptz | DEFAULT now() | Row creation timestamp |

**Unique Constraint:** `(clickup_id, profile_id)` — one cache entry per task per user.

**RLS Policy:** Users can read only rows where `profile_id = auth.uid()`.

**Realtime:** REPLICA IDENTITY FULL — enables Supabase Realtime subscriptions for instant UI updates on status changes.

**Upsert Strategy:** `ON CONFLICT (clickup_id, profile_id)` — webhook and fetch functions upsert to keep cache fresh.

---

### 1.3 comment_cache

Unified comment storage for task conversations. Stores only client-facing comments (portal-originated and `@client:`-prefixed team messages). One row per (comment, user) pair.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Internal row ID |
| clickup_comment_id | text | NOT NULL | ClickUp comment ID |
| task_id | text | NOT NULL | ClickUp task ID this comment belongs to |
| profile_id | uuid | NOT NULL, FK → profiles(id) | Owning user |
| comment_text | text | NOT NULL | Full original comment text (includes prefixes like "Name (via Client Portal):") |
| display_text | text | | Clean text for portal display (prefixes stripped) |
| author_id | integer | | ClickUp user ID of author (0 for portal users) |
| author_name | text | | First name of comment author |
| author_email | text | | Author email |
| author_avatar | text | | Author profile picture URL |
| clickup_created_at | timestamptz | | Original comment creation time in ClickUp |
| last_synced | timestamptz | DEFAULT now() | Last sync timestamp |
| is_from_portal | boolean | DEFAULT false | True if comment was posted via Client Portal |
| attachments | jsonb | | Array of attachment objects `[{id, title, url, type, size}]`. Only populated for portal-originated comments. |
| created_at | timestamptz | DEFAULT now() | Row creation timestamp |

**Unique Constraint:** `(clickup_comment_id, profile_id)` — one cache entry per comment per user.

**RLS Policy:** Users can read only rows where `profile_id = auth.uid()`.

**Realtime:** REPLICA IDENTITY FULL — enables instant comment appearance via Realtime subscriptions.

**Writer Wars Protection:** When syncing from ClickUp, portal-originated comments with existing attachments are never overwritten. This prevents the ClickUp sync from clearing attachment data that was set by the portal.

---

### 1.4 notifications

In-app bell notifications. Created by the webhook function on status changes and team replies.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Notification ID |
| profile_id | uuid | NOT NULL, FK → profiles(id) | Target user |
| type | text | NOT NULL, CHECK (see constraint below) | Notification category |
| title | text | NOT NULL | Notification title (German, e.g., "Neue Antwort zu...") |
| message | text | NOT NULL | Notification body text (truncated to ~200 chars) |
| task_id | text | | Related ClickUp task ID |
| comment_id | text | | Related ClickUp comment ID (for team_reply type) |
| is_read | boolean | DEFAULT false | Read state |
| created_at | timestamptz | DEFAULT now() | Creation timestamp |

**Type Check Constraint:** `notifications_type_check` — allowed values: `'team_reply'`, `'status_change'`, `'step_ready'`, `'project_reply'`, `'project_update'`, `'new_recommendation'`, `'member_invited'`, `'member_removed'`. (Extended in Phase 9 migration 20260414200000 to add the two org membership types.)

**RLS Policy:** Users can read only rows where `profile_id = auth.uid()`. Users can update `is_read` on their own notifications.

**Realtime:** REPLICA IDENTITY FULL — enables instant bell notification updates.

**Deduplication:** The webhook checks for existing notifications before creating completion ("completed") and work-started ("started") notifications to prevent duplicates on repeated webhook deliveries.

---

### 1.5 read_receipts

Per-user read state tracking for tasks. Records when a user last viewed a task's comments.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Row ID |
| profile_id | uuid | NOT NULL, FK → profiles(id) | User who read |
| task_id | text | NOT NULL | ClickUp task ID |
| last_read_at | timestamptz | DEFAULT now() | When user last viewed this task's comments |
| created_at | timestamptz | DEFAULT now() | Row creation timestamp |

**Unique Constraint:** `(profile_id, task_id)` — one read receipt per task per user.

**RLS Policy:** Users can read/upsert only their own rows (`profile_id = auth.uid()`).

---

### 1.6 support_messages

Support chat message storage. Each message corresponds to a comment on the user's dedicated ClickUp support task.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Message ID |
| profile_id | uuid | NOT NULL, FK → profiles(id) | User this message belongs to |
| message_text | text | NOT NULL | Full message text (includes portal prefix for client messages) |
| display_text | text | | Clean text for display (prefix stripped) |
| is_from_client | boolean | DEFAULT true | True if sent by client, false if from team |
| sender_name | text | | First name of sender |
| clickup_message_id | text | | Corresponding ClickUp comment ID |
| attachments | jsonb | DEFAULT '[]' | Array of attachment objects `[{id, title, url, type, size}]` |
| created_at | timestamptz | DEFAULT now() | Message timestamp |

**RLS Policy:** Users can read only rows where `profile_id = auth.uid()`.

**Realtime:** Enabled for instant chat updates.

---

### 1.7 project_config

Project configuration. Maps a portal project to its ClickUp list and Nextcloud folder.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Project config ID |
| clickup_list_id | text | NOT NULL | ClickUp List ID for this project |
| clickup_phase_field_id | text | | Custom field ID used to map tasks to chapters/phases |
| name | text | NOT NULL | Project display name |
| type | text | NOT NULL | Project type label (e.g., "Website") |
| client_name | text | NOT NULL | Client company name |
| client_initials | text | NOT NULL | Short initials for avatar badges |
| start_date | date | | Project start date |
| target_date | date | | Target completion date |
| is_active | boolean | DEFAULT true | Whether the project is active |
| general_message_task_id | text | | ClickUp task ID for general project messages |
| nextcloud_root_path | text | | WebDAV path to the project root folder in Nextcloud (e.g., `/01_OPUS/Company/projects/ProjectName`). Used by `nextcloud-files` Edge Function. NULL means files are not yet configured. |

---

### 1.8 chapter_config

Chapter (phase) configuration for projects. Each project has 1-N chapters ordered by `sort_order`.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Chapter config ID |
| project_config_id | uuid | NOT NULL, FK -> project_config(id) | Parent project |
| clickup_cf_option_id | text | | ClickUp custom field option ID for phase mapping |
| title | text | NOT NULL | Chapter display title (e.g., "Konzept") |
| sort_order | integer | NOT NULL | Display order (1-based). Also used to build Nextcloud folder prefix (e.g., `01_Konzept`) |
| narrative | string | NOT NULL | Description shown when chapter is current |
| next_narrative | string | NOT NULL | Description shown when chapter is next |
| is_active | boolean | DEFAULT true | Whether this chapter is active |

---

### 1.9 project_access

Maps users to projects they can access. One row per (user, project) pair.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Row ID |
| profile_id | uuid | NOT NULL, FK -> profiles(id) | User |
| project_config_id | uuid | NOT NULL, FK -> project_config(id) | Project |

**Unique Constraint:** `(profile_id, project_config_id)`

**RLS Policy:** Users can read only rows where `profile_id = auth.uid()`.

---

### 1.10 credit_packages

Monthly credit allocations per organization. One active package per org defines how many credits are topped up each month. **`profile_id` column was dropped in Phase 13 (migration 20260416130000); access is now org-scoped.**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Package ID |
| organization_id | uuid | NOT NULL, FK -> organizations(id) | Owning organization (replaces profile_id as of Phase 13) |
| package_name | text | NOT NULL | Human-readable package label (e.g., "Standard 10h") |
| credits_per_month | numeric | NOT NULL | Number of credits added each month via `credit-topup` |
| is_active | boolean | NOT NULL, DEFAULT true | Only active packages receive monthly top-ups |
| started_at | date | NOT NULL, DEFAULT CURRENT_DATE | When this package began |
| created_at | timestamptz | NOT NULL, DEFAULT now() | Row creation timestamp |

**RLS Policy:** Users can read rows where `organization_id IN (SELECT user_org_ids())` — org-scoped, all members of the org see the shared package.

---

### 1.11 credit_transactions

Ledger of all credit movements. Positive amounts are top-ups, negative amounts are deductions. Balance is computed as `SUM(amount)` (or via `get_org_credit_balance(org_id)` RPC).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Transaction ID |
| profile_id | uuid | NOT NULL, FK -> profiles(id) ON DELETE CASCADE | User who triggered the transaction. **Retained for audit trail even after org migration** — not dropped in Phase 13. |
| organization_id | uuid | **NOT NULL**, FK -> organizations(id) | Org this transaction belongs to. Added in Phase 9 as nullable; backfilled and promoted to NOT NULL on 2026-04-20 (migration `20260420150000_backfill_credit_transactions_org_id.sql`) after discovering orphan rows from the `accept_recommendation` code path. |
| amount | numeric | NOT NULL | Credit amount (positive = top-up, negative = deduction) |
| type | text | NOT NULL | Transaction type: `monthly_topup`, `task_deduction`, `manual_adjustment` |
| task_id | text | | Related ClickUp task ID (for `task_deduction` type) |
| task_name | text | | Task name at time of deduction (denormalized for display) |
| description | text | | Human-readable description (e.g., "2026-03 Gutschrift", "Credits: 0 -> 5") |
| created_at | timestamptz | NOT NULL, DEFAULT now() | Transaction timestamp |

**RLS Policy:** Users can read only rows where `profile_id = auth.uid()`.

**RPC:** `get_org_credit_balance(p_org_id uuid)` — SECURITY DEFINER function that sums `amount` for all rows matching `organization_id = p_org_id`. Used by `useOrg` / credit balance display to show org-wide balance.

**Realtime:** REPLICA IDENTITY FULL -- enables instant balance updates via Supabase Realtime subscriptions.

---

### 1.12 client_workspaces

Active module registry per organization. Controls which navigation items appear in the sidebar and which routes are accessible via WorkspaceGuard. **`profile_id` column was dropped in Phase 13 (migration 20260416130000); access is now org-scoped.**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Row ID |
| organization_id | uuid | NOT NULL, FK -> organizations(id) | Owning organization (replaces profile_id as of Phase 13) |
| module_key | text | NOT NULL | Module identifier (e.g., `tickets`, `support`, `projects`) |
| display_name | text | NOT NULL | German label shown in sidebar (e.g., "Aufgaben") |
| icon | text | | Icon name from Hugeicons (`@hugeicons/core-free-icons`) |
| sort_order | integer | NOT NULL, DEFAULT 0 | Display order within Workspaces zone |
| is_active | boolean | NOT NULL, DEFAULT true | Only active rows appear in sidebar |

**Unique Constraint:** `(organization_id, module_key)` — one row per module per org.

**RLS Policy:** Users can read rows where `organization_id IN (SELECT user_org_ids())` — org-scoped, all members see the same workspace set.

**Usage:** `useWorkspaces()` hook fetches active rows. `WorkspaceGuard` redirects to `/inbox` if the required `module_key` is not active for the current user's org.

---

### 1.13 organizations

Company-level entity. Owns shared configuration (ClickUp lists, Nextcloud root, support task) and is the billing/access anchor for all org members. Created in Phase 9 (migration 20260414200000).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Organization ID |
| name | text | NOT NULL | Company display name (e.g., "MBM GmbH") |
| slug | text | NOT NULL, UNIQUE | URL-safe identifier derived from email domain (e.g., "mbm-moebel") |
| clickup_list_ids | jsonb | NOT NULL, DEFAULT '[]' | Array of ClickUp List IDs for all tasks belonging to this org |
| nextcloud_client_root | text | | WebDAV path to the org's root folder in Nextcloud (e.g., `/clients/mbm-moebel/`) |
| support_task_id | text | | ClickUp task ID for the org's dedicated support chat channel |
| clickup_chat_channel_id | text | | ClickUp Chat v3 channel ID for new-task notifications |
| created_at | timestamptz | NOT NULL, DEFAULT now() | Row creation timestamp |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | Auto-updated via `organizations_updated_at` trigger |

**RLS Policy:** Authenticated users can read the org they belong to (`id IN (SELECT organization_id FROM org_members WHERE profile_id = auth.uid())`). Added in Phase 11.

**SQL Helpers:**
- `user_org_ids()` — SECURITY DEFINER, stable; returns all `organization_id` values for the current user. Used in RLS policies on `credit_packages`, `client_workspaces`, `organizations`.
- `user_org_role(org_id uuid)` — SECURITY DEFINER, stable; returns role string (`'admin'`/`'member'`/`'viewer'`) for current user in the given org, or NULL if not a member.

---

### 1.14 org_members

Maps users to their organization with a role. One row per (org, user) pair. Created in Phase 9 (migration 20260414200000).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Row ID |
| organization_id | uuid | NOT NULL, FK → organizations(id) ON DELETE CASCADE | Parent organization |
| profile_id | uuid | NOT NULL, FK → profiles(id) ON DELETE CASCADE | Member user |
| role | text | NOT NULL, CHECK IN ('admin','member','viewer') | Access role |
| invited_email | text | | Email address used at invite time. Displayed in TeamSection for pending members not yet visible via profiles RLS. Added Phase 14 (migration 20260416150000). |
| last_invite_sent_at | timestamptz | NULL | Timestamp of the last invite email sent to this member. Used by `resend-invite` EF to enforce a 60-second cooldown between resends. Updated atomically via `UPDATE … WHERE` to prevent TOCTOU races. Added 2026-04-20 (migration 20260420160000). |
| created_at | timestamptz | NOT NULL, DEFAULT now() | Row creation timestamp |

**Unique Constraint:** `(organization_id, profile_id)` — one membership per user per org.

**Indexes:** `org_members(profile_id)`, `org_members(organization_id)` — required for efficient RLS policy evaluation.

**RLS Policies:**
- Members can read their own row (`profile_id = auth.uid()`). Added Phase 11.
- Admins can SELECT all rows in their org (`user_org_role(organization_id) = 'admin'`). Added Phase 12.
- Admins can UPDATE role on any row in their org. Added Phase 12.
- Admins can DELETE any row in their org. Added Phase 12.

---

### 1.15 project_file_activity

File activity log for the Projects module. Records both portal-initiated actions (upload, folder create) and events pulled from the Nextcloud OCS Activity API.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Row ID |
| project_config_id | uuid | NOT NULL, FK -> project_config(id) ON DELETE CASCADE | Parent project |
| profile_id | uuid | NOT NULL, FK -> profiles(id) | Acting user (portal user or resolved Nextcloud actor) |
| event_type | text | NOT NULL | Activity type (e.g., `file_shared`, `file_created`, `folder_created`) |
| file_name | text | NOT NULL | Display name of the affected file or folder |
| file_path | text | | Full WebDAV path relative to project root |
| actor_label | text | | Human-readable actor name from Nextcloud (e.g., "Yuri Kamanin"); NULL for portal-initiated events |
| source | text | NOT NULL, DEFAULT 'portal' | Origin: `'portal'` (client action) or `'nextcloud'` (synced from OCS API) |
| nextcloud_activity_id | bigint | | Nextcloud OCS activity ID; NULL for portal-initiated events |
| created_at | timestamptz | DEFAULT now() | Timestamp of the event |

**Unique Index (partial):** `(nextcloud_activity_id)` WHERE `nextcloud_activity_id IS NOT NULL` — prevents duplicate sync inserts.

**RLS Policy:** Users can read rows where `profile_id = auth.uid()`. Service role used for upsert during sync.

**Usage:** `useSyncFileActivity` mutation triggers `sync_activity` Edge Function action on project mount. `UpdatesFeed` queries recent rows and renders them via `FileActivityItem`.

---

### 1.16 client_file_activity

File activity log for the Files module (client-level). Same structure as `project_file_activity` but scoped to a client's root Nextcloud folder rather than a specific project.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, DEFAULT gen_random_uuid() | Row ID |
| profile_id | uuid | NOT NULL, FK -> profiles(id) ON DELETE CASCADE | Owning client |
| event_type | text | NOT NULL | Activity type (e.g., `file_shared`, `file_created`, `folder_created`) |
| file_name | text | NOT NULL | Display name of the affected file or folder |
| file_path | text | | Full WebDAV path relative to client root |
| actor_label | text | | Human-readable actor name from Nextcloud; NULL for portal-initiated events |
| source | text | NOT NULL, DEFAULT 'portal' | Origin: `'portal'` or `'nextcloud'` |
| nextcloud_activity_id | bigint | | Nextcloud OCS activity ID; NULL for portal-initiated events |
| created_at | timestamptz | DEFAULT now() | Timestamp of the event |

**Unique Index (partial):** `(nextcloud_activity_id)` WHERE `nextcloud_activity_id IS NOT NULL`.

**RLS Policy:** Users can read/insert rows where `profile_id = auth.uid()` (`WITH CHECK` on insert).

**Usage:** `ClientActionBar` and `CreateFolderInput` insert portal events directly. `useSyncClientFileActivity` triggers `sync_activity_client` Edge Function action. `DateienPage` renders recent rows in the "Letzte Aktivität" section via `FileActivityItem`.

---

## 2. Edge Functions

All Edge Functions are deployed with `verify_jwt = false` in `supabase/config.toml` and perform manual JWT verification internally via `supabase.auth.getUser(token)`.

### Common Patterns

All functions share these patterns:

- **CORS:** Dynamic origin validation via `_shared/cors.ts` (whitelist + preview URL patterns)
- **Logging:** Structured JSON via `_shared/logger.ts` with PII scrubbing and correlation IDs
- **ClickUp API calls:** 10-second timeout, exponential backoff (500ms, 1s, 2s), max 2 retries
- **Auth:** Bearer token extraction → `supabase.auth.getUser()` verification
- **Task ID validation:** Alphanumeric regex `/^[a-zA-Z0-9]+$/`, max 50 chars
- **Supabase SDK:** Pinned to `@supabase/supabase-js@2.47.10`

---

### 2.1 fetch-clickup-tasks

Bulk fetch of all visible tasks for the authenticated user.

| Property | Value |
|----------|-------|
| **Method** | POST |
| **Auth** | Bearer token (user JWT) |
| **Input** | `{ debug?: boolean }` |
| **Output** | `{ tasks: TransformedTask[], diagnostics?: DiagnosticsData }` |

**Secrets Used:**
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `CLICKUP_API_TOKEN`
- `CLICKUP_VISIBLE_FIELD_ID`

**Logic:**
1. Get user's `clickup_list_ids` from `profiles` table
2. For each list: paginate through all tasks (`include_closed=true`, 100 per page, max 20 pages)
3. Check visibility custom field on each task:
   - If field present in list response → use directly
   - If field missing → fallback: fetch individual task detail (max 50 tasks, concurrency limit of 5)
   - Values `true`, `1`, `"true"`, `"1"` all count as visible
4. Transform visible tasks to portal format
5. Upsert all visible tasks into `task_cache` (batches of 50, service role client)
6. If `debug=true`, include diagnostics (counts, sample visibility values, fallback stats)

**ClickUp API Calls:**
- `GET /api/v2/list/{listId}/task?include_closed=true&page={n}` (per list, paginated)
- `GET /api/v2/task/{taskId}` (fallback for missing visibility field)

---

### 2.2 fetch-single-task

Fetch a single task by ID with access control validation.

| Property | Value |
|----------|-------|
| **Method** | POST |
| **Auth** | Bearer token (user JWT) |
| **Input** | `{ taskId: string }` |
| **Output** | `{ task: TransformedTask | null, message?: string }` |

**Secrets Used:**
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- `CLICKUP_API_TOKEN`
- `CLICKUP_VISIBLE_FIELD_ID`

**Logic:**
1. Verify user and fetch their `clickup_list_ids` from profile
2. Fetch task from ClickUp API
3. Verify task's `list.id` is in user's `clickup_list_ids` (access control)
4. Check visibility custom field (same logic as bulk fetch)
5. Transform and return task

**ClickUp API Calls:**
- `GET /api/v2/task/{taskId}`

---

### 2.3 fetch-task-comments

Fetch client-facing comments for a task with thread resolution.

| Property | Value |
|----------|-------|
| **Method** | POST |
| **Auth** | Bearer token (user JWT) |
| **Input** | `{ taskId: string }` |
| **Output** | `{ comments: ResponseComment[] }` |

**Secrets Used:**
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `CLICKUP_API_TOKEN`

**Logic:**
1. Fetch all comments from ClickUp task
2. Filter to client-facing only:
   - Portal comments: match `^(?:\*\*)?(.+?)(?:\*\*)? \(via Client Portal\):\n\n(.*)`
   - Team-to-client: match `^@client:\s*`
3. For comments with `reply_count > 0`, fetch threaded replies via `/comment/{id}/reply`
4. Parse each comment: extract display text, determine author, strip prefixes
5. Cache to `comment_cache` (service role, upsert on `clickup_comment_id,profile_id`)
   - Portal comments with existing attachments are **not overwritten** (writer wars protection)
6. Fetch cached portal attachments from `comment_cache` for response
7. Return sorted comments (newest first) with attachments

**ClickUp API Calls:**
- `GET /api/v2/task/{taskId}/comment`
- `GET /api/v2/comment/{commentId}/reply` (for threaded comments)

---

### 2.4 post-task-comment

Post a comment from the portal to ClickUp, with optional file attachments.

| Property | Value |
|----------|-------|
| **Method** | POST |
| **Auth** | Bearer token (user JWT) |
| **Input** | `{ taskId: string, comment: string, files?: FileData[] }` |
| **Output** | `{ success: true, commentId: string, attachmentCount: number, attachmentNames: string[] }` |

**FileData:** `{ name: string, type: string, size: number, base64: string }`

**Secrets Used:**
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `CLICKUP_API_TOKEN`

**Validation:**
- Comment: required, max 10,000 chars
- Files: max 5 files, max 10MB each
- Allowed types: JPEG, PNG, GIF, WebP, PDF, DOC/DOCX, XLS/XLSX, TXT

**Logic:**
1. Upload attachments to ClickUp first (if any) via multipart form data
2. Build comment text: `{fullName} (via Client Portal):\n\n{comment}` + file references
3. Detect existing client-facing thread (portal or `@client:` comments)
4. If thread exists → post as reply (`/comment/{id}/reply`); otherwise → new top-level comment
5. Fetch real attachment data from task detail (URLs, types, sizes)
6. Cache comment to `comment_cache` with attachments for instant Realtime delivery
7. **Peer fan-out** (wrapped in try/catch — never fails the main POST):
   - Call `getOrgContextForUserAndTask` to resolve org and validate task ownership
   - If `taskBelongsToOrg === false`, skip fan-out entirely
   - For each org member excluding author and viewers: upsert `comment_cache`, insert `team_reply` bell notification, send email if `peer_messages` preference is true and recipient has an email address

**ClickUp API Calls:**
- `POST /api/v2/task/{taskId}/attachment` (per file, multipart)
- `GET /api/v2/task/{taskId}/comment` (thread detection)
- `POST /api/v2/task/{taskId}/comment` OR `POST /api/v2/comment/{id}/reply`
- `GET /api/v2/task/{taskId}` (fetch attachment URLs after upload)

---

### 2.5 update-task-status

Update task status in ClickUp based on client actions (approve, request changes, hold, resume, cancel).

| Property | Value |
|----------|-------|
| **Method** | POST |
| **Auth** | Bearer token (user JWT) |
| **Input** | `{ taskId: string, action: string, comment?: string }` |
| **Output** | `{ success: true, newStatus: string, message: string }` |

**Valid Actions:**

| Action | Target ClickUp Status (case-insensitive match) |
|--------|------------------------------------------------|
| `approve` | approved |
| `request_changes` | rework, changes requested |
| `put_on_hold` | on hold |
| `resume` | to do |
| `cancel` | canceled, cancelled |

**Secrets Used:**
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `CLICKUP_API_TOKEN`

**Logic:**
1. Fetch task from ClickUp to get `list.id`
2. Fetch list configuration to get available statuses
3. Match action to a valid status name (case-insensitive)
4. Update task status via ClickUp API (`PUT /api/v2/task/{taskId}`)
5. If comment provided: post as portal comment (with thread detection, same as post-task-comment)
6. Update local `task_cache` with new status

**ClickUp API Calls:**
- `GET /api/v2/task/{taskId}`
- `GET /api/v2/list/{listId}`
- `PUT /api/v2/task/{taskId}` (status update)
- `GET /api/v2/task/{taskId}/comment` (thread detection, if comment provided)
- `POST /api/v2/task/{taskId}/comment` OR `POST /api/v2/comment/{id}/reply` (if comment provided)

---

### 2.6 create-clickup-task

Create a new task in ClickUp from the portal with file attachments.

| Property | Value |
|----------|-------|
| **Method** | POST |
| **Auth** | Bearer token (user JWT) |
| **Input** | `{ name: string, description?: string, priority: 1|2|3|4, files?: FileData[] }` |
| **Output** | `{ success: true, task: { id, name, url, attachments }, warning?: string }` |

**FileData:** `{ name: string, data: string (base64), type: string }`

**Secrets Used:**
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `CLICKUP_API_TOKEN`
- `CLICKUP_VISIBLE_FIELD_ID`
- `CLICKUP_WORKSPACE_ID`

**Validation:**
- Name: required, max 200 chars
- Description: max 5,000 chars
- Priority: 1 (Urgent), 2 (High), 3 (Normal), 4 (Low)
- Files: max 5, max 10MB each
- Expanded allowed types: images (including SVG, BMP, TIFF), PDF, Office docs, text, CSV, HTML, markdown, ZIP, application/octet-stream

**Logic:**
1. Get user's first `clickup_list_ids` entry as target list
2. Create task in ClickUp with:
   - Status: "to do"
   - Visibility custom field set to `true`
3. Upsert into `task_cache` with `created_by_name` and `created_by_user_id`
4. Upload attachments sequentially via multipart form data
5. Send notification to ClickUp Chat v3 channel (if `clickup_chat_channel_id` configured on profile):
   - Format: task name, priority label with emoji, creator name, task URL
   - API: `POST /api/v3/workspaces/{workspaceId}/chat/channels/{channelId}/messages`

**ClickUp API Calls:**
- `POST /api/v2/list/{listId}/task`
- `POST /api/v2/task/{taskId}/attachment` (per file, multipart)
- `POST /api/v3/workspaces/{workspaceId}/chat/channels/{channelId}/messages` (optional)

---

### 2.7 clickup-webhook

Inbound webhook processor for ClickUp events. Handles status changes, comments, and triggers notifications/emails.

| Property | Value |
|----------|-------|
| **Method** | POST (webhook), GET (health check) |
| **Auth** | HMAC-SHA256 signature verification (via `X-Signature` header) |
| **Input** | ClickUp webhook payload |
| **Output** | `{ success: true, ... }` |

**Secrets Used:**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `CLICKUP_API_TOKEN`
- `CLICKUP_WEBHOOK_SECRET`
- `CLICKUP_VISIBLE_FIELD_ID`

**Rate Limiting:** Max 100 events per webhook ID per 60-second window (in-memory).

**Handled Events:**

#### taskStatusUpdated

Processes three notification tiers:

**Client Review (email + bell):**
- Triggered when status becomes "client review" (exact match, case-insensitive)
- Checks task visibility before sending
- Resolves recipients: task_cache → fallback to profiles.clickup_list_ids
- Creates `status_change` notification: "Aufgabe bereit zur Uberprufung"
- Sends `task_review` email via `send-mailjet-email`
- Updates `task_cache.last_activity_at`

**Done/Completed (email + bell):**
- Triggered when status contains "done", "complete", or "closed"
- Deduplicates by checking existing "completed" notifications
- Creates `status_change` notification: "Aufgabe abgeschlossen"
- Sends `task_completed` email

**In Progress (bell only):**
- Triggered when status becomes "in progress" (only on transition from different status)
- Deduplicates by checking existing "started" notifications
- Creates `status_change` notification: "Arbeit hat begonnen"
- No email sent

**All status changes:** Updates `task_cache` with new status, color, `last_activity_at`, and `last_synced`.

#### taskCommentPosted

**Filtering logic:**
1. Skip portal-originated comments (regex: `(via Client Portal):`)
2. Check thread context (with 2 retry attempts, 1.5s/2s delays):
   - If reply in client-facing thread → notify
   - If reply in internal thread → block (even with `@client:` prefix)
   - If top-level with `@client:` prefix → notify
   - If top-level without prefix → skip
3. Check if task is a support task (`profiles.support_task_id` match)

**Support task comments:**
- Save to `comment_cache` for Realtime
- Create `team_reply` notification
- Send `support_response` email

**Regular task comments:**
- Resolve recipients via `findProfilesForTask` (cache → list_id fallback)
- Create `team_reply` notifications per recipient
- Send `team_question` email per recipient (with `email_notifications` check)
- Cache comment to `comment_cache` per recipient
- Update `task_cache.last_activity_at`

**Recipient Resolution (`findProfilesForTask`):**
1. Primary: `SELECT profile_id FROM task_cache WHERE clickup_id = taskId`
2. Fallback: `SELECT id FROM profiles WHERE clickup_list_ids @> [listId]`
3. Warning logged if fallback returns >10 profiles

**ClickUp API Calls:**
- `GET /api/v2/task/{taskId}` (visibility check)
- `GET /api/v2/task/{taskId}/comment` (thread context check)
- `GET /api/v2/comment/{commentId}/reply` (thread context check)

---

### 2.8 send-mailjet-email

Email template renderer and Mailjet API sender. Called internally by other functions.

| Property | Value |
|----------|-------|
| **Method** | POST |
| **Auth** | Bearer token (typically service role key from internal calls) |
| **Input** | `{ type: EmailType, to: { email, name? }, data: EmailData }` |
| **Output** | `{ success: true }` or `{ error: string }` |

**Supported Email Types:**

| Type | Subject (DE) | Body Pattern |
|------|-------------|--------------|
| `task_review` | "Aufgabe bereit zur Uberprufung: {taskName}" | Review notification with task link |
| `task_completed` | "Ihre Aufgabe wurde abgeschlossen" | Completion with secondary CTA "Neue Aufgabe erstellen" |
| `message_digest` | "Sie haben neue Nachrichten" | Multi-task digest with reply counts |
| `team_question` | "Frage zu {taskName}" | Team message preview with reply CTA |
| `support_response` | "Neue Nachricht von Ihrem Tech-Team" | Support message preview |
| `magic_link` | "Anmeldung im KAMANIN Portal" | Auth link with expiry note |
| `password_reset` | "Passwort zurucksetzen" | Reset link with expiry note |
| `email_confirmation` | "E-Mail-Adresse bestatigen" | Confirmation link |

**Secrets Used:**
- `MAILJET_API_KEY`, `MAILJET_API_SECRET`

**Sender:** `notifications@kamanin.at` / "KAMANIN Portal"

**Template:** ClickUp-style card layout with KAMANIN logo, white card on grey background, blue CTA button.

**Locale Support:** German (default) and English via `data.locale` parameter. Copy dictionary in `_shared/emailCopy.ts`.

---

### 2.9 send-support-message

Send a support chat message from the portal to the user's dedicated ClickUp support task.

| Property | Value |
|----------|-------|
| **Method** | POST |
| **Auth** | Bearer token (user JWT) |
| **Input** | `{ message: string, files?: FileData[] }` |
| **Output** | `{ success: true, message: SupportMessage, attachmentCount: number }` |

**Secrets Used:**
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `CLICKUP_API_TOKEN`

**Validation:**
- Message: required, max 5,000 chars
- Files: max 5, max 10MB each, same type restrictions as post-task-comment

**Logic:**
1. Get user's `support_task_id` from profile (required — returns 400 if not configured)
2. Upload attachments to the support task in ClickUp
3. Post comment: `{clientName} (via Client Portal):\n\n{message}` + file references
4. Save to `support_messages` table with `is_from_client = true`

**ClickUp API Calls:**
- `POST /api/v2/task/{supportTaskId}/attachment` (per file)
- `POST /api/v2/task/{supportTaskId}/comment`

---

### 2.10 send-feedback

Send a feedback form submission to support@kamanin.at via Mailjet.

| Property | Value |
|----------|-------|
| **Method** | POST |
| **Auth** | None required (CORS-protected) |
| **Input** | `{ subject, message, pageUrl?, userEmail?, profileId?, userAgent?, attachments?: Attachment[] }` |
| **Output** | `{ ok: true, correlationId: string }` |

**Attachment:** `{ filename: string, contentType: string, base64: string }`

**Secrets Used:**
- `MAILJET_API_KEY`, `MAILJET_API_SECRET`

**Logic:**
1. Validate subject and message (required)
2. Format HTML email with metadata table (page URL, email, profile ID, timestamp in Europe/Vienna, user agent)
3. Attach up to 5 files as Mailjet inline attachments
4. Send to `support@kamanin.at` with ReplyTo set to user's email
5. Subject format: `[Portal Feedback] {subject}`

**ClickUp API Calls:** None.

---

### 2.11 auth-email

Supabase Auth email hook. Intercepts auth emails (magic link, password reset, signup, invite, email change) and sends branded versions via Mailjet.

| Property | Value |
|----------|-------|
| **Method** | POST |
| **Auth** | Called by Supabase Auth system (webhook) |
| **Input** | Supabase Auth hook payload `{ user, email_data }` |
| **Output** | `{}` (200 on success) or `{ error: { http_code, message } }` (500 on failure) |

**Secrets Used:**
- `SUPABASE_URL`
- `MAILJET_API_KEY`, `MAILJET_API_SECRET`

**Auth Action Type Mapping:**

| Supabase Type | Email Copy Key |
|---------------|---------------|
| `magiclink` | `magic_link` |
| `recovery` | `password_reset` |
| `signup` | `signup` |
| `email_change` | `email_change` |
| `invite` | `invite` |

**Logic:**
1. Parse auth hook payload
2. Construct verification URL: `{SUPABASE_URL}/auth/v1/verify?token={token_hash}&type={type}&redirect_to={redirect_to}`
3. Generate branded HTML email using `_shared/emailCopy.ts` (German locale default)
4. Send via Mailjet directly (not via send-mailjet-email function)

---

### 2.12 nextcloud-files

WebDAV proxy for Nextcloud file operations. Provides list, download, upload, and folder creation actions for project files. Supports arbitrary path navigation within a project root.

| Property | Value |
|----------|-------|
| **Method** | POST |
| **Auth** | Bearer token (user JWT) |
| **Input** | JSON body or multipart/form-data (for upload) |
| **Output** | `{ ok, code, correlationId, data? }` |

**Secrets Used:**
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXTCLOUD_URL` — Nextcloud instance URL (e.g., `https://cloud.kamanin.at`)
- `NEXTCLOUD_USER` — Service account username
- `NEXTCLOUD_PASS` — Service account password

**Actions:**

| Action | Input | Description |
|--------|-------|-------------|
| `list` | `{ action: "list", project_config_id, sub_path? }` | PROPFIND depth:1 at `nextcloud_root_path/sub_path`. Returns `NextcloudFile[]`. `sub_path` defaults to root if omitted. |
| `download` | `{ action: "download", project_config_id, file_path }` | Streams file bytes back to browser |
| `upload` | FormData: `action`, `project_config_id`, `sub_path?`, `file` | PUTs file to `nextcloud_root_path/sub_path/filename` via WebDAV |
| `mkdir` | `{ action: "mkdir", project_config_id, folder_path }` | Creates folder (and all intermediate directories) via recursive WebDAV MKCOL |
| `delete` | `{ action: "delete", project_config_id, item_path }` | WebDAV DELETE on `nextcloud_root_path/item_path`. 204 or 404 → success (idempotent). Other status → 502. |
| `delete-client` | `{ action: "delete-client", item_path }` | WebDAV DELETE using `profiles.nextcloud_client_root` as root. Same success/error handling as `delete`. No `project_config_id` needed. |
| `sync_activity` | `{ action: "sync_activity", project_config_id }` | Calls Nextcloud OCS Activity API, filters by `nextcloud_root_path` prefix, upserts new records into `project_file_activity` (deduped by `nextcloud_activity_id`). Uses service role client. |
| `sync_activity_client` | `{ action: "sync_activity_client" }` | Same as `sync_activity` but uses `profiles.nextcloud_client_root` and upserts into `client_file_activity`. |

**Parameters:**

| Parameter | Used By | Description |
|-----------|---------|-------------|
| `project_config_id` | `list`, `download`, `upload`, `mkdir`, `delete`, `sync_activity` | Resolves project root path and verifies access |
| `sub_path` | `list`, `upload` | Path relative to `nextcloud_root_path` for arbitrary folder navigation |
| `file_path` | `download` | Full path to the file within the project root |
| `folder_path` | `mkdir` | Path (relative to project root) of the folder to create; intermediate folders are created automatically |
| `item_path` | `delete`, `delete-client` | Path of the file or folder to delete, relative to the action's root path |

**Security:**
- Path traversal prevention: rejects `..`, leading `/`, control characters, and paths escaping `nextcloud_root_path`
- Project access verified via `project_access` table (user must have access to the project)
- `nextcloud_root_path` loaded from `project_config` (returns `NEXTCLOUD_NOT_CONFIGURED` if null)

**Error Codes:**
- `NEXTCLOUD_NOT_CONFIGURED` — project has no `nextcloud_root_path` set (HTTP 200, non-error for UI)
- `NEXTCLOUD_ERROR` — upstream Nextcloud error (HTTP 502)
- `FOLDER_NOT_FOUND` — target folder does not exist in Nextcloud (HTTP 409)
- `FILE_TOO_LARGE` — upload exceeds size limit (HTTP 400). Only applies to `upload-task-file` action; the `upload` and `upload-client-file` actions have no size cap.

---

## 3. Shared Utilities (`_shared/`)

### 3.1 cors.ts

CORS configuration with origin whitelisting.

**Allowed Origins:**
- `https://portal.kamanin.at` (production)
- `http://localhost:5173`, `http://localhost:5174` (local development)
- `*.vercel.app` (Vercel preview URLs matching pattern `portal(-[a-z0-9-]+)?.vercel.app`)

**Exports:**
- `isAllowedOrigin(origin)` — checks if origin matches whitelist or patterns
- `getCorsHeaders(origin)` — returns CORS headers with validated origin (falls back to production URL)
- `corsHeaders` — static default headers (for error responses outside request context)

### 3.2 logger.ts

Structured JSON logging with PII scrubbing.

**Output Format:**
```json
{
  "timestamp": "ISO-8601",
  "level": "DEBUG|INFO|WARN|ERROR",
  "function": "function-name",
  "message": "log message",
  "requestId": "8-char-uuid",
  "data": { "sanitized": "object" }
}
```

**PII Scrubbing:** Automatically redacts keys containing: `email`, `password`, `token`, `authorization`, `apikey`, `secret`, `userid`, `user_id`, `profile_id`. Recursive for nested objects.

**Exports:**
- `createLogger(functionName, requestId?)` — returns `{ debug, info, warn, error }` methods

### 3.3 utils.ts

Shared utility functions.

**`parseClickUpTimestamp(value)`**
- Handles epoch-ms (13+ digits), epoch-s (10 digits), 11-12 digit edge cases (treated as ms), ISO strings
- Returns `new Date()` for null/undefined/unparseable values

**`normalizeAttachmentType(att)`**
- Safely extracts MIME type from ClickUp attachment objects
- Handles cases where `type` is an object (App attachments like Google Drive) instead of string
- Priority: `extension` string → `type` string → `undefined`

### 3.4 emailCopy.ts

Bilingual email copy dictionary.

**Supported Locales:** `de` (German, default), `en` (English)

**Email Types:** `task_review`, `task_completed`, `message_digest`, `team_question`, `support_response`, `magic_link`, `password_reset`, `email_confirmation`, `signup`, `invite`, `email_change`

Each entry provides: `subject`, `title`, `greeting(firstName?)`, `body(...)`, `cta`, optional `secondaryCta`, `notes[]`, `signOff`.

**Exports:**
- `getEmailCopy(type, locale?)` — returns copy entry (defaults to "de")
- `deNewReplies(count)` / `enNewReplies(count)` — pluralized "X neue Antworten" / "X new replies"
- `EMAIL_COPY` — full dictionary object

---

## 4. Environment Secrets

Complete list of required secrets across all Edge Functions.

| Secret | Used By | Description |
|--------|---------|-------------|
| `SUPABASE_URL` | All functions | Supabase project URL (auto-injected) |
| `SUPABASE_ANON_KEY` | All authenticated functions | Supabase anonymous key (auto-injected) |
| `SUPABASE_SERVICE_ROLE_KEY` | webhook, fetch-task-comments, post-task-comment, update-task-status, create-clickup-task, send-support-message, send-mailjet-email | Service role key for admin operations (auto-injected) |
| `CLICKUP_API_TOKEN` | All ClickUp functions | ClickUp API personal token |
| `CLICKUP_VISIBLE_FIELD_ID` | fetch-clickup-tasks, fetch-single-task, create-clickup-task, clickup-webhook | Custom field ID for "Visible in client portal" checkbox |
| `CLICKUP_WEBHOOK_SECRET` | clickup-webhook | HMAC secret for webhook signature verification |
| `CLICKUP_WORKSPACE_ID` | create-clickup-task | Workspace ID for Chat v3 API notifications |
| `MAILJET_API_KEY` | send-mailjet-email, auth-email, send-feedback | Mailjet API key |
| `MAILJET_API_SECRET` | send-mailjet-email, auth-email, send-feedback | Mailjet API secret |
| `NEXTCLOUD_URL` | nextcloud-files | Nextcloud instance URL (e.g., `https://cloud.kamanin.at`) |
| `NEXTCLOUD_USER` | nextcloud-files | Nextcloud service account username |
| `NEXTCLOUD_PASS` | nextcloud-files | Nextcloud service account password |

**Auto-injected by Supabase:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

**Manual configuration required:** `CLICKUP_API_TOKEN`, `CLICKUP_VISIBLE_FIELD_ID`, `CLICKUP_WEBHOOK_SECRET`, `CLICKUP_WORKSPACE_ID`, `MAILJET_API_KEY`, `MAILJET_API_SECRET`, `NEXTCLOUD_URL`, `NEXTCLOUD_USER`, `NEXTCLOUD_PASS`
