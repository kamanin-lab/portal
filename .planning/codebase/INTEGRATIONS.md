# External Integrations

**Analysis Date:** 2026-03-26

## APIs & External Services

**ClickUp Task Management:**
- **Service:** ClickUp (task/project management for KAMANIN team)
- **What it's used for:** Source of truth for all client-facing tasks, comments, status changes, and custom field data
- **SDK/Client:** HTTP API (no official SDK; Edge Functions use `fetch()` with Bearer token auth)
- **Auth:** `CLICKUP_API_TOKEN` env var (Bearer token in Authorization header)
- **Integration Points:**
  - `supabase/functions/fetch-clickup-tasks/` - Syncs all ClickUp tasks from configured lists to `task_cache` (triggered on login, or 30s polling fallback)
  - `supabase/functions/fetch-single-task/` - Fetches individual task details for detail view
  - `supabase/functions/fetch-task-comments/` - Fetches task comments filtered for client visibility
  - `supabase/functions/post-task-comment/` - Posts new comments to ClickUp task (portal users → ClickUp)
  - `supabase/functions/create-clickup-task/` - Creates new task in ClickUp (dual-mode: ticket list or project with chapter custom field)
  - `supabase/functions/update-task-status/` - Updates task status in ClickUp (e.g., Approve, Request Changes)
  - `supabase/functions/clickup-webhook/` - Receives webhooks from ClickUp on task changes, syncs to `task_cache`, broadcasts via Realtime
- **Webhook:** Listens for ClickUp webhooks at `/functions/clickup-webhook` with signature verification (`CLICKUP_WEBHOOK_SECRET`)
- **Custom Fields:**
  - Visibility toggle: `CLICKUP_VISIBLE_FIELD_ID` (boolean - controls task visibility in portal)
  - Chapter/Phase: Used for project tasks to map to chapter_config rows (resolves via custom field type options)
  - Credits: `CLICKUP_CREDITS_FIELD_ID` (numeric - synced to task_cache.credits)
- **Caching Strategy:** All UI reads from `task_cache` (never direct ClickUp API), Edge Functions proxy all writes back to ClickUp
- **Rate Limiting:** ClickUp API has rate limits; Edge Functions implement exponential backoff and retry logic

**Nextcloud File Storage:**
- **Service:** Nextcloud (file hosting, source of truth for project files)
- **What it's used for:** Client file browsing, uploading, downloading; document repository for project deliverables
- **SDK/Client:** WebDAV protocol (HTTP-based file operations)
- **Auth:** Basic auth (`NEXTCLOUD_USER` + `NEXTCLOUD_PASSWORD`)
- **Integration Points:**
  - `supabase/functions/nextcloud-files/` - Multi-action WebDAV proxy:
    - `list` - PROPFIND to browse project folders
    - `download` - Stream file bytes to browser
    - `upload` - Accept multipart form data, PUT to Nextcloud
    - `mkdir` - Recursive MKCOL for folder creation
    - Client-root actions: browse/upload without project_config_id via `profiles.nextcloud_client_root`
    - Project-scoped actions: require `project_access` verification
  - `src/modules/projects/hooks/useNextcloudFiles.ts` - Frontend hook to fetch/upload files (calls Edge Function via fetch)
- **Path Structure:**
  - Project root: `NEXTCLOUD_URL/remote.php/dav/files/{user}/{client_root}/{project_folder}`
  - Client root: `NEXTCLOUD_URL/remote.php/dav/files/{user}/{profiles.nextcloud_client_root}`
- **Security:** Path sanitization via `isPathSafe()`, all paths prefix-checked against expected root

**Mailjet Email Service:**
- **Service:** Mailjet (transactional email provider)
- **What it's used for:** Sending all email notifications (task reviews, completions, message digests, magic links, password resets)
- **SDK/Client:** HTTP API (no npm module; Edge Functions use `fetch()` with Basic auth)
- **Auth:** `MAILJET_API_KEY:MAILJET_API_SECRET` (Basic auth header)
- **API Endpoint:** `https://api.mailjet.com/v3.1/send`
- **Integration Points:**
  - `supabase/functions/send-mailjet-email/` - Main email dispatcher (template selection, HTML generation, Mailjet API call)
  - `supabase/functions/auth-email/` - Sends Supabase auth emails (magic link, password reset, confirmation)
  - `supabase/functions/_shared/emailCopy.ts` - Email template text/subject lines (German + English locales)
