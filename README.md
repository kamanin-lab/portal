# KAMANIN Portal

Client-facing portal for KAMANIN projects and support workflows.
Live at **https://portal.kamanin.at** (auto-deployed from `main` via Vercel).

## What this repository is

This repository (`kamanin-lab/portal`) is the single canonical production codebase. Built with:

- **Vite + React 19 + TypeScript**
- **Supabase** for auth, cache tables, realtime, and data access (self-hosted on Coolify)
- **Edge Functions** as the action/integration boundary to ClickUp and other external services
- **Vercel** for frontend hosting with automatic preview deployments per PR

The portal focuses on two main product areas:

- **Tickets / Support** — client support workflows with ClickUp integration
- **Projects / Project Experience** — project progress tracking with file management

## Current status

Active production product serving real clients (MBM, Summerfield). Core modules are stable:
- Tickets module: production-grade, Phase 3.5 complete
- Projects module: production-grade, Phase 3.6 complete
- Files module (Nextcloud WebDAV): live
- Credit system: v1 live (ledger model, monthly topups, task deductions)

## Architecture at a glance

### Data flow

```text
Browser → Supabase Auth → profiles
Browser → React Query → cache tables
Browser → Supabase Realtime → live updates
Browser → Edge Functions → ClickUp API (proxied)
ClickUp Webhook → Edge Function → cache update
```

### Key constraints

- UI reads from cache/data tables, not directly from ClickUp
- ClickUp is accessed through Edge Functions only (API token stays server-side)
- RLS enforced on all user/client data tables
- Realtime subscriptions + 30s polling fallback for freshness

## Main folders

### Active code
- `src/` — frontend application
- `supabase/functions/` — Edge Functions
- `docs/` — architecture, decisions, changelog, and domain docs
- `public/` — static assets
- `scripts/` — client onboarding + code review scripts

### Historical / reference areas
- `archive/legacy-reference/tickets/` — older reference code / historical layer
- `archive/legacy-reference/kamanin-portal/` — older reference code / historical layer

These folders are kept as **reference/legacy context**, not as the primary place for active implementation.

## Key docs

Start here:
- `CLAUDE.md` — project instructions, stack, architecture rules
- `docs/ARCHITECTURE.md` — system architecture and data flow
- `docs/DECISIONS.md` — Architecture Decision Records (ADR log)
- `docs/CHANGELOG.md` — what changed, when, why

Domain and strategy:
- `docs/domain/` — domain model, delivery rules, product gap list, team operating model

Audit reports:
- `docs/audits/` — module audit reports (projects, tickets)

Agent and skill definitions:
- `.claude/agents/` — agent role definitions (docs-memory, implementation, QA, reviewer-architect)
- `.claude/skills/` — reusable skill packages (clickup-api, shadcn-ui)

## Local development

Install dependencies:

```bash
npm install
```

Run dev server:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

## Near-term goals

- complete project memory / context layer (Phase 4)
- improve test coverage around critical flows
- strengthen project read-model and performance

## Non-goals for now

- no AI-first portal redesign
- no autonomous in-portal agent system yet
