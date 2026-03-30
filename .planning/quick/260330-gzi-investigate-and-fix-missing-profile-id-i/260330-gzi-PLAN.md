---
phase: quick
plan: 260330-gzi
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: false
requirements: []

must_haves:
  truths:
    - "nadin.bonin@mbm-moebel.de sees all her tasks in the portal (task_cache rows have correct profile_id matching her current auth UUID)"
    - "nadin.bonin@mbm-moebel.de sees all comments with correct author attribution (comment_cache.author_email populated for her portal-originated comments)"
    - "New tasks and comments created for/by this user get the correct profile_id going forward"
    - "Webhook-driven updates (status changes, new comments) resolve to the correct profile_id"
  artifacts:
    - path: "SQL statements executed against Supabase"
      provides: "Data migration fixing profile_id across task_cache, comment_cache, notifications, support_messages, read_receipts"
  key_links:
    - from: "profiles.id"
      to: "task_cache.profile_id"
      via: "FK relationship — must match auth.users.id"
      pattern: "profile_id = auth.uid()"
    - from: "profiles.id"
      to: "comment_cache.profile_id"
      via: "FK relationship — must match auth.users.id"
      pattern: "profile_id = auth.uid()"
---

<objective>
Fix missing/wrong profile_id in task_cache and missing author_email in comment_cache for nadin.bonin@mbm-moebel.de.

Purpose: User was migrated/recreated during database move, causing auth UUID mismatch. Old cache rows reference the old UUID, RLS blocks the user from seeing their own data, and new records may also fail if the profile lookup chain is broken.

Output: All existing rows updated to correct UUID, user can see all their tasks and comments, new records work correctly.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@docs/system-context/DATABASE_SCHEMA.md
@supabase/functions/fetch-clickup-tasks/index.ts
@supabase/functions/fetch-task-comments/index.ts
@supabase/functions/post-task-comment/index.ts
@supabase/functions/clickup-webhook/index.ts

<interfaces>
Key data flow for profile_id:

1. fetch-clickup-tasks (line 528): `profile_id: user.id` — sets task_cache.profile_id from authenticated user's Supabase auth UUID
2. fetch-task-comments (line 338): `profile_id: userId` — sets comment_cache.profile_id from authenticated user
3. post-task-comment (line 469-474): `profile_id: userId, author_email: userEmail` — sets both fields from auth user
4. clickup-webhook findProfilesForTask (line 357-360): resolves profile_id FROM task_cache (`SELECT profile_id FROM task_cache WHERE clickup_id = taskId`) — if task_cache has wrong UUID, webhook perpetuates the error
5. profiles table: `id` column = auth.users.id (PK + FK), `email` column stores the email
6. RLS on all tables: `profile_id = auth.uid()` — wrong UUID = invisible rows

Tables affected by profile_id:
- task_cache (clickup_id, profile_id) UNIQUE
- comment_cache (clickup_comment_id, profile_id) UNIQUE
- notifications
- support_messages
- read_receipts (NOTE: confirm actual table name in Step 1 — DATABASE_SCHEMA.md says 'read_receipts', code may reference 'task_read_receipts')
- client_workspaces (profile_id, module_key) UNIQUE
- credit_packages
- credit_transactions
- project_access (profile_id, project_config_id) UNIQUE
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Diagnose UUID mismatch and fix all data</name>
  <files>SQL executed via Supabase admin API or psql</files>
  <action>
This is a database investigation and data fix task. Execute SQL against Supabase using the service role key.

**Step 1: Diagnose the mismatch**

Run diagnostic queries to find:
a) The CURRENT auth user UUID for nadin.bonin@mbm-moebel.de:
   ```sql
   SELECT id, email, created_at FROM auth.users WHERE email = 'nadin.bonin@mbm-moebel.de';
   ```

b) The CURRENT profile row:
   ```sql
   SELECT id, email, full_name, company_name, clickup_list_ids FROM profiles WHERE email = 'nadin.bonin@mbm-moebel.de';
   ```

