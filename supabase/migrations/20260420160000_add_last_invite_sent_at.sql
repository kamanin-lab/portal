ALTER TABLE public.org_members
  ADD COLUMN IF NOT EXISTS last_invite_sent_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.org_members.last_invite_sent_at
  IS 'Timestamp of last invite email sent (60s cooldown enforced by resend-invite Edge Function).';
