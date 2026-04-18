-- Migration: add last_weekly_summary_sent_at for weekly summary email cooldown
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_weekly_summary_sent_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.profiles.last_weekly_summary_sent_at
  IS 'Timestamp of last weekly summary email (6-day cooldown, sent Monday 09:00 CET to org admins)';
