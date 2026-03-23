# TASK-012: Project Email Notifications — Implementation Plan

## 4 Gaps to Fix

### Gap 1: Missing `step_ready` email template

**File:** `supabase/functions/send-mailjet-email/index.ts`
- Add `case "step_ready":` in the template switch
- Template similar to `task_review` but for project steps
- Subject: `${stepName} ist bereit für Ihre Prüfung`
- Body: German text explaining the step is ready for review, with CTA button

### Gap 2: Missing `project_reply` email template

**File:** `supabase/functions/send-mailjet-email/index.ts`
- Add `case "project_reply":` in the template switch
- Template similar to `team_question` but for project context
- Subject: `Neue Nachricht zu ${stepName}`
- Body: German text showing the comment text, with CTA to open step

### Gap 3: No project completion email

**File:** `supabase/functions/clickup-webhook/index.ts`
- In the project `taskStatusUpdated` handler (lines 614-665)
- Add a check for completion status (`COMPLETE`, `DONE`, `APPROVED`)
- When detected: insert notification + send `task_completed` email (reuse existing template)

### Gap 4: No project work-started bell notification

**File:** `supabase/functions/clickup-webhook/index.ts`
- In the project `taskStatusUpdated` handler
- Add check for `IN PROGRESS` status
- When detected: insert bell notification (no email, per NOTIFICATION_MATRIX.md)
- Title: `Arbeit an ${stepName} hat begonnen`

## Files to modify
1. `supabase/functions/send-mailjet-email/index.ts` — add 2 templates
2. `supabase/functions/clickup-webhook/index.ts` — add completion + work-started handlers
3. Read `supabase/functions/_shared/emailCopy.ts` if email copy helpers exist

## Commit: single commit with all 4 fixes

## Verification
- Change project task status to CLIENT REVIEW in ClickUp → email sent
- Comment on project task in ClickUp → email sent
- Change project task to COMPLETE → email sent
- Change project task to IN PROGRESS → bell notification (no email)