c) Any OLD profile_id references in task_cache (rows the user SHOULD see but can't due to UUID mismatch):
   ```sql
   -- Find task_cache rows that reference this user's email in raw_data but have a different profile_id
   SELECT DISTINCT profile_id, COUNT(*) as task_count
   FROM task_cache
   WHERE raw_data::text LIKE '%nadin.bonin%' OR raw_data::text LIKE '%mbm%'
   GROUP BY profile_id;
   ```

d) Check comment_cache for the same pattern:
   ```sql
   SELECT DISTINCT profile_id, COUNT(*) as comment_count,
     COUNT(CASE WHEN author_email IS NULL OR author_email = '' THEN 1 END) as missing_email
   FROM comment_cache
   WHERE comment_text LIKE '%nadin%' OR comment_text LIKE '%Nadin%' OR profile_id IN (
     SELECT DISTINCT profile_id FROM task_cache WHERE raw_data::text LIKE '%nadin.bonin%'
   )
   GROUP BY profile_id;
   ```

e) Check if there is an orphaned OLD profile row (profile exists but auth user doesn't):
   ```sql
   SELECT p.id, p.email FROM profiles p
   LEFT JOIN auth.users u ON p.id = u.id
   WHERE p.email = 'nadin.bonin@mbm-moebel.de' OR p.email LIKE '%nadin%';
   ```

f) Confirm the actual table name for read receipts (DATABASE_SCHEMA.md says 'read_receipts' but code may use 'task_read_receipts'):
   ```sql
   SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%receipt%';
   ```

**Step 2: Determine the fix**

Based on diagnostics, there are two possible scenarios:

**Scenario A: Old UUID exists in cache, new UUID exists in profiles/auth**
- The old profile row may or may not exist
- Need to UPDATE all cache tables from old_uuid to new_uuid

**Scenario B: Profile row missing entirely (auth user exists but no profile)**
- Need to CREATE the profile row
- Then run fetch-clickup-tasks to populate task_cache

**Step 3: Execute the fix**

For Scenario A (most likely):
```sql
-- Set variables (replace with actual UUIDs from diagnosis)
-- OLD_UUID = the profile_id found in task_cache
-- NEW_UUID = the current auth.users.id

BEGIN;

-- 1. Update task_cache
UPDATE task_cache SET profile_id = 'NEW_UUID' WHERE profile_id = 'OLD_UUID';

-- 2. Update comment_cache
UPDATE comment_cache SET profile_id = 'NEW_UUID' WHERE profile_id = 'OLD_UUID';

-- 3. Fix author_email on portal-originated comments for this user
UPDATE comment_cache
SET author_email = 'nadin.bonin@mbm-moebel.de'
WHERE profile_id = 'NEW_UUID'
  AND is_from_portal = true
  AND (author_email IS NULL OR author_email = '');

-- 4. Update notifications
UPDATE notifications SET profile_id = 'NEW_UUID' WHERE profile_id = 'OLD_UUID';

-- 5. Update support_messages
UPDATE support_messages SET profile_id = 'NEW_UUID' WHERE profile_id = 'OLD_UUID';

-- 6. Update read receipts (handle unique constraint)
-- NOTE: Use the table name confirmed in Step 1f (either 'read_receipts' or 'task_read_receipts').
-- Replace READ_RECEIPTS_TABLE below with the actual table name from the diagnostic query.
DELETE FROM READ_RECEIPTS_TABLE WHERE profile_id = 'OLD_UUID'
  AND task_id IN (SELECT task_id FROM READ_RECEIPTS_TABLE WHERE profile_id = 'NEW_UUID');
UPDATE READ_RECEIPTS_TABLE SET profile_id = 'NEW_UUID' WHERE profile_id = 'OLD_UUID';

-- 7. Update client_workspaces (handle unique constraint)
DELETE FROM client_workspaces WHERE profile_id = 'OLD_UUID'
  AND module_key IN (SELECT module_key FROM client_workspaces WHERE profile_id = 'NEW_UUID');
UPDATE client_workspaces SET profile_id = 'NEW_UUID' WHERE profile_id = 'OLD_UUID';

-- 8. Update credit_packages
UPDATE credit_packages SET profile_id = 'NEW_UUID' WHERE profile_id = 'OLD_UUID';

-- 9. Update credit_transactions
UPDATE credit_transactions SET profile_id = 'NEW_UUID' WHERE profile_id = 'OLD_UUID';

-- 10. Update project_access (handle unique constraint)
DELETE FROM project_access WHERE profile_id = 'OLD_UUID'
  AND project_config_id IN (SELECT project_config_id FROM project_access WHERE profile_id = 'NEW_UUID');
UPDATE project_access SET profile_id = 'NEW_UUID' WHERE profile_id = 'OLD_UUID';

-- 11. Delete orphaned old profile row if it exists
DELETE FROM profiles WHERE id = 'OLD_UUID' AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = 'OLD_UUID');

COMMIT;
```

