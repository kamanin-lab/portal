# Architecture Decision Records

## ADR-034: Embedding third-party MCP Apps in the portal via @mcp-ui/client (2026-04-23)
**Date:** 2026-04-23
**Status:** Accepted (POC — staging only)

**Context:** Revenue Intelligence POC requires rendering a Kamanda-built MCP App widget (`daily_briefing`) inside the portal. Options: (a) build the widget from scratch in React, (b) use `@mcp-ui/client` `AppRenderer` which handles the full MCP Apps protocol (AppBridge postMessage, tool invocation, UI Resources, sandbox iframe), (c) embed as a plain `<iframe>` without MCP protocol support.

**Decision:** Use `@mcp-ui/client` v7 as the rendering layer. Build a hardened Supabase Edge Function (`mcp-proxy`) as the only portal-side contact point with the upstream MCP server.

**Why @mcp-ui/client over building from scratch:** The MCP Apps protocol (AppBridge, `ui/open-link`, ResizeObserver height reporting, srcdoc sandbox, SSE tool result streaming) has significant surface area. `@mcp-ui/client` encapsulates all of it and is maintained by the MCP Apps spec authors. Building from scratch would replicate that complexity with higher maintenance burden.

**Why a hardened proxy EF rather than direct browser → MCP server:** (1) The upstream MCP server URL and any future auth tokens must not be exposed to the browser. (2) A `client_workspaces` gate enforces module-level access control at the server without trusting client-side guards alone. (3) A whitelist of allowed methods + tool names provides defense-in-depth even if the upstream server's own schema validation is relaxed.

**Whitelist rationale:** The proxy whitelists `initialize | tools/list | tools/call (4 named tools) | resources/list | resources/read (uri startsWith "ui://")`. This is intentionally tighter than the upstream schema. If a future tool is added upstream, the whitelist must be updated explicitly — the conservative default prevents accidental exposure of new tools before they are reviewed.

**Sandbox proxy same-origin compromise:** `public/sandbox-proxy.html` lives on `staging.portal.kamanin.at`. The MCP Apps spec recommends a separate origin for the sandbox proxy to provide true iframe isolation. Same-origin was chosen for the POC to avoid provisioning an additional subdomain and TLS cert before the approach is validated. A TODO comment in the file marks this for remediation before multi-client production rollout.

**Response envelope:** `mcp-proxy` returns `{ok, code, correlationId, message?, data?}` matching the newer EF convention. The `data` field carries the raw MCP response body (JSON or parsed SSE). `useMcpProxy` unwraps the JSON-RPC `{result}` envelope from `data` before passing to `AppRenderer`.

**Consequences:**
- `@mcp-ui/client` bundles `@modelcontextprotocol/sdk` transitively — do NOT install the SDK separately (version conflict risk).
- `useMcpProxy` must be `useMemo`-stabilized; identity churn on the returned object caused an infinite `tools/call` loop during development (see `feedback_react_hook_identity_churn.md`).
- Upstream tool names / URI prefixes must be verified by curling the actual MCP server before writing whitelist rules (5 bugs were caused by trusting the user-provided brief instead — see `feedback_upstream_api_probe.md`).
- Module is behind `WorkspaceGuard moduleKey="revenue-intelligence"` + EF `client_workspaces` gate — two independent access control layers.

---

## ADR-033: Department-based ticket visibility via ClickUp Labels (not Dropdown, not Tags, not per-person assignments) (2026-04-21)
**Date:** 2026-04-21
**Status:** Accepted

**Context:** When orgs have specialized roles (SEO agency, marketing team) or external contractors, all members see all tickets. Need role-based ticket filtering without per-person ClickUp assignments (clients are not in ClickUp workspace).

**Decision:** Use ClickUp custom field of type `labels` (multi-select) named "Fachbereich" for department tagging. Portal reads and uses these labels; KAMANIN configures them in ClickUp UI.

**Why Labels, not Dropdown:** `drop_down` in ClickUp is single-select (one option UUID string). `labels` is multi-select (array of option UUIDs). Tasks can belong to multiple departments (e.g., SEO + Marketing), so labels is required.

**Why not Tags:** ClickUp tags are space-global and have no structured option IDs. Labels on a custom field provide stable UUIDs that survive renames, are scoped to the field, and integrate cleanly with the existing custom-field infrastructure.

**Why not per-person assignments:** (1) 150+ archived tickets cannot be retroactively assigned. (2) New team members would not see historical tickets. (3) Agency does not track who in the client team handles what. Department grouping solves all three.

**Checklist for KAMANIN when configuring per client:**
1. In ClickUp list, create custom field named exactly "Fachbereich"
2. Set field type to "Labels" (NOT Dropdown)
3. Add options: Geschaftsfuhrung, Marketing, SEO, Buchhaltung, etc.
4. In portal /organisation, click "Neu synchronisieren" to detect the field
5. Assign departments to org members via the department picker on member rows

**Consequences:**
- Zero regression for existing orgs (all defaults are empty = legacy behavior)
- Single SQL function `can_user_see_task` is source of truth for both RLS policy and server-side fan-out
- If field is renamed in ClickUp, autodetect by name breaks; admin must re-sync via /organisation
- If field options are deleted in ClickUp, orphan option_ids in member/task arrays persist but cause no errors (overlap just fails silently)
- Webhook always does GET /task/{id} for reliable custom_fields (payload structure for labels is not guaranteed)

## ADR-032: Reject pre-built codebase knowledge graphs (2026-04)
**Date:** 2026-04-18
**Status:** Accepted (reject)

**Context:** Every new task, Claude Code agents re-read large parts of `src/` to orient themselves. Two third-party tools promised to reduce this: `code-review-graph` (MCP-based, 30 tools) and `graphify` (AST-based markdown report). Both build local graphs without LLM API calls.

