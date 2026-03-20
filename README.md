# KAMANIN Portal

Client-facing portal for KAMANIN projects and support workflows.

## What this repository is

This repository contains the current portal application built with:

- **Vite + React + TypeScript**
- **Supabase** for auth, cache tables, realtime, and data access
- **Edge Functions** as the action/integration boundary to ClickUp and other external services

The portal currently focuses on two main product areas:

- **Tickets / Support**
- **Projects / Project Experience**

## Current status

This is an active product codebase with a strong foundation.
It is **not** a greenfield prototype anymore, but it is also **not yet fully product-complete**.

Current priorities:
1. improve repo clarity and docs alignment
2. complete tickets module as a production-grade workflow
3. complete projects module as a production-grade client workspace
4. design and introduce client memory / context layer
5. later design credits / commercial accounting properly

## Important working rule

This repository is the **staging working copy**.

- original reference folder: `G:/01_OPUS/Projects/PORTAL`
- staging working folder: `G:/01_OPUS/Projects/PORTAL_staging`

All future implementation work should happen in **staging**, not in the original reference copy.

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
- ClickUp is accessed through Edge Functions
- RLS is used on user/client data
- realtime and polling are used for freshness depending on module/flow

## Main folders

### Active code
- `src/` — frontend application
- `supabase/functions/` — Edge Functions
- `docs/` — architecture, decisions, status, and working docs
- `public/` — static assets

### Historical / reference areas
- `archive/legacy-reference/tickets/` — older reference code / historical layer
- `archive/legacy-reference/kamanin-portal/` — older reference code / historical layer

These folders are kept as **reference/legacy context**, not as the primary place for active implementation.

## Key docs

Start here:
- `docs/WORKING_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/STATUS.md`
- `docs/REPOSITORY_MAP.md`

Planning documents created outside the repo currently live in:
- `C:/Users/upan/.openclaw/workspace/portal-planning/`

Historical root planning docs moved out of the active root:
- `archive/legacy-reference/root-planning/`

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

## Known repository reality

This repository still contains some historical layers and documentation drift from earlier phases.
That is expected at the current stage.
The immediate goal is **clarity first**, not destructive cleanup.

## Near-term goals

- stabilize repo structure and source-of-truth docs
- finish product understanding of tickets and projects
- prepare stronger test coverage around critical flows
- improve project read-model clarity and future performance path

## Non-goals for now

- no AI-first portal redesign
- no autonomous in-portal agent system yet
- no risky changes in the original reference copy
