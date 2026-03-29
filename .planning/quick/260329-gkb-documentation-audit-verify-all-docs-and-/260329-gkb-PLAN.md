---
phase: quick-260329-gkb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/260329-gkb-documentation-audit-verify-all-docs-and-/DRIFT-REPORT.md
  - CLAUDE.md
  - docs/ARCHITECTURE.md
  - docs/CHANGELOG.md
  - docs/system-context/DATABASE_SCHEMA.md
  - docs/system-context/SYSTEM_CONSTRAINTS.md
  - docs/system-context/TECH_CONTEXT.md
  - docs/system-context/STATUS_TRANSITION_MATRIX.md
  - docs/system-context/NOTIFICATION_MATRIX.md
  - docs/planning/current-state-map.md
  - docs/planning/delivery-rules.md
  - docs/planning/product-gap-list.md
  - docs/planning/team-operating-model-v1.md
autonomous: true
requirements: [AUDIT-01, AUDIT-02, AUDIT-03]

must_haves:
  truths:
    - "Every file path referenced in CLAUDE.md exists on disk"
    - "Every Edge Function listed in docs exists in supabase/functions/"
    - "Every component listed in CLAUDE.md project structure exists in src/"
    - "Stack description in CLAUDE.md matches package.json dependencies"
    - "Module statuses in CLAUDE.md reflect actual implementation state"
    - "Planning docs no longer reference PORTAL_staging as separate repo"
    - "Memory files contain no stale references"
  artifacts:
    - path: ".planning/quick/260329-gkb-documentation-audit-verify-all-docs-and-/DRIFT-REPORT.md"
      provides: "Complete drift analysis with every inconsistency found"
      min_lines: 100
    - path: "CLAUDE.md"
      provides: "Corrected project instructions matching actual codebase"
    - path: "docs/ARCHITECTURE.md"
      provides: "Architecture doc consistent with actual modules and functions"
  key_links:
    - from: "CLAUDE.md"
      to: "actual codebase files"
      via: "file path references"
      pattern: "src/|supabase/|docs/|scripts/"
    - from: "docs/ARCHITECTURE.md"
      to: "actual Edge Functions"
      via: "function listing"
      pattern: "supabase/functions/"
---

<objective>
Strict documentation audit: verify ALL project documentation and memory files against the actual codebase state. Fix every inconsistency found.

Purpose: Eliminate documentation drift that causes incorrect agent behavior, wrong file references, and stale architectural assumptions.
Output: DRIFT-REPORT.md with all findings, then corrected documentation files.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@docs/ARCHITECTURE.md
@docs/CHANGELOG.md
@docs/system-context/DATABASE_SCHEMA.md
@docs/system-context/SYSTEM_CONSTRAINTS.md
@docs/system-context/TECH_CONTEXT.md
@docs/system-context/STATUS_TRANSITION_MATRIX.md
@docs/system-context/NOTIFICATION_MATRIX.md
@docs/planning/current-state-map.md
@docs/planning/delivery-rules.md
@docs/planning/product-gap-list.md
@docs/planning/team-operating-model-v1.md
@package.json

<interfaces>
<!-- Pre-computed drift findings from planner analysis. The executor should verify these
     and discover any additional drift, then fix all documentation files. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Produce comprehensive drift report</name>
  <files>.planning/quick/260329-gkb-documentation-audit-verify-all-docs-and-/DRIFT-REPORT.md</files>
  <action>
Read ALL documentation files listed in context, cross-reference against actual codebase structure (using ls, grep), and produce DRIFT-REPORT.md documenting every inconsistency found.

The planner has already identified the following drift. The executor MUST verify each item and discover any additional drift:

## CLAUDE.md Drift (CRITICAL)

1. **Stack: "Lucide React" listed but not in package.json and zero imports in codebase.** Actual icon libraries are `@hugeicons/react`, `@hugeicons/core-free-icons`, and `@phosphor-icons/react`. CLAUDE.md Stack section and all references to "Lucide React" must be updated.

