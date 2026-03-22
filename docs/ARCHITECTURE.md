# KAMANIN Portal — Architecture

## Data Flow

```
Browser → Supabase Auth → profiles table
Browser → React Query → task_cache (Supabase)
Browser → React Query → comment_cache (Supabase)
Browser → Supabase Realtime → live updates
Browser → Edge Functions → ClickUp API (proxied)
ClickUp Webhook → Edge Function → task_cache update
```

## Key Constraints
- UI reads ONLY from cache tables (task_cache, comment_cache)
- ClickUp API never called from browser
- RLS on all tables — profile_id filter
- Realtime subscriptions debounced 300ms, fallback 30s polling

## Module Structure
- `src/shared/` — auth, layout, hooks, lib, types
- `src/modules/projects/` — Project Experience (live Supabase: project_config, project_task_cache, step_enrichment)
- `src/modules/tickets/` — Tasks/Support (live Supabase: task_cache, comment_cache)
- `src/app/` — routing, providers

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

## Supabase
- URL: https://portal.db.kamanin.at
- Project: self-hosted (PostgreSQL 15.8) on Coolify
- Tables: profiles, task_cache, comment_cache, notifications, read_receipts, project_config, chapter_config, project_task_cache, step_enrichment, project_access, client_workspaces

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

### 13 Functions + main router
fetch-clickup-tasks, fetch-task-comments, fetch-single-task, post-task-comment, update-task-status, clickup-webhook, fetch-project-tasks, send-mailjet-email, create-clickup-task, auth-email, send-feedback, send-support-message, manage-project-memory
