import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

/**
 * Counts unique tasks visible on MeineAufgabenPage across all 4 tabs:
 * Nachrichten (unread) + Kostenfreigabe (approved) + Warten auf Freigabe (client review) + Empfehlungen
 * Used for the sidebar badge on Meine Aufgaben.
 */
export function useNeedsAttentionCount(profileId: string | undefined) {
  return useQuery({
    queryKey: ['needs-attention-count', profileId],
    queryFn: async () => {
      // Fetch all visible tasks
      const { data: tasks } = await supabase
        .from('task_cache')
        .select('clickup_id, status, tags')
        .eq('profile_id', profileId!)
        .eq('is_visible', true)

      if (!tasks) return 0

      const uniqueIds = new Set<string>()

      for (const t of tasks) {
        // Kostenfreigabe (awaiting_approval) + Warten auf Freigabe (needs_attention)
        if (t.status === 'client review' || t.status === 'approved') {
          uniqueIds.add(t.clickup_id)
        }
        // Empfehlungen
        if (
          t.status === 'to do' &&
          Array.isArray(t.tags) &&
          t.tags.some((tag: { name: string }) => tag.name === 'recommendation')
        ) {
          uniqueIds.add(t.clickup_id)
        }
      }

      // Nachrichten (unread team comments)
      const { data: profile } = await supabase
        .from('profiles')
        .select('support_task_id')
        .eq('id', profileId!)
        .maybeSingle()

      const supportTaskId = profile?.support_task_id ?? null

      const { data: receipts } = await supabase
        .from('read_receipts')
        .select('context_type, last_read_at')
        .eq('profile_id', profileId!)

      const receiptsMap: Record<string, string> = {}
      receipts?.forEach((r: { context_type: string; last_read_at: string }) => {
        receiptsMap[r.context_type] = r.last_read_at
      })

      const { data: comments } = await supabase
        .from('comment_cache')
        .select('task_id, clickup_created_at')
        .eq('profile_id', profileId!)
        .eq('is_from_portal', false)

      comments?.forEach((c: { task_id: string; clickup_created_at: string }) => {
        if (supportTaskId && c.task_id === supportTaskId) return
        const lastRead = receiptsMap[`task:${c.task_id}`]
        if (!lastRead || new Date(c.clickup_created_at) > new Date(lastRead)) {
          uniqueIds.add(c.task_id)
        }
      })

      return uniqueIds.size
    },
    enabled: !!profileId,
    staleTime: 15_000,
  })
}