**Decision:** Reject both. Evaluated on a controlled benchmark (2 real tasks × 3 modes, 6 fresh subagents). Neither tool cleared the 40%-files-read reduction threshold on both tasks. code-review-graph did reduce tool calls by ~40% and improved plan accuracy (4→5), but not enough to justify adoption costs.

**Consequences:**
- Both tools' default install mutates `CLAUDE.md` + writes `.mcp.json` at repo root + installs PreToolUse hooks. Controlled pipeline would need manual flag management or manual MCP config; the tools are not polite citizens in a disciplined workflow.
- `graphify` writes output into the scanned directory (no `--output` flag), which during evaluation leaked `graphify-out/` into `src/modules/tickets/` and required manual cleanup.
- Tree-sitter extraction in both tools misses TypeScript interfaces/types — a material gap on a heavily-typed React codebase.
- Cheaper alternative proposed: hand-maintained `docs/system-context/MODULE_MAP.md` with per-module file lists and key cross-module edges. ~1h to write, ~15min/month to maintain.
- Full memo + reconsider conditions at `docs/ideas/knowledge-graph-tools.md`.
- Reconsider when: (a) either tool ships a readonly install mode, (b) TypeScript types are surfaced as graph nodes, or (c) codebase grows past ~500-700 files.

---

## ADR-001: New codebase instead of extending Lovable
**Date:** 2026-03-10
**Status:** Accepted

**Context:** Existing Lovable project (tasks/) has working Tasks/Support module but no Project Experience module. The new portal needs a different layout (collapsing sidebar vs. top header) and a new module structure.

**Decision:** Build fresh Vite + React project. Reuse all hooks, Edge Functions, and Supabase schema from Lovable project.

**Consequences:** Clean architecture, proper module separation. Hooks copied and adapted. No existing UI debt.

## ADR-002: Self-hosted Supabase as staging
**Date:** 2026-03-10
**Status:** Accepted

**Context:** Moving from Supabase cloud (yuezkvaasmfakxoqldmh) to self-hosted instance at portal.db.kamanin.at for cost control and data sovereignty.

**Decision:** Deploy schema to self-hosted PostgreSQL 15.8 instance. Use same Edge Function code.

**Consequences:** Need to redeploy Edge Functions to new instance. Schema bugs fixed during migration (handle_profile_list_change type error, missing on_auth_user_created trigger).

## ADR-003: Workspace Registry via `client_workspaces` table
**Date:** 2026-03-11
**Status:** Accepted

**Context:** Sidebar needs to know which modules are active per client. Hardcoding nav items doesn't scale to multi-client setup.

**Decision:** Create `client_workspaces` table (profile_id, module_key, display_name, icon, sort_order, is_active) with RLS. `useWorkspaces()` hook fetches active modules. `WorkspaceGuard` component protects routes.

**Consequences:** Dynamic sidebar. Module visibility configurable per client from DB. Requires seed data per user.

## ADR-004: Linear-style 3-zone sidebar
**Date:** 2026-03-11
**Status:** Accepted

**Context:** Flat nav list doesn't distinguish between global (cross-module) and workspace-specific (per-client) navigation items.

**Decision:** Three zones — Global (Inbox, Meine Aufgaben) / Workspaces (dynamic from client_workspaces) / Utilities (Hilfe). Zone headers with 10px uppercase labels. Icons-only at 56px, hover-expand to 260px.

**Consequences:** Clear separation of navigation intent. Workspaces zone scales to multiple module types.

## ADR-005: Task detail as Sheet (slide-over), not separate page
**Date:** 2026-03-11
**Status:** Accepted

**Context:** Lovable portal used a sheet pattern. Phase 3 accidentally introduced a separate `/tickets/:id` page which breaks context (loses filter state, requires navigation).

**Decision:** `TaskDetailSheet` uses `@radix-ui/react-dialog` in slide-over mode. State managed via URL search param `?taskId=xxx`. Sheet is rendered inside `TicketsPage` so filter/search state is preserved.

**Consequences:** Removed `/tickets/:id` route and `TicketDetailPage`. URL still deep-linkable.

## ADR-006: `mapStatus()` as single gateway for ClickUp status → portal status
**Date:** 2026-03-11
**Status:** Accepted

**Context:** `task_cache.status` stores raw ClickUp status strings ("client review", "to do"). Previous components compared raw strings against portal status keys — producing silent filter/badge failures.

**Decision:** All filter logic, status badge rendering, and action decisions go through `mapStatus(task.status)` from `status-mapping.ts`. Never compare `task.status` directly against portal keys. Added `status-dictionary.ts` with `mapClickUpStatus()`, `STATUS_LABELS`, `PRIORITY_LABELS`.

**Consequences:** Fixed silent bugs in TaskList filter and TaskActions needsAttention check. Single source of truth.

## ADR-007: Monorepo structure (app at root)
**Date:** 2026-03-12
**Status:** Accepted

**Context:** Project had nested structure: `kamanin-portal/` (React app) and `tickets/` (old Lovable codebase with Edge Functions). Pushing to GitHub required deciding on repo layout.

**Decision:** Flatten to monorepo — React app files at repo root, Edge Functions at `supabase/functions/`. Old directories (`kamanin-portal/`, `tickets/`) gitignored as local reference.

**Consequences:** Clean GitHub repo (`kamanin-lab/portal`). `npm install` and `npm run dev` work from root. Edge Functions path matches Supabase convention.

## ADR-008: Edge Functions deployed via volume mount (not Supabase CLI)
**Date:** 2026-03-12
**Status:** Accepted

**Context:** Supabase CLI always calls `api.supabase.com` — ignores any env var overrides. Cannot deploy to self-hosted instance. Edge-runtime container has no git/curl/wget.

**Decision:** Deploy Edge Functions by writing files to Coolify volume mount path (`/data/coolify/services/.../volumes/functions`). `main/index.ts` must be the official Supabase router (uses `EdgeRuntime.userWorkers.create()`), not a placeholder.

