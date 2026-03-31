# Technical Context

## 1. System Overview

KAMANIN Client Portal is a React-based web application that serves as a controlled projection layer over ClickUp. ClickUp remains the internal source of truth for task management and team communication. The portal exposes a simplified, responsibility-based interface to agency clients, allowing them to view task status, approve deliverables, communicate with the team, and receive targeted notifications — all without direct ClickUp access.

**Production:** https://portal.kamanin.at (live as of 2026-03-25). First production client: MBM (Nadin Bonin).

The stack consists of a React 19/Vite frontend deployed on Vercel, Supabase for authentication, database, and serverless functions, and ClickUp as the upstream data provider connected via API and webhooks.

## 2. High-Level Architecture

### Frontend

- React 19 with TypeScript, built via Vite
- TanStack React Query for server state management
- Supabase Realtime subscriptions for live updates
- Tailwind CSS v4 with a custom design system (shadcn/ui components)
- React Router v7 for client-side routing
- Motion v12 (`motion/react`) for animations
- **Deployed on Vercel** — auto-deploys from `main` branch to https://portal.kamanin.at
  - `vercel.json`: SPA rewrites + `/auth/v1/*` proxy to self-hosted Supabase auth
  - Feature branches get Vercel preview URLs (replaces staging branch)
  - Magic link enabled — GoTrue SMTP configured via Mailjet; `auth-email` Edge Function delivers branded magic link emails

### Supabase Backend

- PostgreSQL database with Row Level Security (RLS) on all tables
- Supabase Auth for user authentication (email/password)
- Edge Functions (Deno) as the API proxy layer between the portal and ClickUp
- Supabase Realtime for pushing database changes to connected clients
- All tables use `REPLICA IDENTITY FULL` to support filtered Realtime subscriptions

### task_cache Layer

- Local mirror of ClickUp task data, scoped per user (`profile_id`)
- Stores full task payload in a `raw_data` JSONB column alongside denormalized top-level fields (`status`, `status_color`, `last_activity_at`)
- Filtered by `is_visible` flag (derived from ClickUp custom field "Visible in client portal")
- UI reads exclusively from this table, never directly from ClickUp
- Populated on first load via `fetch-clickup-tasks` Edge Function, then refreshed in background

### comment_cache

- Unified comment storage for both task comments and support chat messages
- Keyed by `clickup_comment_id` + `profile_id` (composite unique constraint)
- Stores both original `comment_text` (with prefixes) and cleaned `display_text` (for portal rendering)
- Portal-originated comments are protected during sync: `attachments` and `is_from_portal` fields are never overwritten by background sync or webhooks

### notifications

- Persistent in-app notification records
- Types constrained to `team_reply` and `status_change` via `notifications_type_check`
- Inserted by the `clickup-webhook` Edge Function
- Displayed in the "Letzte Updates" feed on the dashboard
- Support chat notifications are excluded from this feed

### read_receipts

- Tracks per-user read state for tasks and notifications
- Uses timestamps to determine unread status
- Updated on user interaction (opening task detail, viewing notifications)

### RLS Policies

- All core tables enforce RLS
- Users can only access records matching their `profile_id` or `auth.uid()`
- Service role key used only in Edge Functions for cross-user operations (webhook processing)

### Edge Functions

- Deno-based serverless functions deployed on Supabase
- Pinned to `@supabase/supabase-js@2.47.10`
- All ClickUp API calls proxied through Edge Functions (clients never call ClickUp directly)
- Shared utilities in `_shared/` folder: CORS, logging (with `correlationId`), `fetchWithRetry`, `fetchWithTimeout`, `parseClickUpTimestamp`
- Consistent response contract: `{ ok, code, message, correlationId }`
- PII automatically scrubbed from logs
- 10-second timeout on all external API calls
- Exponential backoff on retries (429, 5xx)
- JWT verification disabled (`verify_jwt = false` in config) — auth handled via Bearer token validation in function code

