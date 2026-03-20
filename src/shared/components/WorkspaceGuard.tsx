import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useWorkspaces } from '@/shared/hooks/useWorkspaces'
import { ContentContainer } from '@/shared/components/layout/ContentContainer'
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton'

interface Props {
  moduleKey: string
  children: ReactNode
}

export function WorkspaceGuard({ moduleKey, children }: Props) {
  const { data: workspaces, isLoading } = useWorkspaces()

  // While loading, render a narrow loading state instead of a blank screen.
  if (isLoading) {
    return (
      <ContentContainer width="narrow" className="p-6 max-[768px]:p-4">
        <LoadingSkeleton lines={5} height="56px" />
      </ContentContainer>
    )
  }

  // If workspaces not available or empty (table not seeded), allow access
  if (!workspaces || workspaces.length === 0) return <>{children}</>

  const hasAccess = workspaces.some(w => w.module_key === moduleKey && w.is_active)
  if (!hasAccess) return <Navigate to="/inbox" replace />

  return <>{children}</>
}
