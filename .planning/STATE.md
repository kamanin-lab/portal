---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: "1. Dashboard at 09:00, 11:00, 14:00, 17:00 never shows universally negative pace — the today-vs-yesterday −85% bug is not reproducible"
status: executing
last_updated: "2026-04-24T17:00:17.556Z"
last_activity: 2026-04-24
progress:
  total_phases: 20
  completed_phases: 16
  total_plans: 55
  completed_plans: 51
  percent: 93
---

# Project State

**Project:** KAMANIN Client Portal
**Last activity:** 2026-04-24

## Current Position

Phase: 18 (mcp-ui-resource-build-pipeline) — EXECUTING
Plan: 1 of 5
Status: Executing Phase 18
Last activity: 2026-04-24 -- Phase 18 execution started

## Key Facts Discovered in Phase 15 (critical for downstream phases)

- **WP table prefix:** `s7uy9uh34_` (Summerfield hardened prefix, NOT `wp_`). Phase 16+ abilities must resolve via `$wpdb->prefix` dynamically.
- **Domain:** garden furniture (Gartenmöbel), not bedroom furniture. Price range €62-18,899, avg €2973.
- **Catalog:** 228 published products, 13 categories (Befestigung, Schutzhülle, Gartenmöbel, Mittelstockschirm, Kissenmanufaktur, Lounge, Ampelschirm, etc.)
- **Seeded data:** 1099 paid orders, 310 multi-item (triggers `market_basket_product` mode in Phase 16), 20.1% repeat rate, Do peak at 190 orders, 20:00 hour peak at 88 orders.
- **MCP service account:** `dev-admin` (WP user ID=1). App password recorded in Yuri's vault.
- **MCP Adapter v0.5.0** installed via composer at `wp-content/mu-plugins/vendor/wordpress/mcp-adapter/` with bootstrap loader `load-mcp-adapter.php`.
- **DDEV mount added** at `.ddev/docker-compose.portal-mount.yaml` — exposes `/mnt/g/01_OPUS/Projects/PORTAL` to web container so symlinked plugin files resolve.
- **WC REST keys** generated via SQL+`wc_rand_hash()` (WP-CLI subcommand unavailable).
- **Seeder runtime:** 8-14 min on Windows DDEV (exceeds 5-min target; accepted trade-off).

## Previous Milestone

