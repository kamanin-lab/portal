export const WORKSPACE_ROUTES: Record<string, string> = {
  tickets: '/tickets',
  projects: '/projekte',
}

export const WORKSPACE_CHILDREN: Record<
  string,
  Array<{ path: string; label: string; icon: string }>
> = {
  tickets: [
    { path: '/tickets', label: 'Aufgaben', icon: 'clipboard-list' },
    { path: '/support', label: 'Support', icon: 'headset' },
  ],
  projects: [],
}

export function getWorkspaceRoute(moduleKey: string): string {
  return WORKSPACE_ROUTES[moduleKey] ?? '/'
}
