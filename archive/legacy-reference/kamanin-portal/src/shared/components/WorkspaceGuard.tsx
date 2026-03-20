import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useWorkspaces } from '@/shared/hooks/useWorkspaces'

interface Props {
  moduleKey: string
  children: ReactNode
}

export function WorkspaceGuard({ moduleKey, children }: Props) {
  const { data: workspaces, isLoading } = useWorkspaces()

  // While loading, render nothing (avoids flash redirect)
  if (isLoading) return null

  // If workspaces not available or empty (table not seeded), allow access
  if (!workspaces || workspaces.length === 0) return <>{children}</>

  const hasAccess = workspaces.some(w => w.module_key === moduleKey && w.is_active)
  if (!hasAccess) return <Navigate to="/inbox" replace />

  return <>{children}</>
}
