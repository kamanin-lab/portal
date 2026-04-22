# Team Dashboard

_Status: active_ · _Last updated: 2026-04-22_

## Current State
**Portal is LIVE at https://portal.kamanin.at** (production, `main` branch)
**Staging is LIVE at https://staging.portal.kamanin.at** (`staging` branch, Cloud Supabase)
First production client: MBM (Nadin Bonin). Auto-deploys from `main` via Vercel.
Git rollback anchor: `v1.0-stable` tag on `main`.

## Open Items
- MBM modules: tickets + support active; projects not yet configured
- `onboard-client.ts` script needs update to create org + admin member instead of standalone profile

## Completed Today (2026-03-25)
| Item | Notes |
|---|---|
| Vercel deployment | `main` → portal.kamanin.at, preview URLs on PRs |
| Repo consolidation | PORTAL_staging → PORTAL (single canonical repo) |
| Onboarding script | `scripts/onboard-client.ts` |
| MBM onboarded | First production client |
| Filter row fix | Chips + button on single row |
| Sidebar flat links | Tickets + support no longer have submenus |
| TaskCard creator | Shows `created_by_name` from DB |
| Message bubble polish | Padding, tail, gap applied to all 3 chat surfaces |
| Credit balance label | Strips hour suffix from package name |
| scrollbar-hide utility | Added to index.css for Tailwind v4 |
| Login KAMANIN icon | Official SVG replaces placeholder |
| Favicon | KAMANIN colour icon |
| Page title | "KAMANIN Portal" |
| Magic link hidden | Until GoTrue SMTP configured |

## Completed Tasks

### REMEMBER-ME: Angemeldet bleiben — Two-tier session persistence ✅ (2026-04-22)
- "Angemeldet bleiben" checkbox on login page (default checked); hint "Auf fremden Geräten deaktivieren"
- Persistent mode (checked): localStorage, 30-day idle timeout
- Ephemeral mode (unchecked): sessionStorage, 3-hour idle, clears on tab close
- Hybrid storage adapter in `supabase.ts` reads `portal-remember-me` flag; fail-safe default = persistent
- `getEffectiveTimeout()` in `session-timeout.ts` re-evaluates live on every 60s tick
- Commit: `29350ba`, branch: `staging`

### TASK-018: Peer-to-peer org notifications ✅ (2026-04-17)
- Fan-out in `post-task-comment`: all org members (excl. author + viewers) receive bell + email when a peer posts a comment in a ticket or project chat
- New `getOrgContextForUserAndTask` helper in `_shared/org.ts` — resolves org from caller, validates task belongs to that org (cross-org guard)
- New `peer_messages` boolean preference key in `NotificationPreferences` (default true); "Organisation" toggle in `/konto` notification settings
- New e2e test infra: `tests/_shared/staging-client.ts`, `tests/e2e/peer-notifications.ts`, staging-only safety guard + self-cleanup
- Fixes: skip fan-out for cross-org tasks, skip email when recipient has no email address
- 5 commits: 18116fe → c3d8412

### Credit Re-approval Flow ✅ (2026-04-17)
- `task_cache.approved_credits` column + backfill migration
- `upsert_task_deduction` RPC (SECURITY DEFINER, partial-index UPSERT)
- `CreditApproval` UI: three render states (first approval / re-approval / decline)
- Email + bell notification re-approval wording ("Aktualisierte Kostenfreigabe")
- Webhook race fix: force-fetch credits from ClickUp on re-approval
- Removed webhook auto-delta anti-pattern
- 5 commits: f1a9c8d → 5e97b83

### Organizations Milestone (Phases 9-14) ✅ (2026-04-14 → 2026-04-16)
- Phase 9: `organizations` + `org_members` tables, data migration (each profile → one org + admin member), dual-mode RLS, `user_org_ids()` + `user_org_role()` SQL helpers
- Phase 10: All Edge Functions updated to read ClickUp lists, Nextcloud root, support task from `organizations` instead of `profiles`
- Phase 11: `OrgProvider` React context, RLS for client-side org reads, role guards (viewer) in tickets module
- Phase 12: Admin write RLS on `org_members`, `/organisation` page (TeamSection, InviteMemberDialog, MemberRowActions, OrgInfoSection, RolesInfoSection)
- Phase 13: Legacy `profile_id` columns dropped from `credit_packages` and `client_workspaces`; org-config columns (`clickup_list_ids`, `nextcloud_client_root`, `support_task_id`, `clickup_chat_channel_id`) dropped from `profiles`
- Phase 14: Viewer guard on `StepActionBar` (projects module); Empfehlungen tab admin-only; sidebar badge excludes `new_recommendation` for non-admins; `getNonViewerProfileIds` backend helper filters viewer-role from action emails

### Staging Environment ✅ (2026-04-06)
- `staging` branch created from `main`
- Cloud Supabase free-tier project `ahlthosftngdcryltapu` provisioned (17 tables, RLS, 15 secrets, 17 Edge Functions)
- Vercel staging environment: `staging.portal.kamanin.at` with branch-specific env vars
- GitHub Actions: `deploy-edge-functions-staging.yml` auto-deploys Edge Functions on staging push
- Scripts: `sync-staging-secrets.ts`, `sync-staging-schema.ts`
- Git tag `v1.0-stable` anchored on `main`

### TASK-017: Hilfe FAQ Page ✅ (2026-03-31)
- Full FAQ page replacing placeholder: 6 accordion sections, 20 items, German Sie-form
- New components: `FaqItem` (AnimatePresence accordion), `FaqSection` (icon card)
- Data file: `src/shared/lib/hilfe-faq-data.ts`
- whileInView stagger animation; IntersectionObserver mock added for tests
- GitHub Actions workflows removed (Claude Code App not installed → CI failures)

### TASK-016 and prior: See git log and CHANGELOG.md.

Legend: ⬜ pending | 🔄 in progress | ✅ done | ❌ blocked | ⏭️ skipped
