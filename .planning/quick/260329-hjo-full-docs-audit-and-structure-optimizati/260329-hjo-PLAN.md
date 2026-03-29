---
phase: quick-260329-hjo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # DELETIONS
  - docs/EXECUTION.md
  - docs/STATUS.md
  - docs/WORKING_GUIDE.md
  - docs/bootstrap-prompt.md
  - docs/REPOSITORY_MAP.md
  - docs/superpowers/plans/2026-03-22-nextcloud-folders.md
  - docs/superpowers/plans/2026-03-22-nextcloud-folders-design.md
  - docs/superpowers/plans/2026-03-22-nextcloud-folder-structure-design.md
  - docs/superpowers/plans/2026-03-23-credit-system-design.md
  - docs/superpowers/specs/
  - .planning/codebase/ARCHITECTURE.md
  - .planning/codebase/CONCERNS.md
  - .planning/codebase/CONVENTIONS.md
  - .planning/codebase/INTEGRATIONS.md
  - .planning/codebase/STACK.md
  - .planning/codebase/STRUCTURE.md
  - .planning/codebase/TESTING.md
  # RENAMES
  - docs/planning/  # renamed to docs/domain/
  # UPDATES
  - docs/SPEC.md
  - docs/CHANGELOG.md
  - docs/DECISIONS.md
  - docs/BROWSER_TESTING.md
  - docs/CLICKUP_INTEGRATION.md
  - docs/TICKET_AUDIT_REPORT.md
  - docs/reference/project-memory-notes.md
  - .learnings/ERRORS.md
  - .claude/agents/designer.md
  - .claude/agents/docs-memory-agent.md
  - .claude/agents/implementation-agent.md
  - .claude/agents/qa-agent.md
  - .claude/agents/reviewer-architect.md
  - README.md
  - CLAUDE.md
autonomous: true
requirements: []

must_haves:
  truths:
    - "No stale/duplicate documentation files exist in the repository"
    - "docs/ is the single source of truth for project documentation, .planning/ contains only GSD artifacts"
    - "docs/domain/ exists with all former docs/planning/ files, docs/planning/ no longer exists"
    - "All remaining docs reflect current project state (no references to PORTAL_staging, Lucide as primary icons, React 18, or other outdated info)"
    - "CLAUDE.md accurately describes the new docs/ structure and references docs/domain/ instead of docs/planning/"
    - "DECISIONS.md contains an ADR for this restructuring"
  artifacts:
    - path: "docs/domain/current-state-map.md"
      provides: "Renamed from docs/planning/"
    - path: "docs/domain/domain-model-v1.md"
      provides: "Renamed from docs/planning/"
    - path: "CLAUDE.md"
      provides: "Updated project structure and references"
      contains: "docs/domain/"
  key_links:
    - from: "CLAUDE.md"
      to: "docs/domain/"
      via: "Key Files and Project Structure sections"
      pattern: "docs/domain/"
    - from: "CLAUDE.md"
      to: "docs/DECISIONS.md"
      via: "Docs Update Protocol"
      pattern: "DECISIONS.md"
    - from: "docs/DECISIONS.md"
      to: "CLAUDE.md"
      via: "ADR for this restructuring"
      pattern: "ADR-023"
---

<objective>
Full documentation audit and structure optimization: delete stale/duplicate files, rename docs/planning/ to docs/domain/, update all remaining docs to current state, update CLAUDE.md to reflect the new structure.

Purpose: Eliminate documentation confusion (duplicate content between docs/ and .planning/, stale files referencing PORTAL_staging, outdated tech references) so that docs/ is a clean, trustworthy source of truth.