2. **Stack: Missing icon libraries.** `@hugeicons/react` and `@phosphor-icons/react` are in package.json but not mentioned in CLAUDE.md Stack.

3. **Stack: "React Router v7" stated but package.json shows `react-router-dom@^7.13.1`.** This is correct but the codebase may still use v6-style imports. Verify import patterns.

4. **Stack: Missing `sonner` from Stack.** `sonner@^2.0.7` is in package.json (toast library) but not in CLAUDE.md Stack.

5. **Project Structure: `docs/ideas/` only lists `knowledge-base.md`** but actual directory has 5 files: `admin-dashboard.md`, `credit-evolution.md`, `knowledge-base.md`, `organizations.md`, `recommendations.md`.

6. **Project Structure: Missing `src/modules/files/` module.** This is a standalone module (ClientFolderView, ClientFileRow, ClientActionBar, useClientFiles, DateienPage) but not listed in the Modules table or Project Structure tree.

7. **Modules table: Missing Files module.** `src/modules/files/` exists with components, hooks, and pages but is not in the CLAUDE.md Modules table.

8. **Project Structure: Missing `docs/audits/` directory.** `docs/audits/projects-module-audit.md` exists but not in project structure tree.

9. **Project Structure: Missing `src/shared/components/konto/` directory.** Contains 6 components (AvatarUpload, CreditHistorySection, EmailSection, NotificationSection, PasswordSection, ProfileSection) but not listed.

10. **Project Structure: Missing `src/shared/components/inbox/` directory.** Contains NotificationAccordionItem, NotificationDetailPanel, TypeBadge, and utils but not listed.

11. **Project Structure: `src/shared/components/ui/` says "SideSheet (shadcn/ui base)"** but actually contains 9 components: alert-dialog, avatar, badge, button, input, SideSheet, skeleton, tabs, textarea.

12. **Shared hooks: Missing `useSwipeGesture` and `useUpdateProfile`.** Listed are only useAuth, useBreakpoint, useWorkspaces. Actual: useAuth, useBreakpoint, useSwipeGesture, useUpdateProfile, useWorkspaces.

13. **Shared lib: Missing `password-validation.ts` and `slugify.ts`.** Listed: supabase.ts, utils.ts, linkify.tsx, workspace-routes.ts. Actual adds password-validation.ts and slugify.ts.

14. **Project hooks: Missing `useNextcloudFiles`, `useProjectActivity`, `useProjectComments`.** CLAUDE.md lists useProject, useProjects, useProjectMemory, useChapterHelpers, useHeroPriority, useNextcloudFilesByPath, useUploadFileByPath, useCreateFolder. Actual has: useChapterHelpers, useHeroPriority, useNextcloudFiles, useProject, useProjectActivity, useProjectComments, useProjectMemory, useProjects. Note: useNextcloudFilesByPath, useUploadFileByPath, useCreateFolder are NOT in hooks directory (may be elsewhere or removed).

15. **Project lib: Missing `quick-action-helpers.ts`.** CLAUDE.md lists helpers, transforms-project, phase-colors, step-status-mapping, memory-access, memory-store, overview-interpretation, mock-data. Actual adds quick-action-helpers.ts.

16. **Ticket hooks: Missing `useCreditHistory`.** CLAUDE.md lists useClickUpTasks, useTaskComments, useTaskActions, useNotifications, useUnreadCounts, useCreateTask, useSingleTask, useSupportTaskChat. Actual adds useCreditHistory.

17. **Ticket lib: Missing `task-list-utils.ts`.** Listed: status-mapping, status-dictionary, transforms, dictionary, logger. Actual adds task-list-utils.ts.

18. **Ticket components: Missing several components.** CLAUDE.md lists ~18 components. Actual has 24: adds CommentInputParts, CreditApproval, CreditBadge, CreditBalance, FileAttachments, ProjectTaskFormFields, TicketFormFields.

