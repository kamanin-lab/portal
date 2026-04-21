-- Optimization: let the frontend distinguish "cache not populated yet" from
-- "cache populated but RLS filtered everything out". Without this, a scoped
-- member (e.g. Marvin with departments=[SEO] but no SEO-tagged tickets yet)
-- triggers a 10-15s Edge Function sync on every visit because the visible view
-- returns 0 rows and the hook assumes first-time fetch is needed.
--
-- SECURITY DEFINER + narrow return (boolean only, no row data) — safe.

CREATE OR REPLACE FUNCTION has_raw_task_cache_rows() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM task_cache
    WHERE profile_id = auth.uid()
      AND is_visible = true
  );
$$;

COMMENT ON FUNCTION has_raw_task_cache_rows IS 'Returns TRUE if task_cache has any is_visible row for the current user, bypassing the department RLS filter. Used by the frontend to skip the slow fetch-clickup-tasks sync when the user is simply scoped out of all cached tasks.';

GRANT EXECUTE ON FUNCTION has_raw_task_cache_rows() TO authenticated;