**Consequences:** No CI/CD for functions yet — manual deploy via Server Terminal or git clone on host. GitHub Actions workflows need updating for self-hosted target.

## ADR-009: Task creation from project context (reuse NewTicketDialog)
**Date:** 2026-03-13
**Status:** Accepted

**Context:** Users need to create ClickUp tasks directly from project pages (hero CTA, quick actions) without navigating to /tickets. Project tasks require chapter/phase assignment and go to a different ClickUp list than support tickets.

**Decision:** Reuse `NewTicketDialog` with a `mode` prop (`ticket` | `project`). In project mode, dialog receives `listId`, `chapters`, `phaseFieldId` from project config. Edge Function `create-clickup-task` routes to `project_task_cache` (project mode) or `task_cache` (ticket mode) and auto-sets chapter custom field.

**Consequences:** Single dialog component for both flows. Edge Function handles dual routing. Project tasks appear in project view after query invalidation.

## ADR-010: Volume-bar priority icons
**Date:** 2026-03-13
**Status:** Accepted

**Context:** Original priority icons used 3 equal-height bars with different fill — not intuitive. Users couldn't distinguish priority levels at a glance.

**Decision:** Ascending bars like a volume indicator: Low=1 bar, Normal=2 bars, High=3 bars (heights: 35%, 65%, 100%). Urgent uses AlertCircle icon. Inactive/ghost bars rendered at 0.15 opacity for visual context.

**Consequences:** Clearer visual hierarchy. Volume metaphor is universally understood. Ghost bars show "capacity" remaining.

## ADR-012: Nextcloud file storage as folder tree, not step-bound uploads
**Date:** 2026-03-22
**Status:** Accepted

**Context:** `UploadSheet.tsx` previously required a step binding — the user had to select a project step before uploading a file. This field had no real effect on where the file was stored in Nextcloud; it was non-functional stub code left over from an earlier design that assumed files would be tagged to steps. The semantics were unclear and the form field confused the upload flow.

**Decision:** Remove step binding entirely from `UploadSheet`. File storage location is determined solely by the folder the user is currently browsing in `FolderView`. Uploads go to `nextcloud_root_path/{current_sub_path}/`. Users can create subfolders inline. `UploadSheet` now only asks for the file itself, with the destination path derived from the active folder context.

**Consequences:**
- `ChapterFiles.tsx` deleted; replaced by `FolderView.tsx` (generic, path-driven).
- `UploadSheet.tsx` fully rewritten — no step selector, receives `subPath` from caller.
- `FilesPage.tsx` navigation state changes from `selectedChapter` to `pathSegments[]`.
- Three new hooks: `useNextcloudFilesByPath`, `useUploadFileByPath`, `useCreateFolder`.
- Edge Function `nextcloud-files` gains `sub_path` (list/upload) and `mkdir` action.
- Semantically cleaner: Nextcloud IS the file system; the portal navigates it directly.

## ADR-013: shadcn/ui adopted selectively (not full library)
**Date:** 2026-03-22
**Status:** Accepted

**Context:** The portal needed standardized UI primitives (buttons, inputs, tabs, skeletons, dialogs) that were previously hand-rolled with inconsistent styling and accessibility. Installing the full shadcn/ui library upfront would add unnecessary components and complicate the token customization surface.

**Decision:** Install shadcn/ui components selectively — only the 8 components actively needed: Button, Badge, Input, Textarea, Tabs, Skeleton, Avatar, AlertDialog. All component styling is driven by portal CSS tokens defined in `tokens.css`. Shadcn component source is not modified directly; customization goes through CSS custom properties only.

**Consequences:**
- Consistent accessible primitives across all new UI surfaces without dependency bloat.
- Adding a new shadcn component in future requires a deliberate install step — prevents accidental full-library pulls.
- Portal token system (`tokens.css`) becomes the single customization layer for both shadcn components and custom components.
- `UserAvatar` created as a thin shadcn Avatar wrapper with initials fallback, establishing the pattern for future wrapper components.

## ADR-011: Meine Aufgaben as dedicated page (not redirect)
**Date:** 2026-03-13
**Status:** Accepted

**Context:** "Meine Aufgaben" was a `<Navigate>` redirect to `/tickets?filter=needs_attention`. This felt broken — user clicks a sidebar item and lands on a different page with a filter applied. No focused experience.

**Decision:** Build a dedicated page with tasks grouped by workspace (`list_name`). Shows only `client review` tasks. Reuses existing TaskCard + TaskDetailSheet. No filters/search — the page IS the filter.

**Consequences:** Focused inbox-like experience for pending tasks. Grouped by workspace gives context. Sidebar badge + page count always aligned.

## ADR-014: Nextcloud as file storage source of truth (not ClickUp attachments)
**Date:** 2026-03-22
**Status:** Accepted

**Context:** ClickUp supports file attachments but they are locked to task context, have no folder structure, and cannot be organized by project phase. Clients need a browsable file space that mirrors how KAMANIN organizes deliverables internally.

**Decision:** Nextcloud (self-hosted) is the sole file storage. The portal accesses it exclusively via `nextcloud-files` Edge Function (WebDAV). ClickUp attachments are not shown in the portal. Four rules (F1-F4) govern file access:
- F1: `_intern/` folders are never exposed to the client browser
- F2: `team/` folders are accessible to KAMANIN team members only
- F3: `portal/` folders are the client-visible layer
- F4: Path safety enforcement — no `..` traversal, no control characters

**Consequences:** All file operations (list, upload, download, mkdir) flow through one Edge Function. WebDAV path in `project_config.nextcloud_root_path` and `profiles.nextcloud_client_root` are the integration anchors. Nextcloud folder structure can evolve independently of the portal schema.

## ADR-015: Three-level Nextcloud access model (_intern / team / portal)
**Date:** 2026-03-22
**Status:** Accepted

**Context:** KAMANIN stores files that must never reach clients (internal notes, raw assets), files for team coordination, and files ready for client review — all in the same Nextcloud folder hierarchy.