**Step 4: Verify the fix**

```sql
-- Verify task_cache has correct profile_id
SELECT COUNT(*) as tasks_visible FROM task_cache WHERE profile_id = 'NEW_UUID';

-- Verify no orphaned rows remain
SELECT COUNT(*) as orphaned FROM task_cache WHERE profile_id = 'OLD_UUID';

-- Verify comment_cache author_email
SELECT clickup_comment_id, author_email, is_from_portal
FROM comment_cache
WHERE profile_id = 'NEW_UUID' AND is_from_portal = true
LIMIT 5;

-- Verify profile exists with correct data
SELECT id, email, full_name, clickup_list_ids FROM profiles WHERE id = 'NEW_UUID';
```

**Step 5: Trigger a fresh sync**

After fixing the data, trigger fetch-clickup-tasks for this user to ensure fresh data:
- Sign in as the user (or use admin API) and call the fetch-clickup-tasks endpoint
- This will upsert with the correct profile_id going forward

IMPORTANT: All SQL must be executed via the Supabase SQL endpoint using the service role key, since we need to access auth.users and bypass RLS. Use the reference in reference_supabase_access.md for connection details.
  </action>
  <verify>
    <automated>Run verification SQL: SELECT COUNT(*) FROM task_cache WHERE profile_id = (SELECT id FROM auth.users WHERE email = 'nadin.bonin@mbm-moebel.de') should return > 0, AND SELECT COUNT(*) FROM comment_cache WHERE profile_id = (SELECT id FROM auth.users WHERE email = 'nadin.bonin@mbm-moebel.de') AND is_from_portal = true AND (author_email IS NULL OR author_email = '') should return 0</automated>
  </verify>
  <done>All task_cache rows for nadin.bonin have the correct profile_id matching her current auth UUID. All comment_cache portal-originated comments have author_email populated. No orphaned rows with old UUID remain.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Verify user can see all data in portal</name>
  <files>N/A</files>
  <action>
What was built: Fixed profile_id UUID mismatch for nadin.bonin@mbm-moebel.de across all database tables. Updated task_cache, comment_cache, notifications, and all related tables to use the correct auth UUID.

How to verify:
1. Log into portal.kamanin.at as nadin.bonin@mbm-moebel.de
2. Navigate to Aufgaben (Tasks) — verify all tasks are visible (not empty)
3. Open any task and check comments — verify comments show correct author names
4. Post a new comment on any task — verify it appears with correct author attribution
5. Check that notifications bell shows notifications (if any exist)
6. If the user has project access, navigate to Projekte and verify project data loads

Resume signal: Type "approved" if the user sees all their data correctly, or describe what is still broken.
  </action>
  <verify>Manual verification by logging into the portal as the affected user</verify>
  <done>User nadin.bonin@mbm-moebel.de can see all tasks, comments display correct authors, new comments work correctly</done>
</task>

</tasks>

<verification>
- task_cache: All rows for nadin.bonin have profile_id = current auth.users.id
- comment_cache: All rows for nadin.bonin have profile_id = current auth.users.id AND portal-originated comments have author_email set
- profiles: Exactly one profile row exists for nadin.bonin with id = auth.users.id
- No orphaned data remains with old UUID
- RLS works: user can see their own data when logged in
</verification>

<success_criteria>
- nadin.bonin@mbm-moebel.de can log in and see all tasks
- Comments display with correct author names and emails
- New tasks/comments created going forward get the correct profile_id
- No data loss — all historical records preserved with corrected UUID
</success_criteria>

<output>
After completion, create `.planning/quick/260330-gzi-investigate-and-fix-missing-profile-id-i/260330-gzi-SUMMARY.md`
</output>
