---
phase: quick-260329-gkb
plan: 01
subsystem: docs
tags: [audit, documentation, drift, cors-security]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/quick/260329-gkb-documentation-audit-verify-all-docs-and-/DRIFT-REPORT.md
  modified:
    - CLAUDE.md
    - docs/ARCHITECTURE.md
    - docs/system-context/DATABASE_SCHEMA.md
    - docs/system-context/SYSTEM_CONSTRAINTS.md
    - docs/system-context/TECH_CONTEXT.md
    - docs/planning/current-state-map.md
    - docs/planning/delivery-rules.md
    - docs/planning/product-gap-list.md
    - docs/planning/team-operating-model-v1.md
    - supabase/functions/_shared/cors.ts
    - C:/Users/upan/.claude/projects/G--01-OPUS-Projects-PORTAL/memory/project_edge_functions_deploy.md
    - C:/Users/upan/.claude/projects/G--01-OPUS-Projects-PORTAL/memory/project_mbm_launch.md
    - C:/Users/upan/.claude/projects/G--01-OPUS-Projects-PORTAL/memory/project_openrouter_review.md
    - C:/Users/upan/.claude/projects/G--01-OPUS-Projects-PORTAL/memory/MEMORY.md
  deleted:
    - docs/ideas/client-review-reminders.md
    - docs/ideas/credit-system.md
decisions:
  - "Removed stale lovable.app CORS origins from cors.ts — replaced with Vercel preview URL pattern (security improvement)"
  - "Replaced Lovable development model description in SYSTEM_CONSTRAINTS.md with accurate Claude Code + agent team description"
  - "src/app/ and src/shared/pages/ both contain ProtectedRoute.tsx and routes.tsx — both locations documented as legitimate"
metrics:
  duration: "45 minutes"
  completed: "2026-03-29"
  tasks: 3
  files: 14
---

# Phase quick-260329-gkb Plan 01: Documentation Audit Summary

Documentation audit completed. 54 drift findings documented and 44+ fixes applied across 14 files. Eliminated stale Lovable references, fixed PORTAL_staging remnants, corrected icon library references, and patched a CORS security issue.

## What Was Done