**Decision:** Enforce three folder tiers by naming convention: `_intern/` (never exposed), `team/` (internal team, not clients), `portal/` (client-visible). The `nextcloud-files` Edge Function strips `_intern/` entries from PROPFIND responses before returning them to the browser.

**Consequences:** Simple, convention-based access control that doesn't require Nextcloud user permissions to change. KAMANIN can add internal files alongside deliverables without fear of exposure. The portal client sees only what lives in `portal/` subtrees.

## ADR-016: Client folder structure (clients/{slug}/...)
**Date:** 2026-03-22
**Status:** Accepted

**Context:** As the number of clients grows, Nextcloud needs a predictable folder structure so that `profiles.nextcloud_client_root` can be set systematically and file browsing works without manual path configuration per feature.

**Decision:** All client files live under `clients/{slug}/` where `{slug}` is generated by `slugify()` (umlaut-normalizing, kebab-case, max 60 chars). Each client root contains project subfolders. The `slugify()` utility lives in `supabase/functions/_shared/slugify.ts` and is shared across Edge Functions.

**Consequences:** Predictable paths. New clients can be onboarded by creating the folder and setting `nextcloud_client_root` in the DB. Chapter folders use `{sort_order:02}_{title_slug}` format (e.g., `01_konzept`).

## ADR-017: Credit system — transaction ledger model
**Date:** 2026-03-23
**Status:** Accepted

**Context:** Clients purchase monthly support/maintenance packages measured in credits. Tasks consume credits (set via ClickUp custom field). The portal needs to show a live balance. Options: denormalized `balance` column on profiles, or append-only ledger.

**Decision:** Append-only ledger in `credit_transactions`. Balance is always computed as `SUM(amount)` across all transactions for a user. Three transaction types: `monthly_topup` (positive, from pg_cron job), `task_deduction` (negative, from webhook when credit custom field changes), `manual_adjustment` (positive/negative, for corrections). No denormalized balance column.

**Consequences:** Full audit trail. Balance can be recomputed from scratch at any time. Realtime subscription on `credit_transactions` gives instant balance updates. `credit_packages` table defines the monthly allocation — the cron job reads active packages to generate topups. CreditBalance UI component hidden for users with no configured package.

## ADR-018: Credit custom field sync via ClickUp webhook (not manual entry)
**Date:** 2026-03-23
**Status:** Accepted

**Context:** Task credit costs need to flow from ClickUp (where KAMANIN sets them) to the portal. The alternatives were: (a) manual entry in the portal, (b) polling, (c) webhook-driven sync.

**Decision:** The `clickup-webhook` Edge Function handles `taskUpdated` events that include a credit custom field change. It reads the new numeric value, diffs against `task_cache.credits`, and inserts a `task_deduction` transaction for the delta. `task_cache.credits` is updated as a top-level column (not buried in `raw_data`).

**Consequences:** Credits appear in the portal within seconds of being set in ClickUp. Guards against NULL/non-numeric values prevent spurious transactions. The webhook handler is the single writer for task credit deductions.

## ADR-019: Realtime publication — explicit table enrollment (no polling)
**Date:** 2026-03-22
**Status:** Accepted

**Context:** Early implementation had some tables missing from the Supabase Realtime publication, causing UI to appear stale until page reload. Polling was used as a workaround, adding unnecessary load and complexity.

**Decision:** All cache and notification tables must be explicitly added to the `supabase_realtime` publication with `REPLICA IDENTITY FULL`. Polling intervals are removed from all hooks. React Query `staleTime` acts as the sole fallback (30s), ensuring Realtime failure degrades gracefully without active polling loops.

**Consequences:** Instant UI updates on webhook-driven changes. Cleaner hook code. Tables requiring Realtime: `task_cache`, `comment_cache`, `notifications`, `project_task_cache`, `credit_transactions`. Any new cache table added to the schema must also be enrolled in the publication.

## ADR-020: Vercel for frontend hosting (no staging branch)
**Date:** 2026-03-25
**Status:** Accepted

**Context:** Frontend was run locally only. Production deployment needed. Options: self-hosted on Coolify alongside Supabase, or Vercel. Coolify would add operational complexity; Vercel offers zero-config React/Vite deploys with automatic preview environments per PR.

**Decision:** Deploy frontend to Vercel. `main` branch = production (portal.kamanin.at). Feature branches and PRs automatically get Vercel preview URLs — these serve as the staging environment, replacing the previously planned separate staging branch. `vercel.json` adds SPA rewrites and an `/auth/v1/*` proxy to the self-hosted Supabase auth endpoint (needed because GoTrue cookies require same-origin).

**Consequences:** Zero-config CI/CD. No staging branch to maintain. Every PR gets an isolated preview URL for QA. Auth proxy in `vercel.json` is critical — must be kept in sync if Supabase URL changes.

## ADR-021: Client onboarding script (`scripts/onboard-client.ts`)
**Date:** 2026-03-25
**Status:** Accepted

**Context:** Onboarding a new client required 6+ manual Supabase SQL steps (create user, profile row, workspace rows, credit package, project access, trigger sync). Error-prone and undocumented.

**Decision:** Create `scripts/onboard-client.ts` — a typed TypeScript script that accepts a JSON config file and executes all onboarding steps atomically. Steps: create Supabase Auth user, insert profile, insert client_workspaces rows, insert credit_packages row, insert project_access row, call fetch-clickup-tasks to prime the cache.

**Consequences:** Repeatable, auditable onboarding. Config file acts as a record of each client's setup. First run: MBM (Nadin Bonin). Run with: `npx tsx scripts/onboard-client.ts --config client.json`.

## ADR-022: Repo consolidation — PORTAL_staging → PORTAL (single repo)
**Date:** 2026-03-25
**Status:** Accepted

**Context:** The project ran as two copies: `PORTAL` (reference, untouched) and `PORTAL_staging` (working copy). This was originally meant to protect the reference but it created confusion about which copy was canonical and where to run commands.

