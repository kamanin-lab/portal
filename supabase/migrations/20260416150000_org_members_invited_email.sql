-- Migration: add invited_email to org_members
-- Stores the email address at time of invite so it can be displayed in the
-- Team section even before the invited user accepts and is visible via profiles RLS.

alter table public.org_members
  add column if not exists invited_email text;

comment on column public.org_members.invited_email is
  'Email address used at invite time. Displayed in Team list for pending members whose profile may not yet be visible via RLS.';
