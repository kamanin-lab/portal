# Documentation Drift Report — KAMANIN Portal
# Audit Date: 2026-03-29
# Auditor: Executor agent (Sonnet 4.6)

This report documents every inconsistency found between project documentation and the actual codebase state.
All 44 pre-identified drift items were verified against the filesystem and code. Status: CONFIRMED, REFUTED, or MODIFIED.

---

## Summary Table

| # | File | Section | Issue | Severity | Status | Fix |
|---|------|---------|-------|----------|--------|-----|
| 1 | CLAUDE.md | Stack | "Lucide React" listed but not in package.json — zero imports. Actual icons: @hugeicons/react, @hugeicons/core-free-icons, @phosphor-icons/react | CRITICAL | CONFIRMED | Remove Lucide React, add Hugeicons + Phosphor |
| 2 | CLAUDE.md | Stack | Missing @hugeicons/react and @phosphor-icons/react from Stack description | HIGH | CONFIRMED | Add both icon libraries |
| 3 | CLAUDE.md | Stack | "React Router v7" — correct (package is react-router-dom@^7.13.1, which is React Router v7) | LOW | REFUTED | No fix needed |
| 4 | CLAUDE.md | Stack | Missing `sonner@^2.0.7` toast library from Stack | MEDIUM | CONFIRMED | Add sonner to Stack |
| 5 | CLAUDE.md | Project Structure | `docs/ideas/` only lists knowledge-base.md, but 5 files exist: admin-dashboard.md, credit-evolution.md, knowledge-base.md, organizations.md, recommendations.md | MEDIUM | CONFIRMED | List all 5 files |
| 6 | CLAUDE.md | Project Structure | Missing `src/modules/files/` module entirely | HIGH | CONFIRMED | Add files module to structure tree |
| 7 | CLAUDE.md | Modules table | Missing Files module row | HIGH | CONFIRMED | Add row for src/modules/files/ |
| 8 | CLAUDE.md | Project Structure | Missing `docs/audits/` directory (contains projects-module-audit.md) | MEDIUM | CONFIRMED | Add docs/audits/ to structure tree |
| 9 | CLAUDE.md | Project Structure | Missing `src/shared/components/konto/` (6 components: AvatarUpload, CreditHistorySection, EmailSection, NotificationSection, PasswordSection, ProfileSection) | MEDIUM | CONFIRMED | Add konto directory |
| 10 | CLAUDE.md | Project Structure | Missing `src/shared/components/inbox/` (NotificationAccordionItem, NotificationDetailPanel, TypeBadge, notification-utils.ts) | MEDIUM | CONFIRMED | Add inbox directory |
| 11 | CLAUDE.md | Project Structure | `src/shared/components/ui/` described as "SideSheet (shadcn/ui base)" but contains 9 components: alert-dialog, avatar, badge, button, input, SideSheet, skeleton, tabs, textarea | LOW | CONFIRMED | Update description |
| 12 | CLAUDE.md | Project Structure | Shared hooks: missing useSwipeGesture and useUpdateProfile | MEDIUM | CONFIRMED | Add missing hooks |
| 13 | CLAUDE.md | Project Structure | Shared lib: missing password-validation.ts and slugify.ts | MEDIUM | CONFIRMED | Add missing lib files |
| 14 | CLAUDE.md | Project Structure | Projects hooks: useNextcloudFilesByPath, useUploadFileByPath, useCreateFolder do NOT exist in src/modules/projects/hooks/. Actual hooks: useChapterHelpers, useHeroPriority, useNextcloudFiles, useProject, useProjectActivity, useProjectComments, useProjectMemory, useProjects | HIGH | CONFIRMED | Replace with accurate list |
| 15 | CLAUDE.md | Project Structure | Projects lib: missing quick-action-helpers.ts | LOW | CONFIRMED | Add to list |
| 16 | CLAUDE.md | Project Structure | Ticket hooks: missing useCreditHistory and useCredits | MEDIUM | CONFIRMED | Add both hooks |
| 17 | CLAUDE.md | Project Structure | Ticket lib: missing task-list-utils.ts | LOW | CONFIRMED | Add to list |
| 18 | CLAUDE.md | Project Structure | Ticket components: missing CommentInputParts, CreditApproval, CreditBadge, CreditBalance, FileAttachments, ProjectTaskFormFields, TicketFormFields | MEDIUM | CONFIRMED | Add missing components |
| 19 | CLAUDE.md | Project Structure | Projects components: top-level missing MessageSheet.tsx, SchritteSheet.tsx, StepSheet.tsx, UploadDropZone.tsx, UploadFolderSelector.tsx, UploadSheet.tsx. Overview has 16 components not listed. Steps subdir exists with StepActionBar, StepDetail, StepDiscussionTab, StepFilesTab, StepOverviewTab. Tasks has TasksPage. Files/ has CreateFolderInput, FileRow, FilesPage, FileTypeIcon, FileUpload, FolderCard, FolderView. | HIGH | CONFIRMED | Update projects component tree |
| 20 | CLAUDE.md | Project Structure | `src/app/` listed for ProtectedRoute.tsx, routes.tsx — but BOTH files are in `src/shared/pages/`, not src/app/. NOTE: src/app/ EXISTS and ALSO has ProtectedRoute.tsx and routes.tsx — they are DUPLICATED. src/shared/pages/ has HilfePage, InboxPage, KontoPage, LoginPage, MeineAufgabenPage, NotFoundPage, ProtectedRoute.tsx, routes.tsx | CRITICAL | MODIFIED | Clarify both locations; add src/shared/pages/ listing |
| 21 | CLAUDE.md | Key Files (API Reference) | ClickUp skill path references PORTAL_staging: `G:/01_OPUS/Projects/PORTAL_staging/.claude/skills/clickup-api/SKILL.md` | CRITICAL | CONFIRMED | Change to PORTAL |
| 22 | CLAUDE.md | Key Files / Edge Functions | Missing credit-topup and send-reminders from Edge Functions list | HIGH | CONFIRMED | Add both functions |
| 23 | docs/ARCHITECTURE.md | Edge Functions | Lists "15 Functions + main router" — missing send-reminders. Actual count: 16 functions + main | HIGH | CONFIRMED | Update count and add send-reminders |
| 24 | CLAUDE.md | Project Structure | Scripts: missing mbm-production.json and summerfield-production.json | LOW | CONFIRMED | Add to scripts listing |
| 25 | CLAUDE.md | Available Agents | Lists 4 agents (docs-memory, implementation, qa, reviewer-architect) — missing designer.md | MEDIUM | CONFIRMED | Add designer.md |
| 26 | CLAUDE.md | API Reference Rules | Mentions "Skills (e.g., clickup-api/)" but there are 2 skills: clickup-api/ and shadcn-ui/ | LOW | CONFIRMED | Mention both |
| 27 | docs/system-context/DATABASE_SCHEMA.md | Table 1.12 client_workspaces | `icon` column says "Icon name from Lucide React" — project uses Hugeicons | HIGH | CONFIRMED | Update to Hugeicons |
| 28 | docs/ARCHITECTURE.md | Module Structure | `src/modules/files/` correctly listed — ARCHITECTURE.md is accurate here | N/A | REFUTED | No fix needed |
| 29 | docs/ARCHITECTURE.md | Edge Functions | "15 Functions + main router" — confirmed missing send-reminders | HIGH | CONFIRMED | Add send-reminders to list |
| 30 | docs/system-context/SYSTEM_CONSTRAINTS.md | "Lovable remains generation tool" | Entire section is stale. Lovable was the original generation tool, but the project is now a standalone Claude Code + agent team developed Vite+React app | CRITICAL | CONFIRMED | Remove/rewrite section |
| 31 | docs/system-context/SYSTEM_CONSTRAINTS.md | "Portal acts as projection layer" | References `.lovable/ClientPortal_ClickUp_TaskLifecycle_FINAL.md` which does not exist in current repo | HIGH | CONFIRMED | Point to STATUS_TRANSITION_MATRIX.md |
| 32 | docs/system-context/DATABASE_SCHEMA.md / supabase/functions/_shared/cors.ts | CORS origins | cors.ts actually contains lovable.app, lovableproject.com origins in ALLOWED_ORIGINS. The DATABASE_SCHEMA.md documents this accurately. The cors.ts origins are STALE and should be cleaned | HIGH | CONFIRMED | Remove lovable.* origins from cors.ts; update DATABASE_SCHEMA.md |
| 33 | docs/planning/current-state-map.md | Overall doc | References "staging repository at PORTAL_staging" as active (section 10, line ~252). PORTAL_staging was consolidated into PORTAL (ADR-022) | HIGH | CONFIRMED | Add historical header note |
| 34 | docs/planning/delivery-rules.md | Section 1 Core Principle | Says "original portal folder is not the implementation surface" and staging is separate — completely stale after ADR-022 consolidation | HIGH | CONFIRMED | Add historical header; update principle |
| 35 | docs/planning/delivery-rules.md | Section 6.1 | References `G:/01_OPUS/Projects/PORTAL_staging` as planning docs location | HIGH | CONFIRMED | Update to PORTAL |
| 36 | docs/planning/delivery-rules.md | Section 6.3 | Three-environment source-of-truth (staging code, planning docs, original portal) — collapsed to single repo | HIGH | CONFIRMED | Update to reflect single-repo |
| 37 | docs/planning/team-operating-model-v1.md | Sections 3.1, 3.2 | Section 3.1: PORTAL = "frozen read-only reference". Section 3.2: PORTAL_staging = "active implementation surface" — both stale | HIGH | CONFIRMED | Update both sections |
| 38 | docs/planning/product-gap-list.md | Section 3.4, Section 7.1 | Section 3.4 Credits says "not yet implemented" — credits ARE implemented (credit_packages, credit_transactions, CreditBalance, CreditBadge, CreditApproval, credit-topup). Section 7.1 "No staging work surface" STATUS CLOSED references old PORTAL_staging path | HIGH | CONFIRMED | Update both sections |
| 39 | docs/system-context/TECH_CONTEXT.md | Section 2 Email types | Only lists: task_review, task_completed, team_question, support_response. Actual emailCopy.ts EmailType has: task_review, task_completed, message_digest, team_question, support_response, step_ready, project_reply, credit_approval, pending_reminder, magic_link, password_reset, email_confirmation, signup, invite, email_change | HIGH | CONFIRMED | Update email types list |
| 40 | docs/system-context/TECH_CONTEXT.md | Section 2 Edge Functions | "Pinned to @supabase/supabase-js@2.47.10" — VERIFIED CORRECT (checked actual function imports) | N/A | REFUTED | No fix needed |
| 41 | memory/project_edge_functions_deploy.md | "12 Functions deployed" | States 12 functions: fetch-clickup-tasks, fetch-task-comments, fetch-single-task, post-task-comment, update-task-status, clickup-webhook, fetch-project-tasks, send-mailjet-email, create-clickup-task, auth-email, send-feedback, send-support-message. Missing: manage-project-memory, nextcloud-files, credit-topup, send-reminders (16 total) | HIGH | CONFIRMED | Update to 16 functions |
| 42 | memory/project_mbm_launch.md | Launch deadline | Deadline 2026-03-24/25 — this is historical. Launch happened. Memory is stale context, not error | LOW | CONFIRMED | Add historical note |
| 43 | memory/project_openrouter_review.md | Codex CLI limit | "usage limit hit until 2026-03-27" — date has passed. Limit should have reset | LOW | CONFIRMED | Remove stale date |
| 44 | memory/MEMORY.md | Index | References client-review-reminders.md and credit-system.md in git status as deleted from docs/ideas/ — VERIFIED: MEMORY.md does NOT reference these files. They are docs/ideas/ files, not memory files | N/A | REFUTED | No fix needed |