19. **Project components: Missing several.** CLAUDE.md lists "overview/, steps/, tasks/, files/, messages/, help/". Actual overview/ has 16 components. Also missing top-level: MessageSheet.tsx, SchritteSheet.tsx, StepSheet.tsx, UploadDropZone.tsx, UploadFolderSelector.tsx.

20. **Shared pages directory not mentioned.** `src/app/` listed for "ProtectedRoute.tsx, routes.tsx" but actual directory `src/shared/pages/` contains: HilfePage, InboxPage, KontoPage, LoginPage, MeineAufgabenPage, NotFoundPage. ProtectedRoute.tsx and routes.tsx are also in shared/pages, not src/app/.

21. **Key Files: ClickUp skill path references PORTAL_staging.** Line: `G:/01_OPUS/Projects/PORTAL_staging/.claude/skills/clickup-api/SKILL.md`. Should be `G:/01_OPUS/Projects/PORTAL/.claude/skills/clickup-api/SKILL.md`.

22. **Edge Functions: CLAUDE.md lists 14 functions + main. Actual has 16 + main.** Missing from CLAUDE.md: `credit-topup` and `send-reminders`.

23. **ARCHITECTURE.md lists 15 functions + main.** Lists credit-topup but NOT send-reminders. Actual has 16 + main (send-reminders exists).

24. **Scripts: Only lists openrouter-review.cjs and onboard-client.ts.** Actual scripts/ has: mbm-production.json, onboard-client.ts, openrouter-review.cjs, summerfield-production.json.

25. **Agents: CLAUDE.md lists 4 agents** (docs-memory, implementation, qa, reviewer-architect). Actual .claude/agents/ has 5: adds `designer.md`.

26. **Skills: CLAUDE.md mentions "Skills (e.g., clickup-api/)"** but actual has 2: `clickup-api/` and `shadcn-ui/`.

27. **client_workspaces icon column says "Icon name from Lucide React"** in DATABASE_SCHEMA.md. Must update to reflect Hugeicons migration.

## docs/ARCHITECTURE.md Drift

28. **Module listing includes `src/modules/files/`** which is correct, but CLAUDE.md does NOT list it. ARCHITECTURE.md is MORE correct than CLAUDE.md here.

29. **Edge Functions count: "15 Functions + main router"** but actual count is 16 + main (missing send-reminders).

## docs/system-context/SYSTEM_CONSTRAINTS.md Drift

30. **"Lovable remains generation tool" section is completely stale.** The project left Lovable long ago. The frontend is a standalone Vite+React project, not generated by Lovable. This section must be removed or rewritten.

31. **"The mapping is defined in `.lovable/ClientPortal_ClickUp_TaskLifecycle_FINAL.md`"** — this file path references the old Lovable structure. Must reference the correct current file.

32. **cors.ts whitelist includes `cconnect.lovable.app` and `*.lovable.app` patterns** in DATABASE_SCHEMA.md. These may be stale if Lovable is no longer used. Verify if these origins still serve a purpose.

## docs/planning/ Drift (Multiple files)

33. **current-state-map.md references "staging repository at PORTAL_staging"** as active. This is stale — PORTAL_staging was consolidated into PORTAL (ADR-022).

34. **delivery-rules.md: Core Principle says "original portal folder is not the implementation surface"** and maintains the PORTAL (frozen) vs PORTAL_staging (active) distinction. This is completely stale after ADR-022.

35. **delivery-rules.md: Section 6.1 references `G:/01_OPUS/Projects/PORTAL_staging`** as planning docs location.

36. **delivery-rules.md: Section 6.3 maintains three-environment source-of-truth** (staging code, planning docs, original portal). This collapsed to a single repo.

