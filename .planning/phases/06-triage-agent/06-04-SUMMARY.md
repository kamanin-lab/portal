---
phase: 06-triage-agent
plan: "04"
subsystem: docs
tags: [documentation, triage, setup, env, secrets]
dependency_graph:
  requires:
    - phase: 06-03
      provides:
        - TRIAGE_ENABLED_LIST_IDS, WP_MCP_USER, WP_MCP_APP_PASS in sync-staging-secrets.ts
        - clickup-webhook with taskCreated + HITL detection
  provides:
    - supabase/functions/.env.example (all 21 Edge Function secrets documented)
    - docs/agent-setup/triage-agent-setup.md (complete setup + verification guide)
  affects:
    - Developer onboarding for triage agent configuration
tech_stack:
  added: []
  patterns:
    - .env.example as canonical secrets reference (not committed secrets, just documentation)
    - !.env.example exception in .gitignore to allow documentation files
key_files:
  created:
    - supabase/functions/.env.example
    - docs/agent-setup/triage-agent-setup.md
  modified:
    - .gitignore (added !.env.example exception)
decisions:
  - ".gitignore had .env.* pattern blocking .env.example — added negation exception (!.env.example, !**/.env.example)"
  - "taskTagUpdated included in webhook re-registration curl command — was already subscribed before Phase 6"
  - "ANTHROPIC_API_KEY documented in .env.example despite triage using OpenRouter — it remains in sync-staging-secrets.ts allow-list for fetch-project-tasks legacy path"
metrics:
  duration_minutes: 3
  completed_date: "2026-04-06"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 1
---

# Phase 06 Plan 04: Developer Documentation Summary

**One-liner:** .env.example documenting all 21 Edge Function secrets + triage-agent-setup.md with complete setup, WP Application Password, ClickUp webhook re-registration, end-to-end verification, and HITL test guide.

## What Was Built

Two developer-facing documentation artifacts completing Phase 6:

1. **`supabase/functions/.env.example`** (new file) — Canonical reference for all 21 Edge Function secrets used across the KAMANIN portal. Organized into sections: Supabase, Security Tokens, ClickUp, Email, Nextcloud, Anthropic AI, OpenRouter AI, Triage Agent, Auth/Access, and Auth Email Hook. Each secret has a comment explaining its source and purpose. Triage Agent section includes 3 new secrets (`TRIAGE_ENABLED_LIST_IDS`, `WP_MCP_USER`, `WP_MCP_APP_PASS`) with detailed instructions for finding ClickUp list IDs and generating WordPress Application Passwords. No real values — all empty or placeholder format strings.

2. **`docs/agent-setup/triage-agent-setup.md`** (new file in new directory) — Complete setup guide for the KAMANDA Triage Agent. 10 sections covering: overview, prerequisites checklist, environment variable table, finding ClickUp list IDs, WordPress Application Password creation (step-by-step), enabling/disabling wp_mcp_url per client (SQL snippets), ClickUp webhook re-registration (exact 3-step curl commands with taskCreated + taskTagUpdated), end-to-end verification via agent_jobs SQL queries, HITL loop test instructions ([approve], [approve: Xh Ycr], [reject: reason] patterns), and a troubleshooting table with 8 common issues.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create supabase/functions/.env.example | 29045e9 | supabase/functions/.env.example, .gitignore |
| 2 | Create docs/agent-setup/triage-agent-setup.md | dfd87ff | docs/agent-setup/triage-agent-setup.md |

## Decisions Made

- **.gitignore auto-fix (Rule 3):** The root `.gitignore` had `.env.*` which blocked `.env.example` from being committed. Added negation patterns `!.env.example` and `!**/.env.example` to allow the documentation file. This is correct — `.env.example` contains no secrets.
- **taskTagUpdated in webhook curl command:** The re-registration curl command includes `taskTagUpdated` alongside the new `taskCreated` event. The original webhook was already subscribed to `taskTagUpdated` (used by recommendation tag management). Including it in the re-created webhook preserves existing functionality.
- **ANTHROPIC_API_KEY documented despite OpenRouter:** The key remains in sync-staging-secrets.ts allow-list for `fetch-project-tasks` legacy path. Documented in .env.example with a note that it is superseded by OpenRouter for most functions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] .gitignore blocked .env.example from being committed**
- **Found during:** Task 1 commit attempt
- **Issue:** Root `.gitignore` contains `.env.*` which matched `.env.example`. Git refused to stage the file.
- **Fix:** Added `!.env.example` and `!**/.env.example` negation exceptions to `.gitignore`
- **Files modified:** `.gitignore`
- **Commit:** 29045e9 (included in same commit as .env.example)

## Known Stubs

None — both files are complete documentation artifacts with no placeholder text.

## Self-Check: PASSED

Files created:
- [x] supabase/functions/.env.example — EXISTS
- [x] docs/agent-setup/triage-agent-setup.md — EXISTS

Commits verified:
- [x] 29045e9 — chore(06-04): create supabase/functions/.env.example with all secrets documented
- [x] dfd87ff — docs(06-04): create triage-agent-setup.md with complete setup and verification guide
