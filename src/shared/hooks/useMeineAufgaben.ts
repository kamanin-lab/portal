import { useState, useMemo, useEffect } from 'react'
import { useRecommendations } from '@/modules/tickets/hooks/useRecommendations'
import { mapStatus } from '@/modules/tickets/lib/status-mapping'
import type { ClickUpTask } from '@/modules/tickets/types/tasks'
import type { MeineAufgabenTab } from '@/modules/tickets/components/MeineAufgabenFilters'

const TAB_ORDER: MeineAufgabenTab[] = ['unread', 'kostenfreigabe', 'freigabe', 'empfehlungen']

export function useMeineAufgaben(
  tasks: ClickUpTask[],
  taskUnread: Record<string, number>,
  isLoading: boolean,
) {
  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(new Set())
  const { recommendations: allRecommendations } = useRecommendations(tasks)
  const recommendations = useMemo(
    () => allRecommendations.filter(r => !snoozedIds.has(r.clickup_id)),
    [allRecommendations, snoozedIds],
  )
  const snoozeRecommendation = (id: string) => {
    setSnoozedIds(prev => { const next = new Set(prev); next.add(id); return next })
  }

  const counts = useMemo(() => ({
    unread: tasks.filter(t => (taskUnread[t.clickup_id] ?? 0) > 0).length,
    kostenfreigabe: tasks.filter(t => mapStatus(t.status) === 'awaiting_approval').length,
    freigabe: tasks.filter(t => mapStatus(t.status) === 'needs_attention').length,
    empfehlungen: recommendations.length,
  }), [tasks, taskUnread, recommendations])

  const totalCount = useMemo(() => {
    const ids = new Set<string>([
      ...tasks.filter(t => (taskUnread[t.clickup_id] ?? 0) > 0).map(t => t.clickup_id),
      ...tasks.filter(t => {
        const s = mapStatus(t.status)
        return s === 'needs_attention' || s === 'awaiting_approval'
      }).map(t => t.clickup_id),
      ...recommendations.map(t => t.clickup_id),
    ])
    return ids.size
  }, [tasks, taskUnread, recommendations])

  const [activeTab, setActiveTab] = useState<MeineAufgabenTab | null>(null)
  useEffect(() => {
    if (!isLoading && activeTab === null) {
      const defaultTab = TAB_ORDER.find(tab => counts[tab] > 0) ?? 'unread'
      setActiveTab(defaultTab)
    }
  }, [isLoading, counts, activeTab])

  const visibleTasks = useMemo(() => {
    if (!activeTab) return []
    switch (activeTab) {
      case 'unread': return tasks.filter(t => (taskUnread[t.clickup_id] ?? 0) > 0)
      case 'kostenfreigabe': return tasks.filter(t => mapStatus(t.status) === 'awaiting_approval')
      case 'freigabe': return tasks.filter(t => mapStatus(t.status) === 'needs_attention')
      case 'empfehlungen': return recommendations
      default: return []
    }
  }, [activeTab, tasks, taskUnread, recommendations])

  return {
    counts,
    activeTab,
    setActiveTab,
    visibleTasks,
    totalCount,
    recommendations,
    snoozeRecommendation,
  }
}
