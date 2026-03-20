create extension if not exists pgcrypto;

create table if not exists public.project_memory_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid null references public.project_config(id) on delete cascade,
  scope text not null check (scope in ('client', 'project')),
  category text not null check (category in (
    'profile',
    'communication',
    'technical_constraint',
    'delivery_constraint',
    'decision',
    'risk',
    'commercial_context'
  )),
  title text not null,
  body text not null,
  visibility text not null default 'internal' check (visibility in ('internal', 'shared', 'client_visible')),
  status text not null default 'active' check (status in ('active', 'archived')),
  source_type text not null default 'manual' check (source_type in ('manual')),
  source_ref text null,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  constraint project_memory_scope_project_check check (
    (scope = 'client' and project_id is null) or
    (scope = 'project' and project_id is not null)
  )
);

create index if not exists idx_project_memory_entries_client_active
  on public.project_memory_entries (client_id, updated_at desc)
  where status = 'active';

create index if not exists idx_project_memory_entries_project_active
  on public.project_memory_entries (project_id, updated_at desc)
  where status = 'active' and project_id is not null;

alter table public.project_memory_entries enable row level security;

create policy "project memory readable by client or project access"
  on public.project_memory_entries
  for select
  using (
    client_id = auth.uid()
    or (
      project_id is not null
      and project_id in (
        select pa.project_config_id
        from public.project_access pa
        where pa.profile_id = auth.uid()
      )
    )
  );

create policy "project memory writable only by service role"
  on public.project_memory_entries
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
