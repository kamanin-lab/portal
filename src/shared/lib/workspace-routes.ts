export const WORKSPACE_ROUTES: Record<string, string> = {
  tickets: '/tickets',
  support: '/support',
  projects: '/projekte',
  files: '/dateien',
  'revenue-intelligence': '/revenue',
}

export const WORKSPACE_CHILDREN: Record<
  string,
  Array<{ path: string; label: string; icon: string }>
> = {
  tickets: [],
  support: [],
  projects: [],
  files: [],
  'revenue-intelligence': [],
}

export function getWorkspaceRoute(moduleKey: string): string {
  return WORKSPACE_ROUTES[moduleKey] ?? '/'
}
