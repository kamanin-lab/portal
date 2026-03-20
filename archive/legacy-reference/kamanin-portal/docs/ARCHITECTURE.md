# KAMANIN Portal — Architecture

## Data Flow

```
Browser → Supabase Auth → profiles table
Browser → React Query → task_cache (Supabase)
Browser → React Query → comment_cache (Supabase)
Browser → Supabase Realtime → live updates
Browser → Edge Functions → ClickUp API (proxied)
ClickUp Webhook → Edge Function → task_cache update
```

## Key Constraints
- UI reads ONLY from cache tables (task_cache, comment_cache)
- ClickUp API never called from browser
- RLS on all tables — profile_id filter
- Realtime subscriptions debounced 300ms, fallback 30s polling

## Module Structure
- `src/shared/` — auth, layout, hooks, lib, types
- `src/modules/projects/` — Project Experience (mock data → Supabase)
- `src/modules/tasks/` — Tasks/Support (live Supabase)
- `src/app/` — routing, providers

## Auth
Supabase Auth — email/password + magic link
Profile auto-created via `on_auth_user_created` trigger on `auth.users`

## Supabase
- URL: https://portal.db.kamanin.at
- Project: self-hosted (PostgreSQL 15.8)
- Tables: profiles, task_cache, comment_cache, notifications, read_receipts