37. **team-operating-model-v1.md: Section 3.1 says PORTAL is "frozen read-only reference"** and Section 3.2 says PORTAL_staging is "active implementation surface". Both are stale.

38. **product-gap-list.md: Section 3.4 "Credits / Commercial Logic" says "not yet implemented"** but credits were implemented in TASK-010 (credit_packages, credit_transactions, CreditBalance, CreditBadge, CreditApproval, credit-topup Edge Function). Also, Section 7.1 "No staging work surface yet" has status "CLOSED" but references old path.

## docs/system-context/TECH_CONTEXT.md Drift

39. **Email types list in Section 2 Edge Functions says "task_review, task_completed, team_question, support_response"** but actual emailCopy.ts supports more: also includes step_ready, project_reply, magic_link, password_reset, email_confirmation, signup, invite, email_change. NOTIFICATION_MATRIX.md is more complete.

40. **"Pinned to @supabase/supabase-js@2.47.10"** — verify if this is still the pinned version. Frontend has @supabase/supabase-js@^2.99.0.

## Memory Drift

41. **project_edge_functions_deploy.md: Lists "12 Functions deployed"** but actual count is 16 + main. Missing: manage-project-memory, nextcloud-files, credit-topup, send-reminders.

42. **project_mbm_launch.md: Deadline 2026-03-24/25.** This is historical (launch already happened). The memory is not stale per se but should be marked as historical/completed.

43. **project_openrouter_review.md: "Codex CLI usage limit hit until 2026-03-27"** — this date has passed. The limit should have reset.

44. **MEMORY.md index: client-review-reminders.md and credit-system.md listed in git status as deleted.** Git status shows `D docs/ideas/client-review-reminders.md` and `D docs/ideas/credit-system.md`. These were deleted but the deletion is not staged. Need to verify if any memory or doc references these files.

The executor must:
1. Verify each finding above against the actual codebase
2. Search for any ADDITIONAL drift not listed above
3. Produce DRIFT-REPORT.md with a table: File | Line/Section | Issue | Severity (CRITICAL/HIGH/MEDIUM/LOW) | Fix Required
  </action>
  <verify>
    <automated>test -f ".planning/quick/260329-gkb-documentation-audit-verify-all-docs-and-/DRIFT-REPORT.md" && wc -l ".planning/quick/260329-gkb-documentation-audit-verify-all-docs-and-/DRIFT-REPORT.md" | grep -E "^[1-9][0-9]{2,}" && echo "PASS: drift report exists with 100+ lines"</automated>
  </verify>
  <done>DRIFT-REPORT.md exists with every inconsistency documented, categorized by severity, with specific fix instructions for each</done>
</task>

<task type="auto">
  <name>Task 2: Fix all documentation drift</name>
  <files>
    CLAUDE.md,
    docs/ARCHITECTURE.md,
    docs/system-context/DATABASE_SCHEMA.md,
    docs/system-context/SYSTEM_CONSTRAINTS.md,
    docs/system-context/TECH_CONTEXT.md,
    docs/planning/current-state-map.md,
    docs/planning/delivery-rules.md,
    docs/planning/product-gap-list.md,
    docs/planning/team-operating-model-v1.md
  </files>
  <action>
Using the DRIFT-REPORT.md produced in Task 1, fix every documented inconsistency. Process files in this priority order:

