import { createContext, useContext, useState, useEffect, type ReactNode, createElement } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import type { Organization } from '@/shared/types/organization'

export type OrgRole = 'admin' | 'member' | 'viewer'

export interface OrgContextValue {
  organization: Organization | null
  orgRole: OrgRole
  /** Current member's assigned department option IDs. Empty = sees all (legacy). */
  memberDepartments: string[]
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
  memberDepartments: [],
  isAdmin: false,
  isMember: true,
  isViewer: false,
}

async function fetchOrgForUser(userId: string): Promise<Omit<OrgContextValue, 'isLoading'>> {
  const { data, error } = await supabase
    .from('org_members')
    .select('role, departments, organizations(id, name, slug, clickup_list_ids, nextcloud_client_root, support_task_id, clickup_chat_channel_id, clickup_department_field_id, departments_cache, created_at, updated_at)')
    .eq('profile_id', userId)
    .maybeSingle()

  if (error || !data || !data.organizations) {
    return LEGACY_FALLBACK
  }

  const role = data.role as OrgRole
  const organization = data.organizations as unknown as Organization
  const memberDepartments: string[] = Array.isArray(data.departments) ? data.departments : []

  return {
    organization,
    orgRole: role,
    memberDepartments,
    isAdmin: role === 'admin',
    isMember: role === 'admin' || role === 'member',
    isViewer: role === 'viewer',
  }
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [state, setState] = useState<OrgContextValue>({
    organization: null,
    orgRole: 'member',
    memberDepartments: [],
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

  // Realtime subscription to own org_members row. When admin changes this user's
  // role or departments, refetch org context AND invalidate task queries so the
  // sidebar/Meine Aufgaben list updates without requiring a page refresh.
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`org-member-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'org_members',
          filter: `profile_id=eq.${user.id}`,
        },
        async () => {
          const result = await fetchOrgForUser(user.id)
          setState({ ...result, isLoading: false })
          queryClient.invalidateQueries({ queryKey: ['clickup-tasks'] })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, queryClient])

  return createElement(OrgContext.Provider, { value: state }, children)
}
