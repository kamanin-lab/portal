-- Grant Yuri Kamanin's org (kamanin@gmx.at) access to Revenue Intelligence module
-- POC scope: extends the previous MBM-only grant for internal testing.
-- Resolves org via email -> profiles -> org_members rather than slug guessing,
-- so this works regardless of the org's slug value.

INSERT INTO client_workspaces (organization_id, module_key, display_name, icon, sort_order, is_active)
SELECT DISTINCT om.organization_id,
       'revenue-intelligence',
       'Umsatz-Intelligenz',
       'chart-bar-increasing',
       10,
       true
FROM org_members om
JOIN profiles p ON p.id = om.profile_id
WHERE p.email = 'kamanin@gmx.at'
ON CONFLICT (organization_id, module_key) DO NOTHING;
