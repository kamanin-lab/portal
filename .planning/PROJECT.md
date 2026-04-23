# KAMANIN Client Portal

## What This Is

Modular B2B client portal for KAMANIN IT Solutions (web agency, Salzburg, Austria). German-language interface where clients track projects, review deliverables, approve work, manage support tickets, and browse files — without ever seeing ClickUp. Live at portal.kamanin.at, serving MBM and Summerfield as first production clients.

## Core Value

Clients always know what needs their attention and can act on it in one click — approve, request changes, or communicate — without any project management complexity.

## Current Milestone: v3.0 MCP Apps Platform

**Goal:** Build reusable infrastructure for embedding MCP Apps (server-rendered UI Resources) in the portal, with Revenue Intelligence v2 as the first production-grade application on this platform.

**Target features:**

**Platform layer (reusable for future MCP apps):**
- Manual Vite build pipeline for single-file React widgets (Tailwind v4 + Motion, no framework)
- postMessage token bridge — portal design tokens → sandboxed iframe via `sandbox-proxy.html` relay
- WordPress Abilities API companion plugin pattern — reusable template for future client-data bridges
- MCP Adapter auth model — WordPress Application Passwords with documented rotation runbook

**Revenue Intelligence v2 (first app on the platform):**
- WordPress companion plugin `kmn-revenue-abilities` with 5 abilities: revenue-run-rate, weekly-heatmap, repeat-metrics, market-basket, weekly-briefing-data
- MCP server tool expansion in `kamanda-mcp` (5 new tools; `incomplete_orders` removed from whitelist)
- 4-block dashboard widget replacing today-vs-yesterday methodology bug (run-rate projection, 7×24 heatmap, repeat metrics with benchmark, market basket / AOV bands)
- Monday 08:00 Europe/Berlin weekly briefing email to Nadine (MBM owner) via new Edge Function + Mailjet

**Local dev infrastructure:**
- DDEV + WSL2 environment on Summerfield clone at `/home/upan/projects/sf_staging/`
- WP-CLI synthetic seeder generating 1260 orders over 12 weeks, furniture-shop model (MBM-aligned patterns for later migration)

**First target client:** Summerfield (local DDEV only in this milestone). MBM production rollout = future milestone.

**Pre-code research:** 5 documents already written in `docs/ideas/` (WP_BRIDGE_ARCHITECTURE, REVENUE_INTELLIGENCE_V2_PLAN, MCP_UI_RESOURCE_BUILD_PIPELINE, LOCAL_DEV_SETUP, SEEDER_SPEC) — serve as research material for roadmap.

**Previous Milestone (v2.0):** Organisations — Complete (Phases 9-14), merged to main 2026-04-16.

## Requirements

### Validated

- ✓ Task list with status filters (Ihre Rückmeldung, Offen, Bereit, In Bearbeitung, Freigegeben, Erledigt) — Phase 3.5
- ✓ Task detail sheet with comments, status actions (approve, request changes, hold, cancel) — Phase 3.5
- ✓ Credit system with balance display, Kostenfreigabe approval flow, auto-deduction — Phase 3.5
- ✓ Ready status for post-credit-approval tasks (separate from TO DO) — 2026-03-26
- ✓ Support chat (dedicated task-based messaging channel) — Phase 3.5
- ✓ Notification system (bell + inbox + email via Mailjet) — Phase 3.5
- ✓ File management via Nextcloud WebDAV (browse, upload, download, create folders) — Phase 3.5
- ✓ Dynamic file root (no hardcoded folders, fully driven by Nextcloud) — 2026-03-26
- ✓ Auth (email/password, password reset, email change) via self-hosted GoTrue — Phase 3.5
- ✓ Custom auth emails through Edge Function hook (bypasses GoTrue SMTP) — 2026-03-26
- ✓ Linear-style 3-zone sidebar (Global / Workspaces / Utilities) — Phase 3.5
- ✓ Mobile-responsive layout with bottom nav + slide-out sidebar — Phase 3.5
- ✓ ClickUp webhook sync (status changes, comments → task_cache/comment_cache) — Phase 3.5
- ✓ Client onboarding script (automated user + profile + workspace + credits setup) — 2026-03-26
- ✓ Vercel auto-deploy from main branch — 2026-03-26
- ✓ Project Experience module (phases, steps, AI enrichment) — Phase 3.6
- ✓ PhaseTimeline stepper redesign (phase icons, animated connectors, status badges, mobile scroll) — Phase 4
- ✓ FilesTab + StepFilesTab Nextcloud integration (real files, not empty ClickUp attachments) — Phase 5
- ✓ Motion tab transitions (fade+slide between Aktivitaet/Dateien/Nachrichten) — Phase 5
- ✓ PhaseTimeline loading skeleton (4-node stepper-shaped placeholder) — Phase 5
- ✓ Webhook auto-creates Nextcloud folders on task creation — Phase 5
- ✓ Organizations + org_members tables, RLS via user_org_ids(), migration from profile-scoped to org-scoped — v2.0 (Phase 9-10)
- ✓ Role system enforced: admin/member/viewer with frontend guards + backend getNonViewerProfileIds filter — v2.0 (Phase 11, 14)
- ✓ /organisation admin page (team management, invite dialog, member actions) — v2.0 (Phase 12)
- ✓ Legacy profile_id cleanup from Edge Functions and Frontend — v2.0 (Phase 13)
- ✓ Revenue Intelligence v1 (daily_briefing widget via MCP Apps pattern, staging-only) — 2026-04-23

