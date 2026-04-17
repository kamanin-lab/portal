# KAMANIN Portal — Architecture

## Data Flow

```
Browser → Supabase Auth → profiles table
Browser → React Query → task_cache (Supabase)
Browser → React Query → comment_cache (Supabase)
Browser → React Query → credit_transactions (Supabase)  ← credit balance
Browser → Supabase Realtime → live updates (task_cache, comment_cache, notifications, credit_transactions)
Browser → Edge Functions → ClickUp API (proxied)
Browser → Edge Functions → Nextcloud WebDAV (proxied)   ← file management
ClickUp Webhook → Edge Function → task_cache update
ClickUp Webhook → Edge Function → credit deduction (credit custom field change)
pg_cron (monthly) → credit-topup Edge Function → credit_transactions insert
```

## Key Constraints
- UI reads ONLY from cache tables (task_cache, comment_cache) for ClickUp data
- ClickUp API never called from browser
- Nextcloud WebDAV never called from browser — all file ops proxied through `nextcloud-files` Edge Function
- RLS on all tables — profile_id filter
- Realtime subscriptions debounced 300ms, fallback 30s polling via React Query staleTime

## Role-Based Access Control (Viewer Guard)

Viewer-role users (`org_members.role = 'viewer'`) are restricted from mutating actions at both the frontend and backend layers.

### Frontend guards (via `useOrg().isViewer`)
- `TaskActions` — no Freigeben / Änderungen anfordern buttons (tickets module, Phase 11)
- `CreditApproval` — no cost approval button (tickets module, Phase 11)
- `TicketsPage` NewTaskButton — hidden for viewers (tickets module, Phase 11)
- `StepActionBar` — returns null for viewers; no action bar shown when a project step is in CLIENT REVIEW (projects module, Phase 14)

### Backend guards (`supabase/functions/_shared/org.ts`)
- `getNonViewerProfileIds(supabase, profileIds)` — batch helper that filters a list of profile IDs to admin/member roles only; permissive fallback (returns full list) on DB error
- Applied in `clickup-webhook/index.ts`: `task_review` and `step_ready` email sends are filtered — viewers do not receive action-required emails
- Bell (in-app) notifications remain unfiltered — all org members including viewers see notification badges

## Notification Fan-out

Two symmetric paths deliver notifications to org members:

| Path | Trigger | Actor | Recipients |
|------|---------|-------|-----------|
| `clickup-webhook` | Agency posts comment in ClickUp (`@client:` or threaded reply) | Agency team | All org members with task access |
| `post-task-comment` | Portal user posts comment (ticket or project chat) | Portal user (org member) | All other org members except author and viewers |

Both paths resolve recipients through the org membership layer and both respect per-user notification preferences before sending email.

### `getOrgContextForUserAndTask` (authorization primitive)

Located in `supabase/functions/_shared/org.ts`. Used by `post-task-comment` to validate the fan-out is safe before executing it.

**Returns:** `{ orgId, surface, memberProfileIds, taskBelongsToOrg, projectConfigId }`

**Resolution logic:**
1. Resolve `orgId` from the caller's own `org_members` row (never from `task_cache` — robust to cache misses)
2. Determine task surface: check `task_cache` for tickets, `project_task_cache` for project tasks
3. Validate ownership: tickets → `organizations.clickup_list_ids` contains task's list ID; project tasks → `project_configs.organization_id` matches caller's org
4. If `taskBelongsToOrg === false`, fan-out is skipped entirely (cross-org guard)

This helper makes peer notification fan-out safe: it cannot leak notifications across org boundaries even if a task ID is guessed.

## Module Structure
- `src/shared/` — auth, layout, hooks, lib, types; also contains `pages/HilfePage` (FAQ), `components/help/` (FaqItem, FaqSection), and `hooks/useOrg.ts` (OrgProvider context)
- `src/modules/projects/` — Project Experience (live Supabase: project_config, project_task_cache, step_enrichment)
- `src/modules/tickets/` — Tasks/Support + Credit display (live Supabase: task_cache, comment_cache, credit_transactions)
- `src/modules/files/` — Client file browser (Nextcloud WebDAV via nextcloud-files Edge Function, root from organizations.nextcloud_client_root)
- `src/modules/organisation/` — Admin-only org management page at `/organisation` (TeamSection, InviteMemberDialog, MemberRowActions, OrgInfoSection, RolesInfoSection). Visible only to admin-role users.
- `src/app/` — routing, providers

## Hilfe / FAQ
- Static content — no backend calls
- `src/shared/lib/hilfe-faq-data.ts` — `FAQ_SECTIONS` array (6 sections, 20 items, German)
- `src/shared/pages/HilfePage.tsx` — renders FAQ sections with whileInView stagger animation
- `src/shared/components/help/FaqItem.tsx` / `FaqSection.tsx` — accordion and section card components

## Sidebar Zones (Linear-style)
1. **Global** — Inbox, Meine Aufgaben
2. **Workspaces** — dynamic from `client_workspaces` table (module_key → route)
3. **Utilities** — Hilfe, Konto, CreditBalance badge (hidden when no package configured)

