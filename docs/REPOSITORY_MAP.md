# Repository Map

## Purpose

This document explains which parts of the repository are the active implementation surface and which parts are historical/reference context.

---

## Primary active areas

### `src/`
Main frontend application.

### `supabase/functions/`
Edge Functions and integration boundary.

### `docs/`
Architecture, decisions, status, and project documentation.

### `public/`
Static assets.

---

## Important root files

### `README.md`
Project overview and working rules.

### `package.json`
Dependencies and local scripts.

### `CLAUDE.md`
Project-specific notes/instructions carried with the repo.

### `EXECUTION.md`
Historical/planning execution context; useful, but should be read carefully against current repo reality.

---

## Historical / legacy / reference areas

### `tickets/`
Older code/reference layer from earlier project phase.
Do not treat this as the primary active app unless explicitly needed for comparison/reference.

### `kamanin-portal/`
Older code/reference layer from an earlier structure.
Useful for archaeology/reference only.

### `dist/`
Build output.
Not source of truth.

### `node_modules/`
Installed dependencies.
Not source of truth.

---

## Working interpretation

When implementing new work in this staging repository:

- use `src/`, `supabase/functions/`, and `docs/` as the primary active areas
- treat `tickets/` and `kamanin-portal/` as historical context unless a specific comparison is needed
- do not build new primary logic inside legacy/reference directories

---

## Current source-of-truth rule

- implementation truth: current active app at repo root
- architecture truth: `docs/ARCHITECTURE.md` + `docs/DECISIONS.md`
- working status truth: `docs/STATUS.md`