### Active

- [ ] Revenue Intelligence v2 — 4-block dashboard, Monday email, WP bridge plugin (v3.0 current milestone)
- [ ] MCP Apps platform infrastructure — build pipeline, token bridge, companion plugin pattern (v3.0)
- [ ] PWA (Progressive Web App) — installable with push notifications
- [ ] Dashboard / Übersicht — single-page overview of all client activity
- [ ] Client review reminders — auto-nudge when tasks await client action too long
- [ ] Admin dashboard — agency-side view of all clients, credits, activity
- [ ] Weekly email report — automated summary of what happened and what needs attention
- [ ] Credit system v2 — usage history, auto-replenish, reporting
- [ ] Onboarding wizard — first-login guided tour for new clients
- [ ] White-label — per-client branding (logo, colors, email templates)

### Out of Scope

- Multi-tenant (multiple agencies) — single agency only, no need yet
- Native mobile apps — PWA covers this need
- Multi-language — all clients are German-speaking, no demand
- Content editor module — deferred, no client request
- Discovery tool module — deferred, no client request
- Klaviyo integration (for Revenue Intelligence) — Phase 2, after v3.0 validates the platform
- Stock velocity / inventory analysis — MBM does not track stock in WooCommerce
- Cohort retention curves, LTV predictive models — require 12+ months data, deferred
- MBM production rollout of Revenue Intelligence v2 — future milestone after Summerfield validation

## Context

- Two production clients: MBM (mbm-moebel.de, e-commerce) and Summerfield (summerfield-garten.de, garden furniture)
- Team: Yuri (agency owner/manager), Mihael + Matic (developers in ClickUp), Claude (AI supervisor + implementation)
- Self-hosted Supabase on Coolify (portal.db.kamanin.at), frontend on Vercel (portal.kamanin.at)
- Edge Functions deployed via volume mount (no Supabase CLI support for self-hosted)
- Magic link auth disabled (GoTrue SMTP not working), password login active
- ClickUp is source of truth for tasks; portal reads from cache tables populated by webhooks
- Nextcloud is source of truth for files; portal proxies via WebDAV through Edge Function

## Constraints

- **UI Language**: German only — all user-facing text in German
- **ClickUp Proxy**: All ClickUp API calls through Edge Functions — token never exposed to browser
- **RLS**: Row-Level Security on all Supabase tables — users see only their data
- **Components < 150 lines**: Extract logic to hooks
- **ContentContainer narrow**: All app pages use max-w-4xl centered wrapper
- **shadcn/ui**: Standard for all new UI primitives
- **No staging branch**: main = production, feature branches get Vercel preview URLs

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Self-hosted Supabase | Data sovereignty, no cloud vendor lock-in | ✓ Good |
| ClickUp as backend | Team already uses it, no migration needed | ✓ Good |
| Vercel for frontend | Free tier, auto-deploy, preview URLs | ✓ Good |
| No staging branch | Small team, Vercel previews sufficient | — Pending |
| GoTrue hook for emails | Built-in SMTP broken, custom function gives control | ✓ Good |
| Ready status after credit approval | Tasks were getting lost in TO DO after approval | ✓ Good |
| Dynamic Nextcloud folders | Hardcoded folders prevented client folder customization | ✓ Good |
| Edge Function volume mount | Supabase CLI doesn't support self-hosted | ⚠️ Revisit when CLI improves |
| MCP Apps pattern for embeds | UI lives server-side (MCP UI Resources), portal is thin embed host | ✓ Good — validated in v1 Revenue Intelligence POC |
| Manual Vite for widgets (no Skybridge) | Avoid framework lock-in; own build pipeline | Milestone v3.0 |
| WordPress Abilities API + MCP Adapter | Standard auth + discovery + validation; ~150 LOC vs ~800 custom | Milestone v3.0 |
| Companion plugin (not extending Maxi AI) | Independence from Michael's plugin; blast-radius isolation | Milestone v3.0 |
| DDEV + WSL for local WP dev | Official supported stack; HPOS-safe | Milestone v3.0 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections

---
*Last updated: 2026-04-23 — Milestone v3.0 MCP Apps Platform started. Pre-code research complete (5 docs in docs/ideas/). Roadmap pending.*
