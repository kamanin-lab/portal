import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useOrg } from '@/shared/hooks/useOrg'

export interface OrgMember {
  id: string
  organization_id: string
  profile_id: string
  role: 'admin' | 'member' | 'viewer'
  departments: string[]
  created_at: string
  invited_email: string | null
  accepted_at: string | null
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
      const { data, error } = await supabase.rpc('get_org_members_enriched', {
        p_org_id: organization.id,
      })
      if (error) return []
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        organization_id: row.organization_id as string,
        profile_id: row.profile_id as string,
        role: row.role as OrgMember['role'],
        departments: Array.isArray(row.departments) ? row.departments as string[] : [],
        created_at: row.created_at as string,
        invited_email: (row.invited_email as string) ?? null,
        accepted_at: (row.accepted_at as string) ?? null,
        profile: row.profile_id
          ? {
              id: row.profile_id as string,
              email: row.profile_email as string,
              full_name: (row.profile_full_name as string) ?? null,
            }
          : null,
      })) as OrgMember[]
    },
    enabled: !!organization?.id,
    staleTime: 2 * 60 * 1000,
  })
}