Phase 1: Portal Frontend — Complete

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260329-fhb | Projects module audit — 22 findings, 4 critical broken pipelines, German fix | 2026-03-29 | `17050f4` | Done | [260329-fhb-audit-projects-module-review-functionali](./quick/260329-fhb-audit-projects-module-review-functionali/) |
| 260329-gkb | Documentation audit — 54 drift findings, 12 files fixed, CORS security hardened | 2026-03-29 | `bc3fc60` | Verified | [260329-gkb-documentation-audit-verify-all-docs-and-](./quick/260329-gkb-documentation-audit-verify-all-docs-and-/) |
| 260329-hjo | Full docs restructuring — deleted stale files, renamed docs/planning/ to docs/domain/, all docs updated | 2026-03-29 | `36c7de6` | Done | [260329-hjo-full-docs-audit-and-structure-optimizati](./quick/260329-hjo-full-docs-audit-and-structure-optimizati/) |
| 260330-gzi | Fix missing author_email in comment_cache for nadin.bonin@mbm-moebel.de — 21 rows fixed, no UUID mismatch | 2026-03-30 | pending | Needs Review | [260330-gzi-investigate-and-fix-missing-profile-id-i](./quick/260330-gzi-investigate-and-fix-missing-profile-id-i/) |
| 260330-lvq | Recommendations block on Needs Attention tab — accept/decline workflow, Edge Function tag management, 4 new components | 2026-03-30 | `c52352c` | Done | [260330-lvq-recommendations-block-on-needs-attention](./quick/260330-lvq-recommendations-block-on-needs-attention/) |
| 260330-mp6 | Recommendations polish — standard card layout, accept/decline in TaskDetailSheet, new_recommendation notification wired end-to-end | 2026-03-30 | `7bc70fc` | Done | [260330-mp6-recommendations-polish-standard-card-she](./quick/260330-mp6-recommendations-polish-standard-card-she/) |
| 260330-nsg | Fix recommendation approval UX — sheet close on success, German date label, auto-comment, taskTagUpdated webhook | 2026-03-30 | `fd0626b` | Done | [260330-nsg-fix-recommendation-approval-ux-and-webho](./quick/260330-nsg-fix-recommendation-approval-ux-and-webho/) |
| 260330-rq4 | Audit & fix recommendations decline — auto-comment to ClickUp, block clears after decline, tag cache cleanup | 2026-03-30 | `10267dd` | Verified | [260330-rq4-audit-and-fix-recommendations-mechanism-](./quick/260330-rq4-audit-and-fix-recommendations-mechanism-/) |
| 260330-sl4 | Fix new_recommendation inbox notifications — DB constraint, TS type, TypeBadge amber badge | 2026-03-30 | `635bdc4` | Verified | [260330-sl4-fix-new-recommendation-inbox-notificatio](./quick/260330-sl4-fix-new-recommendation-inbox-notificatio/) |
| 260403-euc | Fix projects module realtime and task open button | 2026-04-03 | `9527675` | Verified | [260403-euc-fix-projects-module-realtime-and-task-op](./quick/260403-euc-fix-projects-module-realtime-and-task-op/) |
| 260403-fnr | Fix optimistic update flicker in project steps — cancelQueries before setQueryData, comments invalidation | 2026-04-03 | `4e2ca26` | Done | [260403-fnr-fix-optimistic-update-flicker-in-project](./quick/260403-fnr-fix-optimistic-update-flicker-in-project/) |
| 260414-u8j | Fix sidebar badge not updating — invalidate needs-attention-count on realtime + 30s poll | 2026-04-14 | `212caa5` | Done | [20260414-sidebar-badge-fix](./quick/20260414-sidebar-badge-fix/) |
| 260414-uwc | Nachrichten: tasks stay visible until client replies to team comment (needsReply logic) | 2026-04-14 | `69b03f5` | Done | [20260414-nachrichten-needs-reply](./quick/20260414-nachrichten-needs-reply/) |

### Key Decisions

