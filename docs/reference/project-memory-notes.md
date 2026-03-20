# Project Memory Notes

## Stable client identity used in this batch

`project_memory_entries.client_id` still stores a `profiles.id`, because the current staging architecture does not yet have a true shared company/account entity for portal memory.

## Narrow interpretation shipped in this pass

Instead of keying memory to the *currently signed-in* profile, the runtime now resolves a **project-anchored primary portal profile**:

1. if the project already has memory rows, reuse the earliest row's `client_id`
2. otherwise fall back to the earliest `project_access.profile_id` for that project

That gives the feature one stable anchor per project path and avoids splitting memory by whichever viewer happened to be logged in when reading or writing.

## Remaining limitation

This is still **not** a true shared account/client memory model.

So the current Batch 1 interpretation is:
- durable memory is shared per project and per anchored portal profile
- client-scope entries are shared only when multiple projects resolve to the same anchored profile
- a proper account-wide client memory layer still requires a dedicated shared client/account table and projects pointing to it

That gap is explicit and intentional in this batch; it is not silently treated as solved.

## Internal/operator authoring path

Client-facing project surfaces remain read-only.

Create/edit/archive now runs through the `manage-project-memory` Supabase Edge Function, which:
- requires a valid authenticated user session
- requires project access for the target project
- requires the authenticated email to be allow-listed in `PROJECT_MEMORY_OPERATOR_EMAILS`
- writes with service-role privileges instead of browser anon credentials

Frontend visibility for the operator panel is controlled by:
- `VITE_MEMORY_OPERATOR_EMAILS` — comma-separated allow-list for staging/internal operator accounts

Backend enforcement is controlled by:
- `PROJECT_MEMORY_OPERATOR_EMAILS` — matching comma-separated allow-list on the Supabase Edge Function side

## Deployment / verification requirement

This slice is only runtime-functional when **both** are true:

1. migration `supabase/migrations/20260320_project_memory_entries.sql` is applied in the target Supabase project
2. Edge Function `manage-project-memory` is deployed with `PROJECT_MEMORY_OPERATOR_EMAILS` configured

Without those deployment steps, browser verification of authoring is not meaningful.
