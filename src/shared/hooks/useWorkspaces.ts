import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useOrg } from '@/shared/hooks/useOrg'

export interface ClientWorkspace {
  id: string
  organization_id: string
  module_key: string
  display_name: string
  icon: string
  sort_order: number
  is_active: boolean
  created_at: string
}

export function useWorkspaces() {
  const { organization } = useOrg()

  return useQuery<ClientWorkspace[]>({
    queryKey: ['workspaces', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return []
      const { data, error } = await supabase
        .from('client_workspaces')
        .select('*')
        .eq('organization_id', organization.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (error) return []
      return data ?? []
    },
    enabled: !!organization?.id,
    staleTime: 5 * 60 * 1000,
  })
}