Output: Clean docs/ directory with no stale files, updated CLAUDE.md, ADR recorded.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/260329-hjo-full-docs-audit-and-structure-optimizati/260329-hjo-CONTEXT.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete stale files and .planning/codebase/, rename docs/planning/ to docs/domain/</name>
  <files>
    docs/EXECUTION.md, docs/STATUS.md, docs/WORKING_GUIDE.md, docs/bootstrap-prompt.md, docs/REPOSITORY_MAP.md,
    docs/superpowers/ (entire directory),
    .planning/codebase/ (entire directory — 7 files),
    docs/planning/ (rename to docs/domain/)
  </files>
  <action>
    **Per locked decision D-01 (docs/ = source of truth, .planning/ = GSD only):**

    1. Delete these stale files (git rm):
       - `docs/EXECUTION.md` — Phase 0 execution plan, superseded by CLAUDE.md
       - `docs/STATUS.md` — references PORTAL_staging as active, superseded by .planning/STATE.md
       - `docs/WORKING_GUIDE.md` — references PORTAL_staging as staging, fully superseded by CLAUDE.md
       - `docs/bootstrap-prompt.md` — historical Lovable-era bootstrap prompt, no longer relevant
       - `docs/REPOSITORY_MAP.md` — superseded by CLAUDE.md project structure section

    2. Delete docs/superpowers/ (entire directory tree):
       - `docs/superpowers/plans/` (4 files: nextcloud folder designs, credit system design)
       - `docs/superpowers/specs/` (if any contents)
       - Old task planning format, superseded by GSD workflow

    3. Delete .planning/codebase/ (entire directory — 7 files):
       - ARCHITECTURE.md, CONCERNS.md, CONVENTIONS.md, INTEGRATIONS.md, STACK.md, STRUCTURE.md, TESTING.md
       - These duplicate content from docs/ — GSD codebase context is NOT needed when docs/ is maintained

    4. Rename docs/planning/ to docs/domain/:
       - Use `git mv docs/planning docs/domain` to preserve git history
       - This contains: current-state-map.md, delivery-rules.md, domain-model-v1.md, product-gap-list.md, project-panel-redesign-v2.md, team-operating-model-v1.md
       - These are business/domain documents, NOT GSD planning artifacts

    5. Evaluate and handle discretionary items:
       - `docs/qa/screenshots/` — 5 QA screenshots. DELETE (screenshots are ephemeral QA evidence, not documentation)
       - `.learnings/ERRORS.md` — contains 1 resolved error. KEEP (still useful as a pattern reference, but small)
       - `docs/TICKET_AUDIT_REPORT.md` — historical audit from Phase 3.5. KEEP as reference in docs/audits/ area (move to `docs/audits/ticket-audit-report.md` alongside existing `projects-module-audit.md`)

    Commands:
    ```bash
    git rm docs/EXECUTION.md docs/STATUS.md docs/WORKING_GUIDE.md docs/bootstrap-prompt.md docs/REPOSITORY_MAP.md
    git rm -r docs/superpowers/
    git rm -r .planning/codebase/
    git rm -r docs/qa/
    git mv docs/planning docs/domain
    git mv docs/TICKET_AUDIT_REPORT.md docs/audits/ticket-audit-report.md
    ```
  </action>
  <verify>
    <automated>bash -c "test ! -f docs/EXECUTION.md && test ! -f docs/STATUS.md && test ! -f docs/WORKING_GUIDE.md && test ! -f docs/bootstrap-prompt.md && test ! -f docs/REPOSITORY_MAP.md && test ! -d docs/superpowers && test ! -d .planning/codebase && test ! -d docs/planning && test -d docs/domain && test -f docs/domain/domain-model-v1.md && test -f docs/audits/ticket-audit-report.md && echo PASS || echo FAIL"</automated>
  </verify>
  <done>All 5 stale docs deleted, docs/superpowers/ deleted, .planning/codebase/ (7 files) deleted, docs/qa/ deleted, docs/planning/ renamed to docs/domain/ with all 6 files intact, TICKET_AUDIT_REPORT.md moved to docs/audits/</done>
</task>