### ClickUp Webhooks

- Registered manually via ClickUp API (`POST /team/{team_id}/webhook`)
- Endpoint: `https://portal.db.kamanin.at/functions/v1/clickup-webhook`
- Subscribed events: `taskStatusUpdated`, `taskCommentPosted`
- Optional signature verification via `CLICKUP_WEBHOOK_SECRET` (HMAC SHA-256)
- Rate limited: 100 events per 60 seconds per webhook ID
- Handles: status change notifications, comment routing, task_cache updates, email triggers

### Email System

- Mailjet as the email delivery provider
- Triggered exclusively from Edge Functions (never from frontend)
- Email types: `task_review`, `task_completed`, `message_digest`, `team_question`, `support_response`, `step_ready`, `project_reply`, `credit_approval`, `pending_reminder`, `magic_link`, `password_reset`, `email_confirmation`, `signup`, `invite`, `email_change`
- Gated by per-user `email_notifications` flag in profiles
- Only sent for client-visible tasks and client-facing comments
- Automated reminder schedule for tasks in `needs_attention` status: 3, 5, 10 days

### Realtime Subscriptions

- Frontend subscribes to `task_cache`, `notifications`, `comment_cache` changes
- Filtered by `profile_id` to respect multi-tenancy
- Debounced query invalidation (300ms) to handle event bursts
- Fallback to 30-second polling if Realtime connection fails

## 3. Data Flow

### Inbound: ClickUp to Portal

```
ClickUp status/comment change
  -> ClickUp sends webhook POST to clickup-webhook Edge Function
  -> Edge Function validates payload, checks task visibility
  -> Updates task_cache (status, status_color, last_activity_at)
  -> Inserts comment into comment_cache (if client-facing)
  -> Inserts notification record
  -> Sends email via send-mailjet-email (if applicable)
  -> Supabase Realtime detects row changes
  -> Frontend receives Realtime event
  -> React Query invalidates affected queries
  -> UI re-renders with fresh data from cache tables
```

### Outbound: Portal to ClickUp

```
Client performs action (comment, approve, cancel, etc.)
  -> Frontend calls Edge Function (post-task-comment, update-task-status)
  -> Edge Function authenticates user, validates input
  -> Edge Function calls ClickUp API
  -> ClickUp processes the change
  -> ClickUp fires webhook back to clickup-webhook
  -> Webhook updates cache tables
  -> Realtime pushes update to frontend
  -> UI reflects the change
```

### Initial Load

```
User opens portal
  -> useClickUpTasks reads from task_cache (instant)
  -> If cache empty: blocking fetch from fetch-clickup-tasks Edge Function
  -> If cache exists: background refresh via fetch-clickup-tasks
  -> Fresh data upserted into task_cache
  -> Stale tasks marked is_visible=false
  -> Query invalidated to pick up changes
```

## 4. Database Tables

### task_cache

Local mirror of ClickUp tasks. One row per task per user. Stores denormalized fields (`status`, `status_color`, `priority`, `due_date`, `list_id`, `list_name`, `last_activity_at`, `created_by_name`) alongside the full ClickUp payload in `raw_data` (JSONB). The `is_visible` flag controls whether the task appears in the portal. Keyed by `clickup_id` + `profile_id`.

### comment_cache

Unified storage for task comments and support chat messages. Stores original and display-cleaned text, author metadata, portal origin flag, and optional file attachments. Keyed by `clickup_comment_id` + `profile_id`. Portal-originated records are protected from overwrite during sync.

### notifications

Persistent in-app notifications. Two types: `team_reply` (new comment) and `status_change` (task state transition). Contains `title`, `message`, optional `task_id` and `comment_id` references, and `is_read` flag. Inserted by the webhook function, displayed in the dashboard feed.

### profiles

User configuration table. Stores `full_name`, `email`, `company_name`, `clickup_list_ids` (JSONB array of ClickUp list IDs the user is subscribed to), `email_notifications` toggle, `avatar_url`, and `support_task_id` (links to a dedicated ClickUp task for support chat). Linked to `auth.users` via `id`.