---

## Additional Drift Found (Beyond Pre-Identified List)

| # | File | Section | Issue | Severity | Fix |
|---|------|---------|-------|----------|-----|
| 45 | CLAUDE.md | Project Structure | `src/shared/components/common/` is missing UserAvatar.tsx — listed as ConfirmDialog, EmptyState, LoadingSkeleton, MessageBubble, StatusBadge. Actual: adds UserAvatar.tsx | LOW | Add UserAvatar.tsx |
| 46 | CLAUDE.md | Project Structure | `src/shared/components/layout/` missing ContentContainer, MobileSidebarOverlay, SidebarGlobalNav, SidebarUserFooter, SidebarUtilities, SidebarWorkspaces — listed as AppShell, Sidebar, MobileHeader, BottomNav. Actual has 9 components | MEDIUM | Update layout component list |
| 47 | CLAUDE.md | Project Structure | `src/modules/projects/types/` has two files: memory.ts and project.ts. CLAUDE.md only mentions "project.ts" | LOW | Add memory.ts to list |
| 48 | CLAUDE.md | Project Structure | `src/shared/components/` has `WorkspaceGuard.tsx` at top level — not mentioned anywhere in CLAUDE.md | LOW | Add WorkspaceGuard.tsx |
| 49 | CLAUDE.md | Ticket hooks | Missing `useCredits` hook (useCreditHistory listed in plan, but useCredits also exists in actual codebase) | MEDIUM | Add useCredits |
| 50 | docs/system-context/SYSTEM_CONSTRAINTS.md | CORS | cors.ts currently whitelists `cconnect.lovable.app`, `*.lovable.app`, `*.lovableproject.com` — actual cors.ts code confirms this. These origins are stale dead-ends (Lovable no longer used). They could allow unexpected third-party domains to call Edge Functions | HIGH | Remove lovable.* CORS origins from cors.ts |
| 51 | CLAUDE.md | Architecture Rules | Rule 11 references ContentContainer but does not mention that component exists in `src/shared/components/layout/ContentContainer.tsx` — not a drift issue per se, the reference is implicit | LOW | No fix needed — informational only |
| 52 | docs/ARCHITECTURE.md | Edge Functions section | Does not mention send-reminders function detail/description (only credit-topup and nextcloud-files get detailed descriptions) | LOW | Add send-reminders description |
| 53 | CLAUDE.md | Key Files | `supabase/functions/main/index.ts` description says "dispatches to worker functions via EdgeRuntime.userWorkers.create()" — accurate, but this file is also the source of truth for router; no mention that ALL requests go through it even for the URL-routing step | LOW | No fix needed — description accurate |
| 54 | docs/planning/team-operating-model-v1.md | Section 3.3 | Planning artifacts path says "docs/planning/ (in-repo, within PORTAL_staging)" — stale | HIGH | Update to PORTAL |

