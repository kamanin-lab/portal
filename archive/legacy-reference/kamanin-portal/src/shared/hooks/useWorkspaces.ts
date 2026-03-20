import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'

export interface ClientWorkspace {
  id: string
  profile_id: string
  module_key: string
  display_name: string
  icon: string
  sort_order: number
  is_active: boolean
  created_at: string
}

export function useWorkspaces() {
  const { user } = useAuth()

  return useQuery<ClientWorkspace[]>({
    queryKey: ['workspaces', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      const { data, error } = await supabase
        .from('client_workspaces')
        .select('*')
        .eq('profile_id', user.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (error) return []
      return data ?? []
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  })
}
