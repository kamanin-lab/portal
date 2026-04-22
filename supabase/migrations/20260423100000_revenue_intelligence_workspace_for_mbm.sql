-- Grant MBM org access to Revenue Intelligence module
-- POC scope: single client. Remove or generalize when rolling out more broadly.

INSERT INTO client_workspaces (organization_id, module_key, display_name, icon, sort_order, is_active)
SELECT id, 'revenue-intelligence', 'Umsatz-Intelligenz', 'chart-bar-increasing', 10, true
FROM organizations
WHERE slug = 'mbm-moebel'
ON CONFLICT (organization_id, module_key) DO NOTHING;
