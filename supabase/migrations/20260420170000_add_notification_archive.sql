-- Add archived_at column to notifications for auto-archive functionality.
-- Read notifications older than 30 days will be archived (archived_at set).
-- Archived notifications older than 90 days will be hard-deleted.
-- Frontend filters on archived_at IS NULL to hide archived from bell dropdown.

ALTER TABLE notifications ADD COLUMN archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_notifications_archive
  ON notifications (created_at, is_read, archived_at)
  WHERE archived_at IS NULL;