**Decision:** Rename `PORTAL_staging` to `PORTAL`. Single repo, single working directory. The "staging" concept is now handled by Vercel preview URLs (per PR). The old CLAUDE.md note about staging copy is no longer accurate.

**Consequences:** CLAUDE.md header note about staging copy removed. All agent instructions now point to `G:/01_OPUS/Projects/PORTAL` as the sole working directory. Historical reference material remains under `archive/legacy-reference/` within the repo.

## ADR-023: Documentation restructuring — docs/ as single source of truth
**Date:** 2026-03-29
**Status:** Accepted

**Context:** Duplicate content existed between `docs/` and `.planning/codebase/` (ARCHITECTURE.md, STACK.md, CONVENTIONS.md, etc.). Stale files in `docs/` referenced PORTAL_staging as active (superseded by ADR-022). `docs/planning/` caused naming confusion with `.planning/` (GSD workflow directory).

**Decision:** Delete `.planning/codebase/` (7 files that duplicated docs/ content). Delete 5 stale docs (STATUS.md, WORKING_GUIDE.md, bootstrap-prompt.md, REPOSITORY_MAP.md — all superseded by CLAUDE.md). Delete `docs/superpowers/` (old task planning format, superseded by GSD). Rename `docs/planning/` → `docs/domain/` to clarify these are business/domain documents. Move `docs/TICKET_AUDIT_REPORT.md` → `docs/audits/ticket-audit-report.md`.

**Consequences:** Single source of truth in `docs/`. Clean separation: `docs/` = project documentation, `.planning/` = GSD workflow artifacts only. `docs/domain/` clearly signals business domain context. All `docs/planning/` references in CLAUDE.md, agent files, and README updated to `docs/domain/`.

## ADR-025: XHR over fetch() for file uploads (progress events)
**Date:** 2026-03-31
**Status:** Accepted

**Context:** File uploads used `fetch()` which does not expose upload progress events. Users uploading large files had no feedback on upload completion. Removing the 50 MB size limit made progress reporting even more important.

**Decision:** Replace `fetch()` with XHR (`XMLHttpRequest`) for all Nextcloud file upload calls. A shared utility `src/shared/lib/upload-with-progress.ts` wraps XHR and accepts an optional `onProgress` callback (0–100). Both file modules (`useClientFiles`, `useNextcloudFiles`) use this utility. Progress is visualized via the new `UploadProgressBar` component (`src/modules/files/components/UploadProgressBar.tsx`), which auto-dismisses on completion. The 50 MB `MAX_UPLOAD_SIZE` cap is removed from `upload` and `upload-client-file` Edge Function actions (retained for `upload-task-file` which is a different flow).

**Consequences:** Users see per-file progress bars during upload. Large file uploads are now viable without an arbitrary size cap. XHR is used only for the upload path — all other API calls remain `fetch()`.

## ADR-026: Files module root is read-only (admin-controlled structure)
**Date:** 2026-03-31
**Status:** Accepted

**Context:** The Files module (`src/modules/files/`) shows top-level Nextcloud folders from the client root path. These folders represent the folder structure KAMANIN sets up for each client — they are not meant to be created or deleted by clients. Previously, upload and create-folder buttons were visible at the root level, which was incorrect.

**Decision:** The Files module root level is read-only for clients: no upload button, no create-folder button, no delete action on top-level items. A hint text explains that clients navigate into subfolders to work with files. Inside any subfolder, full CRUD is available: upload, create subfolder, delete files, delete subfolders. The same hierarchy applies in the Projects module: root-level chapter folders cannot be deleted; files and subfolders inside chapters can be deleted. Deletion is always guarded by a `ConfirmDialog`.

**Consequences:** Clients cannot accidentally delete or modify the folder structure KAMANIN provisions for them. Admin-set structure is preserved. `ClientFolderView` and project `FolderView` both encode these rules in their component logic.

## ADR-024: Icon library migration — Hugeicons primary, Phosphor secondary
**Date:** 2026-03-29
**Status:** Accepted

**Context:** CLAUDE.md listed "Lucide React" as the icon library but `@hugeicons/react` was already installed and used as the primary icon set (credit history implementation, 984a424). The documentation did not reflect the actual stack. Lucide React is not installed.

**Decision:** Hugeicons (`@hugeicons/react` + `@hugeicons/core-free-icons`) is the primary icon library — stroke rounded style, 5100+ icons. Phosphor Icons (`@phosphor-icons/react`) is secondary for weight variants and duotone styles. Lucide React is explicitly legacy-only: do not use for new code, do not refactor existing components that still reference it (it may still appear in older archive code).

**Consequences:** CLAUDE.md Stack section updated. All agent definitions updated. Designer agent's icon strategy section already reflected this (added during 984a424). New components use Hugeicons by default.

## ADR-028: Cloud Supabase free tier for staging (not local or self-hosted)
**Date:** 2026-04-06
**Status:** Accepted

**Context:** A proper staging environment is needed to test Edge Function deploys, schema changes, and UI integrations before they reach production. Three options were considered:
1. Local Supabase (`supabase start`) — no public URL, cannot test Vercel-hosted frontend against it, cannot test webhooks from ClickUp
2. Second Coolify service (self-hosted) — adds ops overhead, uses server resources, requires full SSH-based deploy pipeline
3. Cloud Supabase free tier — zero ops overhead, public URL, Supabase CLI deploys natively, Management API available for secret/schema sync

**Decision:** Use a dedicated Cloud Supabase free-tier project (`ahlthosftngdcryltapu`, region: eu-central-1) as the staging backend. Frontend staging is served by Vercel's branch deployment on `staging` → `staging.portal.kamanin.at`. Edge Functions are deployed via GitHub Actions on every push to `staging`. Production remains on self-hosted Supabase via Coolify.

