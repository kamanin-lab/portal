import { createContext, useContext, useState, useEffect, type ReactNode, createElement } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import type { Organization } from '@/shared/types/organization'

export type OrgRole = 'admin' | 'member' | 'viewer'

export interface OrgContextValue {
  organization: Organization | null
  orgRole: OrgRole
  isAdmin: boolean
  isMember: boolean
  isViewer: boolean
  isLoading: boolean
}

const OrgContext = createContext<OrgContextValue | null>(null)

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg muss innerhalb von OrgProvider verwendet werden')
  return ctx
}

// Legacy fallback per CONTEXT.md D-04
const LEGACY_FALLBACK: Omit<OrgContextValue, 'isLoading'> = {
  organization: null,
  orgRole: 'member',
  isAdmin: false,
  isMember: true,
  isViewer: false,
}

async function fetchOrgForUser(userId: string): Promise<Omit<OrgContextValue, 'isLoading'>> {
  const { data, error } = await supabase
    .from('org_members')
    .select('role, organizations(id, name, slug, clickup_list_ids, nextcloud_client_root, support_task_id, clickup_chat_channel_id, created_at, updated_at)')
    .eq('profile_id', userId)
    .maybeSingle()

  if (error || !data || !data.organizations) {
    return LEGACY_FALLBACK
  }

  const role = data.role as OrgRole
  const organization = data.organizations as unknown as Organization

  return {
    organization,
    orgRole: role,
    isAdmin: role === 'admin',
    isMember: role === 'admin' || role === 'member',
    isViewer: role === 'viewer',
  }
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [state, setState] = useState<OrgContextValue>({
    organization: null,
    orgRole: 'member',
    isAdmin: false,
    isMember: true,
    isViewer: false,
    isLoading: true,
  })

  useEffect(() => {
    if (!user?.id) {
      setState({ ...LEGACY_FALLBACK, isLoading: false })
      return
    }
    let mounted = true
    fetchOrgForUser(user.id).then((result) => {
      if (!mounted) return
      setState({ ...result, isLoading: false })
    })
    return () => {
      mounted = false
    }
  }, [user?.id])

  return createElement(OrgContext.Provider, { value: state }, children)
}
