# Quick Task 260329-hjo: Full docs audit and structure optimization - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Task Boundary

Full audit of ALL documentation files across docs/, .planning/, .learnings/, .claude/agents/, README.md.
Eliminate duplication, remove stale files, restructure for clarity.

</domain>

<decisions>
## Implementation Decisions

### docs/ vs .planning/ responsibility split
- **docs/ = source of truth** for all project documentation (architecture, DB schema, specs, changelog, decisions, ideas)
- **.planning/ = GSD artifacts only** (ROADMAP.md, STATE.md, config.json, phases/, quick/)
- **Delete .planning/codebase/** — it duplicates docs/ content (ARCHITECTURE.md, STACK.md, STRUCTURE.md, etc.)

### Stale files handling
- **Delete** files that are fully outdated or duplicate CLAUDE.md:
  - docs/EXECUTION.md (12 March, superseded by CLAUDE.md workflow)
  - docs/STATUS.md (20 March, superseded by .planning/STATE.md)
  - docs/WORKING_GUIDE.md (20 March, superseded by CLAUDE.md)
  - docs/bootstrap-prompt.md (23 March, historical Lovable-era prompt)
  - docs/REPOSITORY_MAP.md (20 March, superseded by CLAUDE.md project structure)
  - docs/superpowers/ (old task planning format, superseded by GSD)
- Git history preserves everything — clean deletion is preferred

### docs/planning/ → docs/domain/
- Rename docs/planning/ to docs/domain/ to eliminate naming confusion with .planning/
- These are business/domain documents (domain model, delivery rules, product gaps), not GSD planning artifacts
- Update all references in CLAUDE.md and other docs

### Claude's Discretion
- Evaluate .learnings/ERRORS.md — keep if useful, delete if stale
- Evaluate .claude/agents/ — verify they match current agent team described in CLAUDE.md
- Evaluate docs/qa/ — keep or delete based on relevance
- Evaluate README.md — update if stale
- Update CHANGELOG.md and DECISIONS.md with recent work (credit history, icon migration, doc audit)
- Bring remaining docs (SPEC.md, CHANGELOG.md, DECISIONS.md, BROWSER_TESTING.md, CLICKUP_INTEGRATION.md, TICKET_AUDIT_REPORT.md) to current state

</decisions>

<specifics>
## Specific Ideas

- After restructuring, the docs/ directory should have a clean, obvious hierarchy
- CLAUDE.md must be updated to reflect the new structure
- No file should exist that contradicts another file

</specifics>

<canonical_refs>
## Canonical References

- CLAUDE.md — project structure section needs update after restructuring
- docs/DECISIONS.md — new ADR for the docs restructuring decision
- Previous drift report: .planning/quick/260329-gkb-documentation-audit-verify-all-docs-and-/DRIFT-REPORT.md

</canonical_refs>
