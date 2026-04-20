import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/shared/lib/supabase'

interface UpdateDepartmentsInput {
  clickupId: string
  departmentIds: string[]
}

/**
 * Mutation hook to update a ticket's Fachbereich (department labels) in ClickUp + task_cache.
 * Admin-only — the Edge Function enforces the role check.
 */
export function useUpdateTaskDepartments() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ clickupId, departmentIds }: UpdateDepartmentsInput) => {
      const { data, error } = await supabase.functions.invoke('update-task-departments', {
        body: { clickupId, departmentIds },
      })
      if (error) throw new Error(error.message || 'Fachbereich-Update fehlgeschlagen')
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      toast.success('Fachbereiche aktualisiert.')
      queryClient.invalidateQueries({ queryKey: ['clickup-tasks'] })
    },
    onError: (error: Error) => {
      toast.error('Fachbereich-Update fehlgeschlagen.', { description: error.message })
    },
  })
}
