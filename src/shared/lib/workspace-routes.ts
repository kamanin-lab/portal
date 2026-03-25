export const WORKSPACE_ROUTES: Record<string, string> = {
  tickets: '/tickets',
  support: '/support',
  projects: '/projekte',
  files: '/dateien',
}

export const WORKSPACE_CHILDREN: Record<
  string,
  Array<{ path: string; label: string; icon: string }>
> = {
  tickets: [],
  support: [],
  projects: [],
  files: [],
}

export function getWorkspaceRoute(moduleKey: string): string {
  return WORKSPACE_ROUTES[moduleKey] ?? '/'
}
