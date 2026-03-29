-- Phase 3: Add change detection columns to step_enrichment
-- content_hash: SHA-256 truncated hash of task name+description for change detection
-- last_enriched_at: Timestamp of last AI enrichment generation

ALTER TABLE "public"."step_enrichment"
  ADD COLUMN IF NOT EXISTS "content_hash" text,
  ADD COLUMN IF NOT EXISTS "last_enriched_at" timestamptz;

-- No backfill needed: NULL content_hash treated as "needs re-enrichment" on next sync
-- Existing rows get content_hash populated automatically on next sync cycle