### read_receipts

Per-user read state tracking. Uses timestamps to determine which items are unread. Updated when users interact with tasks or notifications.

### auth.users (Supabase managed)

Standard Supabase Auth user table. Referenced by `profiles.id`.

## 5. Architectural Decisions

### Clients never access ClickUp

All ClickUp API calls are proxied through Supabase Edge Functions. The ClickUp API token is stored as a server-side secret, never exposed to the frontend. This ensures the portal controls exactly what data clients can see and what actions they can perform.

### UI reads only from cache tables

The frontend never calls ClickUp directly. All data comes from `task_cache` and `comment_cache`. This provides instant load times (cache-first), consistent data shape, and enables Realtime subscriptions for live updates.

### raw_data JSON storage design

The full ClickUp task payload is stored in `raw_data` (JSONB) for forward compatibility and rich rendering. However, critical fields (`status`, `status_color`, `last_activity_at`) are also stored as top-level columns. The transformation logic prioritizes top-level columns over `raw_data` values to ensure webhook-driven updates are reflected immediately, even when `raw_data` is stale.

### Webhook dependency

The system depends on ClickUp webhooks for real-time updates. If the webhook becomes suspended (e.g., after repeated delivery failures), notifications stop and task_cache updates are delayed until the next manual sync. There is currently no automated health monitoring for webhook status.

### Optimistic UI logic

Task creation uses optimistic updates: the task appears in the UI immediately with an `_optimistic` flag while the Edge Function creates it in ClickUp. If creation fails, the optimistic entry is removed. Comments do not use optimistic UI.

### Realtime invalidation

Supabase Realtime events trigger React Query invalidation rather than direct cache mutation. This ensures the UI always shows data consistent with the database query (including ordering). Invalidation is debounced at 300ms to batch rapid webhook-driven updates.

### Separation of email vs bell notifications

Email notifications are sent for high-priority events only: `Client Review` status and `Done/Completed` status. In-app notifications (bell/feed) cover a broader set of events including `In Progress` transitions. Support chat notifications are handled independently via email and a badge on the support button, explicitly excluded from the dashboard feed.

## 6. Known Technical Risks

### Cache miss notification issue

When a webhook arrives for a task not yet in `task_cache` (e.g., newly created task, user has not opened portal), the system cannot resolve recipients via the cache. A fallback mechanism queries `profiles.clickup_list_ids` to find users subscribed to the task's list. This works but adds latency and requires an additional ClickUp API call to determine the task's `list_id`.

### Webhook timing vs cache availability

There is a race condition between ClickUp firing a webhook and the portal having cached the task. If a task is created and immediately moved to `Client Review`, the webhook may arrive before the task is cached. The fallback recipient resolution mitigates this but does not cover all edge cases.

### Relay 202XX edge errors

Supabase Edge Function invocations occasionally return `202XX` status codes (e.g., 20200). These indicate Supabase relay/routing issues, not function-level failures. The frontend should treat these as transient errors and retry.

### raw_data overriding status bug

If the `transformCachedTask` function does not correctly prioritize top-level `status` and `status_color` columns over `raw_data` values, webhook-driven status updates may be overwritten by stale `raw_data` on the next cache read. The current implementation handles this by explicitly spreading top-level fields after `raw_data`, but regressions in this logic are a recurring risk.

### Scaling considerations

- `task_cache` grows linearly with users x tasks. No automated cleanup of old/invisible tasks.
- Comment thread resolution (`checkCommentThreadContext`) makes multiple sequential API calls to ClickUp with intentional delays (1.5-2s per attempt). Under high comment volume, this could cause webhook processing latency.
- Rate limiting is per-webhook-ID in memory (not persistent). Edge Function cold starts reset the rate limit map.
- Fallback visibility checks add 1-2 additional ClickUp API calls per webhook event for uncached tasks.
