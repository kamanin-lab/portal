import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/shared/lib/supabase'

/**
 * Hook for admin to update a member's department assignments.
 * Writes directly to org_members.departments (admin RLS allows UPDATE on own org).
 */
export function useUpdateMemberDepartments() {
  const queryClient = useQueryClient()

  async function updateDepartments(memberId: string, departmentIds: string[]) {
    const { error } = await supabase
      .from('org_members')
      .update({ departments: departmentIds })
      .eq('id', memberId)

    if (error) {
      toast.error('Fachbereich-Zuweisung fehlgeschlagen.', { description: error.message })
      throw error
    }

    toast.success('Fachbereiche aktualisiert.')
    queryClient.invalidateQueries({ queryKey: ['org-members'] })
  }

  return { updateDepartments }
}