<task type="auto">
  <name>Task 2: Update remaining docs to current project state</name>
  <files>
    docs/SPEC.md, docs/CHANGELOG.md, docs/DECISIONS.md, docs/BROWSER_TESTING.md, docs/CLICKUP_INTEGRATION.md,
    docs/reference/project-memory-notes.md,
    .claude/agents/designer.md, .claude/agents/docs-memory-agent.md, .claude/agents/implementation-agent.md,
    .claude/agents/qa-agent.md, .claude/agents/reviewer-architect.md,
    README.md
  </files>
  <action>
    Update all remaining documentation to reflect the current state of the project. Key corrections needed:

    **docs/SPEC.md:**
    - Section 2 sidebar: background should reference sidebar token vars (currently says "#1C1C1C" but actual is --sidebar-bg: #1A1247)
    - Section 10 component trees: `modules/tasks/` should be `modules/tickets/` (the actual directory name)
    - Section 10: update to reflect actual file structure — SupportSheet, SupportChat, NotificationBell are in tickets module; shared components (MessageBubble, StatusBadge, EmptyState, etc.) are in src/shared/components/common/
    - Section 10: add files/ module tree (`src/modules/files/`)
    - Remove reference to `kamanin-portal-prototype.html` at top (line 4) — prototype is archived, not actively used

    **docs/CHANGELOG.md:**
    - Add entries for recent work not yet logged:
      - 2026-03-29: Documentation audit and drift fix (54 findings, 12 files fixed, CORS hardening) — from quick task 260329-gkb
      - 2026-03-29: Projects module audit (22 findings, 4 critical broken pipelines, German fix) — from quick task 260329-fhb
      - 2026-03-29: Credit history + icon migration to Hugeicons (commit 984a424)
      - 2026-03-29: UI audit fixes — typography scale, spacing cleanup, German translations (commit 02b0ce6)
      - 2026-03-29: Full docs restructuring (this task) — stale file removal, docs/planning to docs/domain, all docs refreshed

    **docs/DECISIONS.md:**
    - Add ADR-023: Documentation restructuring — docs/ as source of truth, .planning/ for GSD only
      - Context: Duplicate content existed between docs/ and .planning/codebase/. Stale files referenced PORTAL_staging (no longer exists). docs/planning/ confused with .planning/
      - Decision: Delete .planning/codebase/ (7 files), delete 5 stale docs, rename docs/planning/ to docs/domain/
      - Consequences: Single source of truth in docs/. Clean separation from GSD artifacts.
    - Add ADR-024: Icon library migration — Hugeicons (primary) + Phosphor (secondary)
      - Context: Lucide React was listed in CLAUDE.md but @hugeicons/react is actually installed and used as primary
      - Decision: Hugeicons as primary (stroke rounded), Phosphor as secondary (weights/duotone). Lucide remains for existing code only.

    **docs/BROWSER_TESTING.md:**
    - Fix path: `PORTAL_staging` reference in `--output-dir` should be `PORTAL`
    - Fix `config/mcporter.json` reference — verify this path is correct or update
    - Clarify this is optional tooling, not a hard dependency

    **docs/CLICKUP_INTEGRATION.md:**
    - This file is very thin (21 lines) and only covers Phase 4 comment threading. It should be expanded or clarified as a specific topic guide, not a general ClickUp reference. Add a note pointing to `.claude/skills/clickup-api/SKILL.md` as the comprehensive ClickUp API reference.

    **docs/reference/project-memory-notes.md:**
    - No content changes needed — this is accurate technical notes about project memory implementation

    **.claude/agents/ updates (all 5 files):**
    Fix stale references across all agent files:
    - `implementation-agent.md`: "React 18" should be "React 19" (React 19 is the actual version per package.json/CLAUDE.md)
    - `reviewer-architect.md`: "React 18" should be "React 19"
    - `designer.md`: "Lucide React" references — add note that Hugeicons is now primary per ADR-024. Already has Hugeicons section but line 29 still says "shadcn/ui base, Lucide React icons"
    - `docs-memory-agent.md`: `docs/planning/` reference in Target Files should be `docs/domain/`
    - `qa-agent.md`: `/superpowers:verification-before-completion` skill reference — this skill does not exist (docs/superpowers/ is being deleted). Remove this line.

    **README.md:**
    - Remove "staging working copy" language and PORTAL_staging references (lines 32-37) — single repo since ADR-022
    - Remove "Known repository reality" section (lines 114-120) — no longer accurate
    - Update "Key docs" section: remove references to deleted files (STATUS.md, REPOSITORY_MAP.md, WORKING_GUIDE.md), add docs/domain/ reference
    - Update "Current status" priorities to reflect actual state (credits v1 is done, not future)
    - Simplify "Non-goals for now" — remove "no risky changes in the original reference copy" (irrelevant now)
  </action>
  <verify>
    <automated>bash -c "grep -c 'PORTAL_staging' README.md docs/BROWSER_TESTING.md .claude/agents/*.md 2>/dev/null; grep -c 'React 18' .claude/agents/implementation-agent.md .claude/agents/reviewer-architect.md 2>/dev/null; grep -c 'docs/planning/' .claude/agents/docs-memory-agent.md 2>/dev/null; grep -c 'superpowers' .claude/agents/qa-agent.md 2>/dev/null; grep -c 'ADR-023' docs/DECISIONS.md 2>/dev/null; echo 'Expected: all counts 0 except ADR-023 which should be 1+'"</automated>
  </verify>
  <done>All remaining docs updated to current state: no PORTAL_staging references, no React 18 mentions in agents, no docs/planning/ references, no superpowers references, ADR-023 and ADR-024 recorded, CHANGELOG has 2026-03-29 entries, README reflects single-repo reality</done>
</task>

<task type="auto">
  <name>Task 3: Update CLAUDE.md to reflect new structure + final consistency check</name>
  <files>CLAUDE.md</files>
  <action>
    **Per locked decision D-05 (Update CLAUDE.md to reflect new structure):**

    Update CLAUDE.md with these specific changes:

    1. **Key Files table:** Remove entries for deleted files. Keep all valid entries.

    2. **Project Structure tree:** Update the `docs/` section:
       - Remove: `planning/` entries → replace with `domain/` entries
       - Remove: EXECUTION.md, STATUS.md, WORKING_GUIDE.md, bootstrap-prompt.md, REPOSITORY_MAP.md, superpowers/
       - Add: `audits/` with `projects-module-audit.md` and `ticket-audit-report.md`
       - Show: `domain/` with all 6 files (current-state-map.md, delivery-rules.md, domain-model-v1.md, product-gap-list.md, project-panel-redesign-v2.md, team-operating-model-v1.md)

    3. **Key Project Documents section:** Update all `docs/planning/` references to `docs/domain/`

    4. **Docs Update Protocol section:** Verify it references correct paths

    5. **Icon references:** The Stack section says "Lucide React" — this should be updated to reflect the actual state:
       - Primary: @hugeicons/react (Hugeicons)
       - Secondary: @phosphor-icons/react (Phosphor Icons)
       - Legacy: Lucide React (existing components only, not for new code)

    6. **Final consistency verification:** After all edits, do a comprehensive grep across the entire docs/ and .claude/ tree for:
       - `PORTAL_staging` — must be zero matches
       - `docs/planning/` — must be zero matches (should all be docs/domain/)
       - `docs/EXECUTION.md` — must be zero matches
       - `docs/STATUS.md` — must be zero matches (the file, not the concept)
       - `docs/WORKING_GUIDE.md` — must be zero matches
       - `docs/REPOSITORY_MAP.md` — must be zero matches
       - `docs/superpowers` — must be zero matches
       - `.planning/codebase` — must be zero matches
       Fix any remaining references found.

    7. Verify `npm run build` still passes (no imports of deleted files).
  </action>
  <verify>
    <automated>bash -c "cd 'G:/01_OPUS/Projects/PORTAL' && npm run build 2>&1 | tail -5 && echo '---' && grep -rn 'PORTAL_staging' CLAUDE.md docs/ .claude/ README.md .learnings/ 2>/dev/null | grep -v 'node_modules' | grep -v '.git/' | wc -l && echo 'stale refs (should be 0)' && grep -rn 'docs/planning/' CLAUDE.md docs/ .claude/ README.md 2>/dev/null | wc -l && echo 'old planning refs (should be 0)' && grep -c 'docs/domain/' CLAUDE.md && echo 'domain refs in CLAUDE.md (should be 2+)'"</automated>
  </verify>
  <done>CLAUDE.md accurately reflects new docs/ structure with docs/domain/, updated icon library references, no stale file references anywhere in documentation tree, build passes</done>
</task>

</tasks>

<verification>
1. No deleted files exist on disk: docs/EXECUTION.md, docs/STATUS.md, docs/WORKING_GUIDE.md, docs/bootstrap-prompt.md, docs/REPOSITORY_MAP.md, docs/superpowers/, .planning/codebase/, docs/qa/
2. docs/domain/ exists with all 6 files from former docs/planning/
3. Zero grep matches for: PORTAL_staging, docs/planning/, .planning/codebase, docs/superpowers across all docs
4. CLAUDE.md references docs/domain/ (not docs/planning/)
5. docs/DECISIONS.md contains ADR-023
6. npm run build passes
</verification>

<success_criteria>
- All stale files deleted (5 docs + superpowers/ + .planning/codebase/ + qa/)
- docs/planning/ successfully renamed to docs/domain/
- All remaining docs updated to current project reality
- CLAUDE.md structure section matches actual docs/ directory
- Zero cross-references to deleted files or old paths
- ADR-023 and ADR-024 recorded
- Build passes cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/260329-hjo-full-docs-audit-and-structure-optimizati/260329-hjo-SUMMARY.md`
</output>
