# System Constraints

## Non-Negotiables

### Supabase backend

All backend functionality runs on Supabase: PostgreSQL database, Auth, Edge Functions, Realtime, and Storage. No alternative backend providers are supported. Edge Functions are the only server-side execution environment.

### ClickUp remains internal system of record

ClickUp is the authoritative source for task data, statuses, and team communication. The portal is a read-mostly projection. All writes (comments, status changes) are proxied to ClickUp via Edge Functions and flow back through webhooks. The portal never stores task state that contradicts ClickUp.

### No direct client access to ClickUp

Clients never interact with the ClickUp API, UI, or data directly. The ClickUp API token is a server-side secret. All client-facing data is mediated through cache tables and Edge Functions.

### Cache tables power the UI

The frontend reads exclusively from `task_cache` and `comment_cache`. These tables are the UI data source. ClickUp API is never called from the browser. This ensures instant load times, consistent data shape, and enables Realtime-driven updates.

### RLS enforced

Row Level Security is enabled on all core tables (`task_cache`, `comment_cache`, `notifications`, `read_receipts`, `profiles`). Users can only access their own records. Edge Functions use the service role key for cross-user operations (webhook processing, notification delivery).

### Email triggers controlled internally

Email notifications are sent exclusively from Edge Functions using the service role. The frontend cannot trigger emails directly. Email delivery is gated by: task visibility, client-facing comment filter, per-user `email_notifications` toggle, and event type.

### Portal acts as projection layer

The portal does not add workflow complexity. It maps ClickUp statuses to a simplified set, hides internal statuses, and exposes only actions that are meaningful for clients. The mapping is defined in `.lovable/ClientPortal_ClickUp_TaskLifecycle_FINAL.md` and is the authoritative reference for status behavior.

### Lovable remains generation tool

The frontend is generated and maintained via Lovable. Code changes go through Lovable's AI-assisted editing workflow. The project uses Lovable's standard stack: React, Vite, TypeScript, Tailwind CSS, shadcn/ui.

## Operational Constraints

### Webhook dependency

Real-time notifications and task_cache updates depend on ClickUp webhook delivery. If the webhook becomes suspended (ClickUp suspends after repeated delivery failures), the portal loses real-time sync. There is no automated recovery — the webhook must be manually deleted and recreated via the ClickUp API. The portal continues to function with stale cached data during webhook outages; manual force-refresh from the UI triggers a full sync.

### Realtime consistency

Supabase Realtime is the primary mechanism for pushing updates to connected clients. If Realtime fails (connection issues, subscription errors), the system falls back to 30-second polling via React Query's `staleTime` configuration. However, during Realtime outages, updates may be delayed by up to 30 seconds. Query invalidation is debounced at 300ms to handle event bursts without excessive re-renders.

### Notification accuracy

Notification delivery depends on correct resolution of task-to-user mapping. The primary path uses `task_cache` lookups. When a task is not cached (new task, user has not visited portal), a fallback queries `profiles.clickup_list_ids` to find subscribed users. This fallback requires an additional ClickUp API call to determine the task's `list_id`. If both paths fail, the notification is silently dropped. The `notifications_type_check` constraint restricts notification types to `team_reply` and `status_change` — any new type must be added to the constraint or mapped to an existing type.

### Minimal email noise

Email notifications are restricted to high-signal events: tasks entering `Client Review` (needs client action), tasks reaching `Done/Completed` (deliverable finalized), and client-facing comments (team questions, support responses). Status transitions like `In Progress` generate in-app notifications only, not emails. The `@client:` prefix and thread-context analysis ensure that internal ClickUp comments never trigger client emails. Automated reminders follow a 3-5-10 day schedule for tasks stuck in `needs_attention`.

### Clear UX hierarchy

The portal enforces a single attention trigger: "Needs Your Attention" (mapped from ClickUp `Client Review`). This is the only status that surfaces primary action buttons (Approve, Request Changes). All other statuses show only secondary actions (Put on Hold, Cancel) in a subtle, non-distracting style. The filter bar prioritizes "Needs Your Attention" when tasks exist in that state. The dashboard "Letzte Updates" feed shows task events only — support chat is explicitly excluded to separate structured task events from unstructured conversations.