## Task Creation (Dual Mode)
```
NewTicketDialog (mode="ticket" | "project")
        │
        ▼
useCreateTask hook → Edge Function: create-clickup-task
        │
        ├── mode=ticket: POST to profile's ClickUp list → upsert task_cache
        └── mode=project: POST to project's ClickUp list → upsert project_task_cache
                          + set chapter custom field (phase assignment)
```

## AI Enrichment (Project Steps)
```
fetch-project-tasks Edge Function (triggered on first project page load)
  1. Fetch tasks from ClickUp list → upsert project_task_cache
  2. For NEW tasks not in step_enrichment:
     → Batch by 10 → Claude Haiku API → generate why_it_matters + what_becomes_fixed
     → Upsert step_enrichment (keyed by clickup_task_id)
  3. Frontend: useProject → transformToProject merges enrichment into Step objects
```

## Auth
Supabase Auth — email/password + magic link
Profile auto-created via `on_auth_user_created` trigger on `auth.users`

## Data Sources

### Supabase (primary)
- URL: https://portal.db.kamanin.at
- Project: self-hosted (PostgreSQL 15.8) on Coolify
- Tables: profiles, organizations, org_members, task_cache, comment_cache, notifications, read_receipts, project_config, chapter_config, project_task_cache, step_enrichment, project_access, client_workspaces, credit_packages, credit_transactions

### Nextcloud (file storage)
- Source of truth for all project and client files
- Accessed exclusively via `nextcloud-files` Edge Function (WebDAV)
- Client root: `profiles.nextcloud_client_root` (per-user path, e.g., `/clients/muster-gmbh/`)
- Project root: `project_config.nextcloud_root_path`
- Three-level access: `_intern/` (internal only), `team/` (KAMANIN team), `portal/` (client-visible)

### ClickUp (task management)
- All access proxied through Edge Functions (API token server-side only)
- Webhook events flow: ClickUp → `clickup-webhook` Edge Function → task_cache + credit_transactions

## Frontend Deployment (Vercel)

Frontend deploys to Vercel from the `main` branch automatically on push.

- **Production URL:** https://portal.kamanin.at (custom domain, DNS A → 76.76.21.21)
- **Preview URLs:** every PR / feature branch gets an auto-generated Vercel preview URL (replaces the old staging branch)
- **`vercel.json`:** SPA rewrites for client-side routing + auth proxy (`/auth/v1/*` → `https://portal.db.kamanin.at/auth/v1/*`)
- **Env vars (all 3 environments):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MEMORY_OPERATOR_EMAILS`
- **Magic link** enabled — GoTrue SMTP configured on the self-hosted instance via Mailjet; `auth-email` Edge Function delivers branded magic link emails

### Deploy commands
```bash
vercel             # preview deploy
vercel --prod      # production deploy (or just push to main)
```

## Edge Functions Deployment (self-hosted)

Supabase CLI does NOT work with self-hosted instances. Edge Functions are deployed via **volume mount**.

```
Host:      /data/coolify/services/ngkk4c4gsc0kw8wccw0cc04s/volumes/functions
Container: /home/deno/functions (edge-runtime v1.67.4)
```

### How it works
- Kong gateway routes `/functions/v1/*` → edge-runtime port 9000 (strip_path: true)
- `main/index.ts` is the **router** — it receives ALL requests, extracts function name from URL path, and creates isolated workers via `EdgeRuntime.userWorkers.create()`
- Individual functions live in `{name}/index.ts` and are loaded on-demand
- `_shared/` contains cors.ts, logger.ts, utils.ts, emailCopy.ts (imported via `../_shared/`)
- Env vars (secrets) set in Coolify UI → Edge Functions service → Environment Variables

### Deployment process
1. Write/update files to host volume path (via Coolify Server Terminal or git clone)
2. Ensure `main/index.ts` is the official router (NOT a placeholder)
3. Set secrets in Coolify UI
4. Restart edge-runtime container
5. Verify: `curl -s http://<edge-runtime-IP>:9000/<function-name>`

### 16 Functions + main router
fetch-clickup-tasks, fetch-task-comments, fetch-single-task, post-task-comment, update-task-status, clickup-webhook, fetch-project-tasks, send-mailjet-email, create-clickup-task, auth-email, send-feedback, send-support-message, manage-project-memory, nextcloud-files, credit-topup, send-reminders

#### nextcloud-files
Actions: `list` (PROPFIND), `upload` (PUT), `upload-client-file` (PUT, client files), `download` (GET proxy), `mkdir` (MKCOL, recursive), `delete` (DELETE, project files), `delete-client` (DELETE, client files).
Parameters: `project_config_id` or direct path; `sub_path` for subfolder navigation; `folder_path` for mkdir target.
Path safety: rejects `..` traversal and control characters.
Upload size limit: removed from `upload` and `upload-client-file` actions; retained for `upload-task-file`.

#### credit-topup
Triggered by pg_cron on a monthly schedule.
Reads all active `credit_packages`, inserts `monthly_topup` transactions into `credit_transactions`.
Also callable manually for backfill.

#### send-reminders
Sends automated email reminders for tasks stuck in `needs_attention` (Client Review) status.
Follows a 3-5-10 day schedule from last activity. Respects per-user `notification_preferences.reminders` toggle.