- Stale lovable.app CORS origins removed from cors.ts and replaced with Vercel preview URL pattern
- PORTAL_staging no longer referenced as active surface — single-repo model fully documented
- Icon library: @hugeicons/react (primary) + @phosphor-icons/react (secondary). Lucide React not installed/used.
- ADR-023: docs/ = source of truth, .planning/ = GSD only. .planning/codebase/ deleted (7 files).
- ADR-024: Hugeicons primary + Phosphor secondary. Lucide legacy-only.
- docs/planning/ renamed to docs/domain/ — business/domain documents, not GSD planning.
- TasksPage and pipeline (ProjectTask, TaskStatus, getTasksForStep, taskStatusLabel) removed — never routed (CRIT-01)
- ExpandableSection returns null when body empty — prevents blank UI sections in StepOverviewTab (CRIT-04)
- MessagesPage receives ProjectComment[] + isLoading props — hook called at NachrichtenPage level where project is available (CRIT-02)
- eta field removed from TeamWorkingOn entirely — always-empty field replaced with conditional lastUpdate display (CRIT-03)
- OpenRouter GPT-4o-mini replaces Anthropic Claude Haiku for AI enrichment generation (Phase 03-01)
- Hash-based change detection (SHA-256 of name::description, 32 hex chars) drives re-enrichment decisions (Phase 03-01)
- parseMilestoneOrder duplicated in Edge Function — Edge Functions cannot import from src/ (Phase 03-01)
- test.todo used over test.skip for Wave 0 stubs — clearer RED signal in vitest output (Phase 04-00)
- filterMotionProps helper strips motion-specific props in test mocks to prevent jsdom DOM warnings (Phase 04-00)
- Connector fill color uses LEFT chapter phase color — represents phase completion leading into next phase (Phase 04-01)
- Pulse animation uses separate wrapping motion.div to avoid conflicting with layout animation on dot itself (Phase 04-01)
- PhaseNode dot kept inline (not extracted to sub-component) to access color+status within 150-line limit (Phase 04-01)
- createNextcloudFolder failure is intentionally non-fatal — webhook must always return 200 to ClickUp (Phase 05-03)
- RecommendationCard uses task.tags (top-level on ClickUpTask) not raw_data.tags for recommendation detection (quick-260330-mp6)
- accept/decline recommendation actions moved to TaskDetailSheet via RecommendationApproval — consistent with CreditApproval UX pattern (quick-260330-mp6)
- RecommendationApproval onClose wired via useTaskActions onSuccess — sheet closes after accept/decline (quick-260330-nsg)
- taskTagUpdated add/remove detection via live ClickUp API tag presence check — not payload inference (quick-260330-nsg)
- fetchTaskForVisibilityCheck extended with optional tags field — backward compatible (quick-260330-nsg)
- Recursive MKCOL stops on first failure to avoid orphaned subdirectory creation (Phase 05-03)
- FilesTab shows 8 most recent Nextcloud files (type=file only), sorted by lastModified desc — no navigation to DateienPage (Phase 05-01)
- StepFilesTab constructs path as chapterFolder/slugify(step.title) — frontend slugify mirrors Edge Function exactly (Phase 05-01)
- slugify.ts duplicated in frontend src/ — Edge Functions cannot share src/ imports (Phase 05-01)
- AnimatePresence requires conditional rendering (not TabsContent) — Radix CSS hides inactive tabs blocking exit animations (Phase 05-02)
- Controlled Tabs (useState activeTab) needed for AnimatePresence keyed transitions in OverviewTabs (Phase 05-02)
- DATA-01 (ProjectContextSection) and DATA-05 (AdminPanel refactor) deferred to admin dashboard scope (Phase 05-02)
- organizations.clickup_list_ids is jsonb; profiles.clickup_list_ids is text[] on staging — use to_jsonb() cast in data migration (Phase 09-01)
- Supabase Management API (api.supabase.com/v1/projects/{ref}/database/query) used for direct migration apply when CLI tracking table is empty (Phase 09-01)
- Building05Icon confirmed present in @hugeicons/core-free-icons — no fallback needed for organisation sidebar link (Phase 12-02)
- PASSWORD_RECOVERY onAuthStateChange redirect fixed to /passwort-setzen; resetPassword() voluntary flow at line 179 retains /konto redirectTo (Phase 12-02)
- Dialog.Title from Radix renders with role=heading — getByRole('heading') needed in TeamSection test to avoid ambiguity with button text (Phase 12-03)
- useCredits() returns { balance, packageName, creditsPerMonth, isLoading, pkg } — mock aligned to full shape (Phase 12-03)
- TeamSection manages inviteOpen state internally — InviteMemberDialog is a child, not a sibling in OrganisationPage (Phase 12-03)
- MoreHorizontalIcon from @hugeicons/core-free-icons used for ··· trigger in MemberRowActions (Phase 12-04)
- Radix DropdownMenu in jsdom requires pointerDown+click sequence to open — openDropdown() helper added in MemberRowActions test (Phase 12-04)
- MemberRowActions returns null for self-row and admin rows — UI-level guard; hook enforces server-level last-admin guards (Phase 12-04)

## Accumulated Context

### Roadmap Evolution

- Phase 14 added: role-based-guards — Hide Freigeben/approval actions for viewer role in projects module; filter task_review, step_ready, and reminder emails to admin/member only (exclude viewer from action-required notifications)

### Blockers/Concerns

None