- **Email Types:**
  - `task_review` - Task needs client feedback
  - `task_completed` - Task marked done
  - `message_digest` - Summary of new comments
  - `team_question` - Team member asked a question
  - `support_response` - Reply on support chat
  - `step_ready` - Project step completed and visible
  - `project_reply` - Team reply on project task
  - `credit_approval` - Credits were approved/applied
  - `magic_link` - Magic link login
  - `password_reset` - Password reset request
  - `email_confirmation` - Email confirmation (signup)
  - `signup` - New account created
  - `invite` - User invited to portal
  - `email_change` - Email address changed
- **Template Delivery:** All HTML generated server-side in Edge Function (no MJML, pure HTML strings)

## Data Storage

**Databases:**
- **PostgreSQL** (via Supabase)
  - Instance: Self-hosted on Coolify at `portal.db.kamanin.at`
  - Connection: `VITE_SUPABASE_URL` (frontend), `SUPABASE_URL` (Edge Functions)
  - Client: `@supabase/supabase-js` (frontend), Deno native (Edge Functions via `esm.sh/@supabase/supabase-js`)
  - Tables: `profiles`, `task_cache`, `comment_cache`, `notifications`, `read_receipts`, `support_messages`, `project_config`, `project_task_cache`, `step_enrichment`, `chapter_config`, and more
  - RLS enforced: All tables filtered by `profile_id` (users see only their own data)
  - Realtime enabled: `task_cache`, `comment_cache`, `notifications` subscriptions in frontend

**File Storage:**
- **Nextcloud** (via WebDAV) - Primary source of truth for project files
  - Accessed via `supabase/functions/nextcloud-files/` Edge Function proxy
  - User paths: `NEXTCLOUD_URL/remote.php/dav/files/{NEXTCLOUD_USER}/{path}`
- **Supabase Storage** - Avatar images only
  - Bucket: `avatars`
  - Accessed via `supabase.storage.from('avatars')`
  - Used in `src/shared/components/konto/AvatarUpload.tsx`

**Caching:**
- **React Query** - Client-side HTTP response caching
  - Cache strategy: `staleTime: 1 minute` on task queries
  - Fallback polling: `refetchInterval: 30 seconds` when Realtime disconnects
- **Browser localStorage** - Session persistence
  - Supabase Auth stores JWT and refresh token via localStorage
- **Supabase Realtime subscriptions** - Real-time database change notifications
  - Debounced 300ms to avoid excessive re-renders
  - Fallback to 30s polling if Realtime connection drops

## Authentication & Identity

**Auth Provider:**
- **Supabase Auth** (self-hosted on Coolify)
  - Endpoints:
    - Auth URL: `https://portal.db.kamanin.at/auth/v1/*` (proxied from frontend via `vercel.json` rewrite)
    - Token endpoint: Auth tokens embedded in JWT claims
  - Methods:
    - **Email/Password**: `supabase.auth.signInWithPassword()` (`src/shared/hooks/useAuth.ts`)
    - **Magic Link**: `supabase.auth.signInWithOtp()` (passwordless login)
    - **Password Reset**: `supabase.auth.resetPasswordForEmail()`
  - Session Storage: localStorage with auto token refresh
- **JWT Verification:** Main Edge Function router verifies JWT if `VERIFY_JWT=true` (optional)
  - Secret: `JWT_SECRET` env var
  - Library: `https://deno.land/x/jose@v4.14.4` (Deno-native JWT handling)

**Authorization:**
- **RLS (Row Level Security):** PostgreSQL policies enforce row-level filtering
  - Policy rule: `profile_id = auth.uid()`
  - Applied to: `task_cache`, `comment_cache`, `notifications`, `read_receipts`, `support_messages`, `project_config`, etc.