**CLAUDE.md (highest priority — this is the agent instruction file):**
- Update Stack section: remove "Lucide React", add "@hugeicons/react + @hugeicons/core-free-icons" and "@phosphor-icons/react". Add "sonner" for toasts. Keep "React Router v7" (package is react-router-dom v7.x which is React Router v7).
- Update Modules table: add Files module row (`src/modules/files/` | Nextcloud WebDAV via Edge Functions | Live).
- Update Project Structure tree to reflect actual directories:
  - `docs/ideas/` — list all 5 files, not just knowledge-base.md
  - `docs/audits/` — add directory
  - `src/modules/files/` — add with subdirectories
  - `src/shared/components/ui/` — list all 9 components
  - `src/shared/components/konto/` — add directory
  - `src/shared/components/inbox/` — add directory
  - `src/shared/hooks/` — add useSwipeGesture, useUpdateProfile
  - `src/shared/lib/` — add password-validation.ts, slugify.ts
  - `src/shared/pages/` — add as the actual location of HilfePage, InboxPage, KontoPage, LoginPage, MeineAufgabenPage, NotFoundPage, ProtectedRoute, routes
  - `src/modules/projects/hooks/` — update to match actual
  - `src/modules/projects/lib/` — add quick-action-helpers.ts
  - `src/modules/tickets/hooks/` — add useCreditHistory
  - `src/modules/tickets/lib/` — add task-list-utils.ts
  - `src/modules/tickets/components/` — add missing components
  - `scripts/` — add mbm-production.json, summerfield-production.json
- Fix ClickUp API skill path: change PORTAL_staging to PORTAL
- Update Edge Functions list: add credit-topup and send-reminders
- Update agents list: add designer.md
- Update skills: mention both clickup-api and shadcn-ui

**docs/ARCHITECTURE.md:**
- Update Edge Functions count from 15 to 16 (add send-reminders)

**docs/system-context/DATABASE_SCHEMA.md:**
- Update client_workspaces icon column description from "Lucide React" to "Hugeicons"
- Review cors.ts Lovable origins — note them as legacy if still functional

**docs/system-context/SYSTEM_CONSTRAINTS.md:**
- Remove or rewrite "Lovable remains generation tool" section entirely. Replace with accurate description of the current development model (Claude Code + agent team, Vite+React standalone project).
- Fix the `.lovable/` file path reference to point to the correct current file (STATUS_TRANSITION_MATRIX.md or CLAUDE.md status mapping).

**docs/system-context/TECH_CONTEXT.md:**
- Update email types list to include all types from emailCopy.ts
- Verify Supabase SDK pin version claim

**docs/planning/current-state-map.md:**
- Add a header note: "Historical document from March 2026 planning phase. PORTAL_staging references are stale — consolidated into PORTAL (ADR-022)."
- Update Section 3.4 Credits to reflect that credits ARE implemented (Phase 1 complete)

**docs/planning/delivery-rules.md:**
- Add a header note marking this as historical
- Update Section 1 Core Principle to reflect single-repo model
- Update Sections 6.1, 6.3 to remove PORTAL_staging references

**docs/planning/product-gap-list.md:**
- Update Section 3.4 Credits to reflect implementation status
- Update Section 7.1 staging surface to reflect consolidation

**docs/planning/team-operating-model-v1.md:**
- Update Sections 3.1 and 3.2 to reflect single-repo model
- Update Section 3.3 planning artifacts path

Do NOT modify: docs/SPEC.md (design tokens), docs/DECISIONS.md (ADR log is append-only), docs/CHANGELOG.md (will be updated in verification), docs/system-context/PRODUCT_VISION.md (directional doc, not a technical reference), docs/system-context/NOTIFICATION_MATRIX.md (verified accurate), docs/system-context/STATUS_TRANSITION_MATRIX.md (verified accurate).
  </action>
  <verify>
    <automated>cd "G:/01_OPUS/Projects/PORTAL" && grep -c "Lucide React" CLAUDE.md && echo "FAIL: Lucide React still in CLAUDE.md" || echo "PASS: Lucide React removed" && grep -c "PORTAL_staging" CLAUDE.md && echo "FAIL: PORTAL_staging still in CLAUDE.md" || echo "PASS: PORTAL_staging removed" && grep -c "send-reminders" docs/ARCHITECTURE.md && echo "PASS: send-reminders in ARCHITECTURE.md" || echo "FAIL: send-reminders missing" && grep -c "Lovable remains generation tool" docs/system-context/SYSTEM_CONSTRAINTS.md && echo "FAIL: stale Lovable section" || echo "PASS: Lovable section fixed"</automated>
  </verify>
  <done>All documentation files updated: CLAUDE.md project structure matches actual codebase, all PORTAL_staging references removed or annotated as historical, stale Lovable references removed, Edge Function lists complete, icon library references correct, module listings accurate</done>
