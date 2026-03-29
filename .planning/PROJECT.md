# KAMANIN Client Portal

## What This Is

Modular B2B client portal for KAMANIN IT Solutions (web agency, Salzburg, Austria). German-language interface where clients track projects, review deliverables, approve work, manage support tickets, and browse files — without ever seeing ClickUp. Live at portal.kamanin.at, serving MBM and Summerfield as first production clients.

## Core Value

Clients always know what needs their attention and can act on it in one click — approve, request changes, or communicate — without any project management complexity.

## Current Milestone: v1.1 Projects Module v2

**Goal:** Fix all broken pipelines in the Projects module, improve AI enrichment lifecycle, redesign the PhaseTimeline with Motion animations, and unify data sources — implementing all 22 findings from the formal audit.

**Target features:**
- Fix 4 critical broken data pipelines (TasksPage, MessagesPage, ContextStrip ETA, empty enrichment sections)
- AI enrichment improvements (hash-based re-enrichment, manual trigger, hero surfacing)
- PhaseTimeline redesign (Motion animations, partial progress, mobile responsive, tooltips)
- Data unification and polish (ProjectContext integration, FilesTab clarity, page transitions)

**PRD:** `docs/audits/projects-module-audit.md`

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

### Active

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
*Last updated: 2026-03-29 — Phase 02 complete (Critical Fixes — 4 broken data pipelines fixed)*
