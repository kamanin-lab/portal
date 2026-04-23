-- Add unique constraint (organization_id, module_key) on client_workspaces
-- DATABASE_SCHEMA.md:296 already documents this constraint but it was never
-- actually created in DDL. Required for ON CONFLICT upserts in the revenue-intelligence
-- migrations that follow this one.
--
-- Safe to run: if duplicate (organization_id, module_key) rows already existed
-- the ADD CONSTRAINT would fail. We guard with a NOT EXISTS check to keep it idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_workspaces_organization_id_module_key_key'
      AND conrelid = 'public.client_workspaces'::regclass
  ) THEN
    ALTER TABLE public.client_workspaces
      ADD CONSTRAINT client_workspaces_organization_id_module_key_key
      UNIQUE (organization_id, module_key);
  END IF;
END$$;