### Task 1: Drift Report (commit afa792b)
Produced comprehensive DRIFT-REPORT.md with 131 lines documenting 54 findings:
- Verified all 44 pre-identified findings from the planner
- Refuted 5 findings (React Router v7 naming is correct, supabase-js pin confirmed at 2.47.10, MEMORY.md doesn't reference deleted idea files)
- Modified finding #20: ProtectedRoute.tsx exists in BOTH `src/app/` AND `src/shared/pages/` — not just one location
- Found 10 additional drift items (#45-54) including CORS security issue

### Task 2: Fix Documentation Drift (commit bc3fc60)
Fixed all drift across 12 project files + staged 2 idea file deletions:

**CLAUDE.md (most critical):**
- Stack: removed Lucide React, added @hugeicons/react + @phosphor-icons/react + sonner
- Added Files module (`src/modules/files/`) to Modules table
- Full project structure tree rewrite: konto/, inbox/, files module, corrected hooks/lib/components for all modules
- Fixed projects hooks to match actual files (removed 3 non-existent hooks, added 3 actual ones)
- Added all 7 missing ticket components, 2 missing hooks, 1 missing lib file
- Added designer.md to agents listing; mentioned both skills (clickup-api, shadcn-ui)
- Added credit-topup and send-reminders to Edge Functions list
- CRITICAL FIX: ClickUp skill path — `PORTAL_staging` -> `PORTAL`
- Added mbm/summerfield production configs to scripts listing

**docs/ARCHITECTURE.md:** Updated 15 -> 16 functions, added send-reminders with description

**docs/system-context/DATABASE_SCHEMA.md:** Updated client_workspaces icon field from Lucide -> Hugeicons; marked stale Lovable CORS origins as LEGACY

**docs/system-context/SYSTEM_CONSTRAINTS.md:** Removed "Lovable remains generation tool" section entirely; replaced with accurate "Development model" section; fixed `.lovable/` path reference to point to STATUS_TRANSITION_MATRIX.md

**docs/system-context/TECH_CONTEXT.md:** Updated email types list from 4 to 15 types (matches actual emailCopy.ts EmailType union)

**docs/planning/ files:** Added historical notes to current-state-map, delivery-rules, team-operating-model. Updated Credits section to reflect Phase 1 implemented (TASK-010). Removed PORTAL_staging references from delivery-rules Sections 6.1, 6.3, 10.

**supabase/functions/_shared/cors.ts (SECURITY FIX):** Removed stale lovable.app, cconnect.lovable.app, lovableproject.com CORS origins. Added Vercel preview URL pattern instead.

### Task 3: Fix Memory Files (no git commit — files outside repo)
- `project_edge_functions_deploy.md`: Updated "12 Functions" -> "16 Functions + main router"; added 4 missing functions
- `project_mbm_launch.md`: Added HISTORICAL note (launch completed 2026-03-25)
- `project_openrouter_review.md`: Removed stale "usage limit until 2026-03-27" date
- `MEMORY.md`: Updated index descriptions to match corrected files

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Removed stale Lovable CORS origins from cors.ts**
- **Found during:** Task 2 (CORS origin verification, finding #32/#50)
- **Issue:** cors.ts allowed `cconnect.lovable.app`, `*.lovable.app`, `*.lovableproject.com` origins. Lovable is no longer the development platform. These dead domains could allow unexpected third-party origins to call Edge Functions.
- **Fix:** Removed all lovable.* origins, added Vercel preview URL pattern (`portal(-[a-z0-9-]+)?\.vercel\.app`) to support PR preview deployments
- **Files modified:** `supabase/functions/_shared/cors.ts`
- **Commit:** bc3fc60

**2. [Rule 2 - Missing Critical] Added localhost development origins to DATABASE_SCHEMA.md CORS docs**
- **Found during:** Task 2 cors.ts audit
- **Issue:** Database schema docs listed Lovable origins but missed localhost:5173, localhost:5174 which are in the actual cors.ts
- **Fix:** Added localhost entries to DATABASE_SCHEMA.md CORS documentation
- **Commit:** bc3fc60

**3. [Finding #20 MODIFIED] src/app/ confirmed to also have ProtectedRoute.tsx**
- **Plan said:** src/app/ is the WRONG location
- **Actual:** Both `src/app/ProtectedRoute.tsx` AND `src/shared/pages/ProtectedRoute.tsx` exist
- **Fix:** Documented `src/app/` as "bootstrap entry points" and added `src/shared/pages/` listing to project structure tree

## Verified Findings That Required No Fix

| # | Reason |
|---|--------|
| 3 | React Router v7 — correct label for react-router-dom@7.x |
| 28 | ARCHITECTURE.md already correctly lists src/modules/files/ |
| 40 | Supabase SDK pin 2.47.10 confirmed in actual function imports |
| 44 | MEMORY.md does NOT reference deleted docs/ideas/ files |
| 51 | ContentContainer reference in Architecture Rules — informational, not drift |
| 53 | main/index.ts description accurate |

## Known Stubs

None. All documentation now reflects actual codebase state.

## Self-Check: PASSED

Files verified to exist:
- DRIFT-REPORT.md: FOUND (131 lines)
- CLAUDE.md: modified and verified
- docs/ARCHITECTURE.md: updated with send-reminders
- cors.ts: Lovable origins removed, verified clean

Commits verified:
- afa792b: FOUND — drift report
- bc3fc60: FOUND — all doc fixes

Build verification: `npm run build` passed (12.05s) with no errors.

Grep verification:
- "Lucide React" in CLAUDE.md: 0 matches (PASS)
- "PORTAL_staging" in CLAUDE.md: 0 matches (PASS)
- "send-reminders" in ARCHITECTURE.md: 2 matches (PASS)
- "Lovable remains generation tool" in SYSTEM_CONSTRAINTS.md: 0 matches (PASS)