**Consequences:**
- Full end-to-end staging environment with a public URL — Vercel frontend, Cloud Supabase backend, real Edge Functions
- `vercel.json` on the staging branch has the `/auth/v1/*` proxy removed (Cloud Supabase handles CORS natively; proxy was only needed for self-hosted)
- Two new scripts: `sync-staging-secrets.ts` (15 secrets from prod Coolify → staging) and `sync-staging-schema.ts` (pg_dump → Management API)
- GitHub Actions workflow `deploy-edge-functions-staging.yml` deploys all functions on staging push
- Free-tier limits apply to staging only — no persistent storage guarantees; data is ephemeral/test-only
- Schema migrations must be run against both prod (via Coolify volume) and staging (via `sync-staging-schema.ts --apply-only` or `supabase db push`)
- `v1.0-stable` git tag on `main` provides a clean rollback anchor before staging merges

## ADR-027: Magic Link authentication enabled on self-hosted Supabase
**Date:** 2026-03-31
**Status:** Accepted

**Context:** Magic link authentication was initially deferred because GoTrue SMTP requires an external mail provider to be configured on the self-hosted Supabase instance. Earlier documentation and changelog entries noted it as "disabled until GoTrue SMTP is configured." The `auth-email` Edge Function was subsequently implemented to intercept all GoTrue auth emails (magic link, password reset, signup, invite, email change) and deliver branded versions via Mailjet. GoTrue SMTP was configured to point at this Edge Function.

**Decision:** Magic Link is enabled and working. The `auth-email` Edge Function is the delivery mechanism — GoTrue triggers it via the send email hook, the function maps the Supabase email type to the portal `emailCopy.ts` template, and sends via Mailjet. Login page exposes the magic link option to users.

**Consequences:** Users can authenticate without a password using a time-limited link sent to their email. All documentation references to magic link being disabled or pending SMTP configuration are outdated and have been corrected (ARCHITECTURE.md, TECH_CONTEXT.md). The `auth-email` Edge Function must remain deployed and Mailjet credentials must remain valid for magic link to function.

## ADR-029: Organizations milestone — multi-user client support (Phases 9-14)
**Date:** 2026-04-14 to 2026-04-16
**Status:** Accepted — fully implemented in production

**Context:** The portal was profile-centric: every credit package, workspace, and ClickUp list was attached to a single `profile_id`. Clients with multiple employees each needed a separate package, which was commercially and operationally incorrect. The core problem: a company is one billing entity, but could have multiple portal users.

**Decision:** Introduce an `organizations` + `org_members` two-table model. Each company has one `organizations` row. Each portal user has one `org_members` row linking them to their company with a role (`admin`, `member`, `viewer`). Org-level resources (credits, workspaces, ClickUp lists, Nextcloud root, support task) move from `profiles` to `organizations`. The migration is additive first (Phase 9), then cleanup removes the old columns (Phase 13).

**Key sub-decisions:**
- One user = one org (no multi-org membership; simplifies RLS and UI)
- Roles: `admin` (full control, billing, invite), `member` (create tasks, approve credits), `viewer` (read-only + comment)
- `task_cache`, `comment_cache`, `notifications`, `read_receipts` remain per-user — these are personal interaction records
- `credit_transactions.profile_id` retained even after org migration — needed for audit trail
- Legacy fallback in `useOrg()`: if no `org_members` row found, treat as `member` (backward compat for any edge-case user)
- Admin-only `/organisation` page for team management; non-admins redirected to `/tickets`
- Viewer guards enforced at both frontend (`useOrg().isViewer`) and backend (`getNonViewerProfileIds` helper in Edge Functions)
- Bell notifications remain unfiltered — all roles see badge; only action-required emails (task_review, step_ready) are filtered for viewers

**Phases implemented:**
- Phase 9 (org-db-foundation): schema, migration, dual-mode RLS, SQL helpers
- Phase 10 (org-backend): Edge Functions updated to read from organizations
- Phase 11 (org-frontend-auth): OrgProvider context, client-side RLS for reads, role guards in tickets module
- Phase 12 (org-admin-page): admin write RLS, `/organisation` page with TeamSection, InviteMemberDialog, MemberRowActions
- Phase 13 (org-onboarding-cleanup): legacy profile_id policies and columns dropped
- Phase 14 (role-based-guards): viewer guard on StepActionBar (projects module), Empfehlungen tab admin-only, sidebar badge exclusion for non-admins

**Consequences:**
- `credit_packages` and `client_workspaces` are now org-scoped — `profile_id` columns dropped
- `profiles` no longer stores `clickup_list_ids`, `nextcloud_client_root`, `support_task_id`, `clickup_chat_channel_id` — all moved to `organizations`
- All Edge Functions that previously read from `profiles` for ClickUp/Nextcloud config now join through `org_members → organizations`
- `onboard-client.ts` script must be updated to create org + admin member, not just a profile
- `notifications_type_check` constraint extended: `member_invited`, `member_removed` types added

## ADR-031: Peer comments resolve org via caller, not task cache
**Date:** 2026-04-17
**Status:** Accepted

**Context:** When a portal user posts a comment, other org members need to be notified (bell + email). The naive approach would look up the org via `task_cache.profile_id` — but this fails when the task has never been synced for a given org member, and it doesn't provide any cross-org authz guarantee.

**Decision:** Resolve `orgId` from the caller's own `org_members` row first (always available if the user is in an org). Then validate that the target task belongs to that org:
- Tickets: check `organizations.clickup_list_ids` contains the task's ClickUp list ID
- Project tasks: check `project_configs.organization_id = caller's orgId`

Fan-out is skipped entirely when `taskBelongsToOrg === false`. This logic lives in `getOrgContextForUserAndTask` in `supabase/functions/_shared/org.ts`.

**Consequences:**
- Robust against cache misses — org resolution never depends on task_cache being populated
- Prevents cross-org notification leaks even if a task ID is guessed by an attacker
- Trivial additional DB reads per comment (one `org_members` query + one ownership check)
- Viewers are excluded from both bell and email fan-out (stricter than the `clickup-webhook` path which excludes viewers from email only)