</task>

<task type="auto">
  <name>Task 3: Fix stale memory files</name>
  <files>
    C:/Users/upan/.claude/projects/G--01-OPUS-Projects-PORTAL/memory/project_edge_functions_deploy.md,
    C:/Users/upan/.claude/projects/G--01-OPUS-Projects-PORTAL/memory/project_mbm_launch.md,
    C:/Users/upan/.claude/projects/G--01-OPUS-Projects-PORTAL/memory/project_openrouter_review.md,
    C:/Users/upan/.claude/projects/G--01-OPUS-Projects-PORTAL/memory/MEMORY.md
  </files>
  <action>
Update memory files that contain stale references:

**project_edge_functions_deploy.md:**
- Update "12 Functions deployed" to "16 Functions deployed + main router"
- Add the 4 missing functions: manage-project-memory, nextcloud-files, credit-topup, send-reminders
- Keep all other deployment instructions (they are still accurate)

**project_mbm_launch.md:**
- Add a note at the top: "HISTORICAL: MBM launched successfully on 2026-03-25. This memory records the original launch requirements for reference."
- Do NOT delete the content — it has archival value

**project_openrouter_review.md:**
- Remove the "Codex CLI usage limit hit until 2026-03-27" line since that date has passed
- Keep everything else (the OpenRouter review setup is still active)

**MEMORY.md:**
- Verify all referenced files exist on disk. If any were deleted, note it.
- Ensure the index accurately reflects actual memory file contents.
- Note: `client-review-reminders.md` and `credit-system.md` appear deleted from docs/ideas/ per git status — these are docs/ideas files NOT memory files, so MEMORY.md should not reference them. Verify MEMORY.md does not reference them.

Do NOT modify feedback_*.md files (these are user feedback records and should never be changed), user_profile.md, user_preferences.md, reference_*.md files.
  </action>
  <verify>
    <automated>grep -c "12 Functions" "C:/Users/upan/.claude/projects/G--01-OPUS-Projects-PORTAL/memory/project_edge_functions_deploy.md" && echo "FAIL: still says 12" || echo "PASS: function count updated"</automated>
  </verify>
  <done>Memory files updated: edge function count corrected, MBM launch marked as historical, Codex CLI stale date removed, MEMORY.md index verified</done>
</task>

</tasks>

<verification>
After all tasks complete:
1. `npm run build` passes (documentation changes should not break build, but verify)
2. Grep for "PORTAL_staging" in CLAUDE.md returns 0 matches
3. Grep for "Lucide React" in CLAUDE.md returns 0 matches
4. Grep for "Lovable remains" in docs/system-context/SYSTEM_CONSTRAINTS.md returns 0 matches
5. Edge Function count in ARCHITECTURE.md includes send-reminders
6. DRIFT-REPORT.md exists and documents all findings
</verification>

<success_criteria>
- DRIFT-REPORT.md produced with 40+ documented inconsistencies
- CLAUDE.md project structure tree matches actual codebase (verified by ls comparison)
- All PORTAL_staging references in CLAUDE.md and planning docs are either removed or annotated as historical
- Stale Lovable references removed from SYSTEM_CONSTRAINTS.md
- Icon library references updated from Lucide to Hugeicons/Phosphor
- Edge Function listings complete (16 + main)
- Memory files contain no provably false claims
- `npm run build` still passes
</success_criteria>

<output>
After completion, create `.planning/quick/260329-gkb-documentation-audit-verify-all-docs-and-/260329-gkb-SUMMARY.md`
</output>
