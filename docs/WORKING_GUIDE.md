# Working Guide

## Purpose

This is the practical working guide for the current staging repository.

Use this file when you need the shortest reliable answer to:
- what is the active implementation surface
- what is legacy/reference only
- what the current priorities are
- what to read first

---

## Current working repository

Active working copy:
- `G:/01_OPUS/Projects/PORTAL_staging`

Reference-only original:
- `G:/01_OPUS/Projects/PORTAL`

Rule:
- do not implement in the original copy
- implement only in staging

---

## Active implementation areas

- `src/`
- `supabase/functions/`
- `docs/`
- `public/`

---

## Archived reference areas

- `archive/legacy-reference/tickets/`
- `archive/legacy-reference/kamanin-portal/`
- `archive/legacy-reference/root-planning/` (historical root planning docs when superseded)

These are reference only.

---

## Current priority order

1. tickets completion
2. projects completion
3. client memory / context design
4. credits model design

---

## Read this first

1. `README.md`
2. `docs/STATUS.md`
3. `docs/REPOSITORY_MAP.md`
4. `docs/ARCHITECTURE.md`
5. `docs/DECISIONS.md`
6. `docs/reference/context-hub/README.md` when touching React / Tailwind / Vite / Vitest or other Context Hub-covered tech
7. `docs/reference/supabase-context-hub/README.md` when touching Supabase
8. `.claude/skills/clickup-api/SKILL.md` when touching ClickUp

---

## Important reality checks

- this repo is already a real product codebase, not a prototype
- tickets is currently the most mature module
- projects has a strong base but is not yet fully product-complete
- client memory/context is important but not yet a first-class implemented layer
- credits are future work and need domain design before implementation