- **Project Access Control:** `project_access` table gating (which projects a user can view)
  - Checked in `fetch-project-tasks/` before serving project task data
- **Memory Operator Access:** `VITE_MEMORY_OPERATOR_EMAILS` allows specific users to manage project memory
  - Validated in `src/modules/projects/lib/memory-access.ts`

## Monitoring & Observability

**Error Tracking:**
- Not externally integrated (internal console logging only)
- Edge Functions use `createLogger()` from `_shared/logger.ts` (logs to Deno stdout/stderr)
- Frontend uses `src/modules/tickets/lib/logger.ts` (console.log with log levels)

**Logs:**
- **Edge Functions:** Deno runtime logs (captured in Coolify container logs)
- **Frontend:** Browser console (DEV mode shows DEBUG, production shows INFO+)
- **Database Queries:** Supabase dashboard (self-hosted instance) shows query performance, error rates

## CI/CD & Deployment

**Hosting:**
- **Frontend:** Vercel (https://portal.kamanin.at)
  - Auto-deploy on `main` branch push
  - Build command: `npm run build`
  - Output: Static SPA (dist/)
- **Backend:** Coolify (self-hosted)
  - Supabase instance (PostgreSQL + Auth + Realtime) managed in Coolify
  - Edge Functions deployed via volume mount to Coolify container at `/home/deno/functions/`
  - Main router at `/functions/main` dispatches requests to individual worker functions
  - Reverse proxy: Traefik routes requests from `portal.db.kamanin.at` to Coolify container

**CI Pipeline:**
- None formally configured (manual review + post-code review via `scripts/openrouter-review.cjs`)
- Post-code review: `node scripts/openrouter-review.cjs` (GPT-5.4-mini via OpenRouter API)
  - Requires `OPENROUTER_API_KEY` in `.env.local`
  - Reads uncommitted git changes via `git diff`
  - Returns verdict: APPROVE / REVISE with blocking/non-blocking issues

## Environment Configuration

**Required env vars (Frontend - `.env.local`):**
- `VITE_SUPABASE_URL` - Self-hosted Supabase instance URL
- `VITE_SUPABASE_ANON_KEY` - Public anonymous key
- `OPENROUTER_API_KEY` - (Optional) For post-code review script

**Required env vars (Edge Functions - deployed to Coolify):**
- `SUPABASE_URL` - Backend Supabase instance
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (never expose to frontend)
- `CLICKUP_API_TOKEN` - ClickUp API Bearer token
- `CLICKUP_WEBHOOK_SECRET` - Webhook signature secret
- `CLICKUP_VISIBLE_FIELD_ID` - Custom field ID for visibility
- `CLICKUP_CREDITS_FIELD_ID` - Custom field ID for credits
- `NEXTCLOUD_URL` - Nextcloud server URL
- `NEXTCLOUD_USER` - WebDAV username
- `NEXTCLOUD_PASSWORD` - WebDAV password
- `MAILJET_API_KEY` - Mailjet API key
- `MAILJET_API_SECRET` - Mailjet API secret
- `JWT_SECRET` - (Optional) For JWT verification
- `VERIFY_JWT` - (Optional) Enable JWT verification ("true"/"false")
- `CLAUDE_API_KEY` - (Optional) For AI enrichment in fetch-project-tasks

**Secrets location:**
- Frontend: `.env.local` (git-ignored)
- Edge Functions: Coolify environment variables (persisted in Docker compose config)
- Supabase Auth: Self-hosted, managed via Coolify dashboard

## Webhooks & Callbacks

**Incoming:**
- **ClickUp Webhooks:**
  - Endpoint: `POST /functions/clickup-webhook` (via main router)
  - Events: task status changes, comments, custom field updates, task creation
  - Signature verification: `X-Clickup-Signature` header against `CLICKUP_WEBHOOK_SECRET`
  - Handler: `supabase/functions/clickup-webhook/index.ts` (updates task_cache, comment_cache, sends notifications)

**Outgoing:**
- **Email Notifications:** Mailjet triggers on-send (no callback used)
- **No webhooks sent to external services** (ClickUp is source-of-truth, not recipient)

---

*Integration audit: 2026-03-26*
