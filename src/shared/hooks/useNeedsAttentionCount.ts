import { useMemo } from 'react'
import { useClickUpTasks } from '@/modules/tickets/hooks/useClickUpTasks'
import { useUnreadCounts } from '@/modules/tickets/hooks/useUnreadCounts'
import { useRecommendations } from '@/modules/tickets/hooks/useRecommendations'
import { mapStatus } from '@/modules/tickets/lib/status-mapping'

/**
 * Counts unique tasks visible on MeineAufgabenPage across all 4 tabs.
 * Mirrors useMeineAufgaben totalCount exactly — reads from shared React Query cache,
 * so it stays in sync with the page without any extra DB queries.
 */
export function useNeedsAttentionCount(userId: string | undefined) {
  const { data: tasks = [] } = useClickUpTasks()
<<<<<<< HEAD
  const { taskUnread, needsReply } = useUnreadCounts(userId)
  const { recommendations } = useRecommendations(tasks)

  const data = useMemo(() => {
    if (!userId) return 0
    const ids = new Set<string>([
      ...tasks.filter(t => (taskUnread[t.clickup_id] ?? 0) > 0 || needsReply[t.clickup_id]).map(t => t.clickup_id),
      ...tasks.filter(t => {
        const s = mapStatus(t.status)
        return s === 'needs_attention' || s === 'awaiting_approval'
      }).map(t => t.clickup_id),
      ...recommendations.map(t => t.clickup_id),
    ])
    return ids.size
  }, [userId, tasks, taskUnread, needsReply, recommendations])

  return { data }
}
