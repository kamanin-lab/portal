-- Migration: create agent_jobs table for KAMANDA Triage Agent v1
-- Phase 6: Triage Agent

create table public.agent_jobs (
  id                uuid primary key default gen_random_uuid(),
  clickup_task_id   text not null,
  clickup_task_name text,
  profile_id        uuid references public.profiles(id) on delete set null,
  job_type          text not null default 'triage',

  -- Status flow: pending → running → awaiting_hitl → approved | rejected | failed
  status            text not null default 'pending'
    check (status in ('pending','running','awaiting_hitl','approved','rejected','failed')),

  -- Input snapshot
  input             jsonb not null default '{}',

  -- Output from Claude
  output            jsonb,

  -- HITL fields — filled when developer responds in ClickUp
  hitl_action       text check (hitl_action in ('approved','rejected')),
  hitl_hours        numeric(5,1),
  hitl_credits      numeric(5,1),
  hitl_comment      text,
  hitl_at           timestamptz,

  -- Observability
  model_used        text default 'anthropic/claude-haiku-4-5',
  cost_usd          numeric(10,6),
  duration_ms       integer,
  error_message     text,
  clickup_comment_id text,
  audit_fetched     boolean not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.agent_jobs enable row level security;

-- Service role only — no client-facing access
create policy "Service role full access"
  on public.agent_jobs
  using (true)
  with check (true);

create index agent_jobs_clickup_task_id_idx on public.agent_jobs(clickup_task_id);
create index agent_jobs_status_idx on public.agent_jobs(status);
create index agent_jobs_created_at_idx on public.agent_jobs(created_at desc);

-- set_updated_at: safe to re-create (CONTEXT.md decision: set_updated_at does NOT yet exist)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger agent_jobs_updated_at
  before update on public.agent_jobs
  for each row execute function public.set_updated_at();

-- Add wp_mcp_url to profiles if not already present (CONTEXT.md: idempotent)
alter table public.profiles
  add column if not exists wp_mcp_url text;

comment on column public.profiles.wp_mcp_url is
  'Base URL of the WordPress site with Maxi AI Core installed (no trailing slash).
   Example: https://staging.client-site.com
   NULL = site audit disabled for this client.';
