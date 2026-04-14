-- Migration: add last_recommendation_reminder_sent_at for recommendation reminder cooldown
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_recommendation_reminder_sent_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.profiles.last_recommendation_reminder_sent_at
  IS 'Timestamp of last recommendation reminder email (5-day cooldown)';
