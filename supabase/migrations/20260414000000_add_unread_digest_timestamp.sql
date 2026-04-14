-- Migration: add last_unread_digest_sent_at for daily unread message digest cooldown
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_unread_digest_sent_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.profiles.last_unread_digest_sent_at
  IS 'Timestamp of last unread message digest email (24h cooldown)';