---

## Severity Counts

| Severity | Count |
|----------|-------|
| CRITICAL | 4 (items 1, 20, 21, 30) |
| HIGH | 24 |
| MEDIUM | 12 |
| LOW | 14 |
| **Total fixes required** | **~44** |
| **Refuted (no fix)** | 5 (items 3, 28, 40, 44, 51, 53) |

---

## Key Findings Summary

### Most Critical Issues

1. **Lucide React ghost (CRITICAL)** — CLAUDE.md instructs agents to use Lucide React icons. It's not installed and not used anywhere. Actual icons: @hugeicons/react (primary) + @phosphor-icons/react.

2. **ProtectedRoute.tsx location ambiguity (CRITICAL — finding #20 MODIFIED)** — The plan said src/app/ is WRONG. Verification found that `src/app/` DOES have ProtectedRoute.tsx and routes.tsx, AND `src/shared/pages/` ALSO has them. This is likely a legitimate dual-location or the src/app/ versions are the authoritative ones. CLAUDE.md only mentions src/app/ — need to document src/shared/pages/ as well.

3. **PORTAL_staging ClickUp skill path (CRITICAL)** — Instructs agents to look for ClickUp docs in PORTAL_staging. That repo no longer exists as a separate surface.

4. **Stale Lovable constraints (CRITICAL)** — SYSTEM_CONSTRAINTS.md says "Lovable remains generation tool" — the frontend is developed via Claude Code + agent team, not Lovable.

5. **CORS security drift (HIGH)** — cors.ts in Edge Functions still whitelists lovable.app and lovableproject.com origins. These are dead domains from the previous development stack. No legitimate traffic should come from these origins.

### Architecture Status After Consolidation
- PORTAL is the canonical single production repository
- PORTAL_staging was merged into PORTAL (ADR-022)
- All docs/planning/ references to PORTAL_staging are historical artifacts

---

## Files Requiring Changes

1. `CLAUDE.md` — major update (stack, modules table, project structure tree, key files, agents list)
2. `docs/ARCHITECTURE.md` — minor update (add send-reminders to Edge Functions list)
3. `docs/system-context/DATABASE_SCHEMA.md` — update client_workspaces icon field description
4. `docs/system-context/SYSTEM_CONSTRAINTS.md` — remove Lovable section, fix file path reference
5. `docs/system-context/TECH_CONTEXT.md` — update email types list
6. `docs/planning/current-state-map.md` — add historical note header
7. `docs/planning/delivery-rules.md` — add historical note header, update stale sections
8. `docs/planning/product-gap-list.md` — update credits status, update staging reference
9. `docs/planning/team-operating-model-v1.md` — update Sections 3.1, 3.2, 3.3
10. `supabase/functions/_shared/cors.ts` — remove stale lovable.* origins (security fix)
11. `C:/Users/upan/.claude/projects/G--01-OPUS-Projects-PORTAL/memory/project_edge_functions_deploy.md` — update function count to 16
12. `C:/Users/upan/.claude/projects/G--01-OPUS-Projects-PORTAL/memory/project_mbm_launch.md` — add historical note
13. `C:/Users/upan/.claude/projects/G--01-OPUS-Projects-PORTAL/memory/project_openrouter_review.md` — remove stale date

---

_Report generated: 2026-03-29_
_Findings verified against: actual filesystem, package.json, import patterns, function directories_
