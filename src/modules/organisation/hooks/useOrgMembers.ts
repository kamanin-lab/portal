import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useOrg } from '@/shared/hooks/useOrg'

export interface OrgMember {
  id: string
  organization_id: string
  profile_id: string
  role: 'admin' | 'member' | 'viewer'
  created_at: string
  profile: {
    id: string
    email: string
    full_name: string | null
  } | null
}

export function useOrgMembers() {
  const { organization } = useOrg()

  return useQuery<OrgMember[]>({
    queryKey: ['org-members', organization?.id],
    queryFn: async () => {
      if (!organization?.id) return []
      const { data, error } = await supabase
        .from('org_members')
        .select('id, organization_id, profile_id, role, created_at, profile:profiles(id, email, full_name)')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: true })
      if (error) return []
      return (data ?? []) as unknown as OrgMember[]
    },
    enabled: !!organization?.id,
    staleTime: 2 * 60 * 1000,
  })
}