---

## ADR-030: Viewer role — defense-in-depth enforcement
**Date:** 2026-04-15
**Status:** Accepted

**Context:** The `viewer` role must not be able to perform write actions (create tasks, approve credits, release project steps). Frontend guards alone are insufficient — a determined user could call Edge Functions directly.

**Decision:** Enforce viewer restrictions at two layers:
1. **Frontend:** `useOrg().isViewer` flag gates action buttons (NewTaskButton, CreditApproval, TaskActions, StepActionBar). Components return null or hide buttons when `isViewer === true`.
2. **Backend:** `getNonViewerProfileIds(supabase, profileIds)` helper in `_shared/org.ts` filters out viewer-role profiles before sending action-required emails. Applied in `clickup-webhook` for `task_review` and `step_ready` email blocks.

**Bell notifications are intentionally NOT filtered** — viewers should see activity in their organization even if they cannot act on it.

**Consequences:** Two-layer guard prevents both accidental UI exposure and direct API exploitation. The permissive fallback in `getNonViewerProfileIds` (returns full list on DB error) ensures email delivery is not silently dropped due to a transient DB error.

## ADR-031: Credit re-approval — single-row UPSERT, not audit-trail rows
**Date:** 2026-04-17
**Status:** Accepted

**Context:** When a task is re-priced in ClickUp and sent back to AWAITING APPROVAL after the client had already approved it, the credit commitment must be updated. Three options were considered:
1. Insert a new `task_deduction` row for the new amount (leaving the old row in place) — audit trail preserved but balance double-counts both amounts
2. Insert a compensating positive row + new deduction row (delta approach) — correct balance but clutters ledger
3. UPSERT the existing `task_deduction` row in place (overwrite amount) — simple, single row per task

**Decision:** Option 3 — overwrite the existing `task_deduction` row atomically via RPC. The audit trail need is already satisfied by (a) ClickUp comments on every approval action ("Kostenfreigabe erteilt (N Credits)" / "Kostenfreigabe aktualisiert (X → Y Credits)"), (b) the email history in Mailjet, and (c) the portal bell notification log. A delta-row ledger approach would require UI-level summing across multiple rows per task, adding complexity for no user-visible benefit. The single-row model keeps balance computation (`SUM(amount)`) correct with no special cases.

**Consequences:** One `task_deduction` row per task. Re-approval overwrites `amount` and `description` in place. ClickUp comment + email + bell serve as the human-readable audit trail. `credit_transactions.created_at` reflects the first approval date — this is a known tradeoff of the UPSERT approach.

## ADR-032: RPC for partial-index UPSERT (`upsert_task_deduction`)
**Date:** 2026-04-17
**Status:** Accepted

**Context:** `credit_transactions` has a partial unique index `credit_transactions_task_deduction_unique ON (task_id, type) WHERE (type = 'task_deduction')`. To atomically upsert using this index as the conflict target, the SQL must be `INSERT ... ON CONFLICT (task_id, type) WHERE (type = 'task_deduction') DO UPDATE`. The Supabase JS SDK `.upsert()` method sends its conflict target as a column list only — it cannot append the `WHERE` predicate needed for partial index targeting. Using `.upsert({ onConflict: 'task_id,type' })` would either hit the wrong constraint or fail with a Postgres error if no total index on `(task_id, type)` exists.

**Decision:** Wrap the UPSERT in a `SECURITY DEFINER` PostgreSQL function `upsert_task_deduction(p_profile_id, p_organization_id, p_amount, p_task_id, p_task_name, p_description)` called via `supabase.rpc('upsert_task_deduction', {...})` with the service-role client. The function is restricted to `service_role` only (`REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO service_role`). `SET search_path = public` prevents search-path hijacking.

**Consequences:** Partial-index conflict resolution works correctly. The RPC is the only path to create or update a `task_deduction` row. Direct INSERT from client-side code is impossible (RLS does not allow inserts; the RPC is server-only). Future callers must use this RPC for any task credit deduction.

## ADR-033: `task_cache.approved_credits` as UI data source for re-approval state
**Date:** 2026-04-17
**Status:** Accepted

**Context:** The UI must show "Aktualisierte Kostenfreigabe" when a previously-approved task returns to AWAITING APPROVAL with a different credit amount. Two approaches were considered:
1. Read from `credit_transactions` directly — query the existing `task_deduction` row, compare its `amount` with `task_cache.credits`
2. Add `task_cache.approved_credits numeric` column — mirror the last approved amount into the cache table at approval time

**Decision:** Option 2 — add `approved_credits` to `task_cache`. CLAUDE.md Rule #1 states: UI reads ONLY from cache tables, never from ClickUp or other source tables directly. Querying `credit_transactions` from the browser would violate this rule (it is not a cache table; it is a ledger with direct RLS). The cache column approach also gives Realtime subscriptions a single table to watch for re-approval state changes.

**Consequences:** `task_cache.approved_credits` is written by the `update-task-status` Edge Function immediately after each successful `approve_credits` action. It is also written by the backfill in migration `20260417100000_credit_reapproval.sql` for historical rows. NULL means never approved. A non-NULL value that differs from `task_cache.credits` signals re-approval state in the UI.

## ADR-034: Force-fetch credits from ClickUp on re-approval to avoid webhook race
**Date:** 2026-04-17
**Status:** Accepted

**Context:** When KAMANIN updates the Credits custom field in ClickUp and then moves the task to AWAITING APPROVAL, ClickUp fires two webhook events near-simultaneously: a `taskUpdated` custom-field-change event and a `taskUpdated` status-change event. The portal's `clickup-webhook` processes these independently. If the status-change event is processed first, `task_cache.credits` may still hold the previous value — the cache has not yet been updated by the custom-field event. The AWAITING APPROVAL handler would then read the stale amount, produce a notification with the wrong credit count, and send an email showing the old number.

