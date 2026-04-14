import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { TaskDone01Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'
import { ContentContainer } from '@/shared/components/layout/ContentContainer'
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton'
import { EmptyState } from '@/shared/components/common/EmptyState'
import { TaskCard } from '@/modules/tickets/components/TaskCard'
import { TaskDetailSheet } from '@/modules/tickets/components/TaskDetailSheet'
import { RecommendationCard } from '@/modules/tickets/components/RecommendationCard'
import {
  MeineAufgabenFilters,
  type MeineAufgabenTab,
} from '@/modules/tickets/components/MeineAufgabenFilters'
import { useClickUpTasks } from '@/modules/tickets/hooks/useClickUpTasks'
import { useUnreadCounts } from '@/modules/tickets/hooks/useUnreadCounts'
import { useRecommendations } from '@/modules/tickets/hooks/useRecommendations'
import { useAuth } from '@/shared/hooks/useAuth'
import { mapStatus } from '@/modules/tickets/lib/status-mapping'
import { cardVariants } from '@/modules/tickets/lib/task-list-utils'

const TAB_ORDER: MeineAufgabenTab[] = ['unread', 'kostenfreigabe', 'freigabe', 'empfehlungen']

export function MeineAufgabenPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: tasks = [], isLoading } = useClickUpTasks()
  const { user } = useAuth()
  const { taskUnread } = useUnreadCounts(user?.id)

  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(new Set())
  const { recommendations: allRecommendations } = useRecommendations(tasks)
  const recommendations = useMemo(
    () => allRecommendations.filter(r => !snoozedIds.has(r.clickup_id)),
    [allRecommendations, snoozedIds],
  )
  const snoozeRecommendation = (id: string) => {
    setSnoozedIds(prev => { const next = new Set(prev); next.add(id); return next })
  }

  const activeTaskId = searchParams.get('taskId')

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

  function openTask(id: string) {
    setSearchParams({ taskId: id }, { replace: true })
  }

  function closeTask() {
    setSearchParams({}, { replace: true })
  }

  return (
    <ContentContainer width="narrow" className="p-6 max-[768px]:p-4">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-1">
        <HugeiconsIcon icon={TaskDone01Icon} size={20} className="text-accent" />
        <h1 className="text-lg font-semibold text-text-primary">Meine Aufgaben</h1>
        {totalCount > 0 && (
          <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-cta text-white text-xxs font-bold flex items-center justify-center">
            {totalCount}
          </span>
        )}
      </div>
      <p className="text-body text-text-tertiary mb-6">
        Aufgaben und Empfehlungen, die Ihre Entscheidung erfordern
      </p>

      {isLoading && <LoadingSkeleton lines={5} height="72px" className="py-4" />}

      {!isLoading && totalCount === 0 && (
        <div className="py-8">
          <EmptyState
            message="Keine offenen Aufgaben — alles erledigt!"
            icon={<HugeiconsIcon icon={CheckmarkCircle02Icon} size={36} className="text-green-500" />}
          />
        </div>
      )}

      {!isLoading && totalCount > 0 && activeTab !== null && (
        <MeineAufgabenFilters active={activeTab} onChange={setActiveTab} counts={counts} />
      )}

      {!isLoading && activeTab !== null && activeTab !== 'empfehlungen' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          {visibleTasks.map((task, i) => (
            <motion.div key={task.clickup_id} custom={i} variants={cardVariants} initial="hidden" animate="visible">
              <TaskCard task={task} unreadCount={taskUnread[task.clickup_id] ?? 0} onTaskClick={openTask} />
            </motion.div>
          ))}
          {visibleTasks.length === 0 && (
            <div className="col-span-2">
              <EmptyState message="Keine Aufgaben in dieser Kategorie" />
            </div>
          )}
        </div>
      )}

      {!isLoading && activeTab === 'empfehlungen' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          {recommendations.map((task, i) => (
            <motion.div key={task.clickup_id} custom={i} variants={cardVariants} initial="hidden" animate="visible">
              <RecommendationCard task={task} onTaskClick={openTask} onSnooze={snoozeRecommendation} />
            </motion.div>
          ))}
          {recommendations.length === 0 && (
            <div className="col-span-2">
              <EmptyState message="Keine Empfehlungen" />
            </div>
          )}
        </div>
      )}

      <TaskDetailSheet taskId={activeTaskId} onClose={closeTask} tasks={tasks} isTasksLoading={isLoading} />
    </ContentContainer>
  )
}