**Decision:** On the AWAITING APPROVAL handler, when `task_cache.approved_credits` is already set (indicating re-approval), always force-fetch the current credits directly from the ClickUp API (`GET /v2/task/{id}`, reading the credits custom field) instead of trusting the cache. This path also existed for the first-approval case where the cache was empty or zero (existing BLOCKING 4 fix), so the two cases now share the same fetch path. The fresh value is written back to `task_cache.credits` before composing the notification, keeping the cache consistent.

**Consequences:** One additional ClickUp API call per AWAITING APPROVAL webhook event when a re-approval is detected. This is a deliberate tradeoff — correctness over one extra API call. The force-fetch path is gated on `isLikelyReApproval || !credits || credits <= 0`, so first-approval tasks with credits in cache take the fast path.

## ADR-035: Local WordPress Dev via DDEV on WSL-Native FS
**Date:** 2026-04-23
**Status:** Accepted

**Context:** Phase 15 milestone (MCP Apps Platform) needs a reproducible WordPress + WooCommerce dev environment on Windows for Summerfield clone work. Existing PORTAL codebase has zero WP/PHP infra — first DDEV, first PHP, first WP plugin. Options evaluated: Local by Flywheel (opaque stack, no Apache-FPM), XAMPP (stack-mismatch vs prod), Lando (abandoned), DDEV (official WP/WC community standard).

**Decision:**
- **Environment:** DDEV inside WSL2 Ubuntu, orchestrating Docker Desktop. Official supported stack per ddev.readthedocs.io.
- **Path:** `/home/upan/projects/sf_staging/` — WSL-native ext4. Rejected `/mnt/g/` (Windows 9P bridge 2-4× slower for PHP workloads; composer install visibly slower than ext4 baseline).
- **Stack:** Apache-FPM + PHP 8.4 + MySQL 8.0. Matches Summerfield production hosting exactly. Eliminates `.htaccess` semantic drift between local and prod.
- **Uploads strategy:** NOT copied locally. `.htaccess` 302-redirects `/wp-content/uploads/*` to production for images/media (saves ~10 GB local disk, accepts read-only image access on dev).
- **Plugin source location:** `PORTAL/wordpress-plugins/` (git-tracked), symlinked into `/home/upan/projects/sf_staging/wp-content/plugins/` via WSL `ln -sfn`. Keeps shippable code in the PORTAL repo; keeps ephemeral WP install out.
- **MCP Adapter install:** composer-managed in `wp-content/mu-plugins/` (Option A per LOCAL_DEV_SETUP.md §6 Step 6). Version pinned exactly to `wordpress/mcp-adapter:0.5.0` — pre-1.0, deliberate upgrades only.

**Consequences:**
- Developers onboarding follow `docs/ideas/LOCAL_DEV_SETUP.md` §6; no `.ddev/` directory inside this repo (ephemeral per-developer state).
- `PORTAL/.gitignore` extended with `scripts/*.php` whitelist + `wordpress-plugins/*/composer.lock` ignore + `.ddev/*` block with `config.yaml` allow-list.
- Plugin scaffold `wordpress-plugins/kmn-revenue-abilities/` is empty shell in Phase 15; abilities land in Phase 16.
- Summerfield prod deployment is NOT on the Vercel/Supabase CI path — manual rsync, documented in `docs/ideas/WP_BRIDGE_ARCHITECTURE.md` §11.
- Production deploy flow does NOT use symlinks (no WSL on production host) — symlink-in-DDEV is dev-only.

## ADR-036: WordPress Application Password Rotation for kmn-revenue MCP Bridge
**Date:** 2026-04-23
**Status:** Accepted

**Context:** Phase 16 WP plugin `kmn-revenue-abilities` will expose MCP abilities at `/wp-json/mcp/kmn-revenue`, authenticated via WordPress Application Password. Credential must be rotatable without service interruption and must be kept separate from the `wp-audit.ts` credential (Maxi AI Core endpoint) — no cross-contamination between MCP bridges. The Application Password for DDEV is issued in Phase 15; the runbook is recorded now while the credential exists.

**Rotation Runbook:**
1. WP Admin → Users → target user (`admin` on Summerfield DDEV; dedicated `kmn-analytics-bot` on Summerfield production) → Application Passwords.
2. Generate new app password with label `mcp-dev-YYYY-MM-DD`; copy immediately (shown once).
3. Update `WOOCOMMERCE_WP_APP_PASS` in:
   - Local `mcp-poc/.env.local`
   - Production mcp-poc Vercel env vars (triggers auto-redeploy)
4. Run `scripts/verify-wp-bridge.sh` against the target endpoint (Phase 16 artifact; for Phase 15, run `curl -u admin:<pass> https://summerfield.ddev.site/wp-json/wp/v2/users/me` and confirm HTTP 200 with admin user JSON).
5. Revoke old app password in WP Admin.
6. Record rotation date + reason (scheduled / incident / compromise) in this ADR's "Rotation log" subsection below.

**Rotation log:**
- 2026-04-23 — initial credential issued on Summerfield DDEV (admin user, label `mcp-dev`, Phase 15 Plan 1 Task 5)

**Consequences:**
- Credentials are NEVER stored in git. Only env files (`mcp-poc/.env.local`, Vercel dashboard, Yuri's password vault).
- `WOOCOMMERCE_WP_USER` / `WOOCOMMERCE_WP_APP_PASS` are named distinctly from `WP_MCP_USER` / `WP_MCP_APP_PASS` (existing `wp-audit.ts` credential) — no credential coupling (MCPS-07 no-coupling assertion).
- `NODE_TLS_REJECT_UNAUTHORIZED=0` is explicitly FORBIDDEN in any checked-in script. Node must use `NODE_EXTRA_CA_CERTS` pointing at the mkcert root CA only (scoped trust) when talking to DDEV over mkcert TLS.
