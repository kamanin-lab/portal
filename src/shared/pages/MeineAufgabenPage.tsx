import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { TaskDone01Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons'
import { ContentContainer } from '@/shared/components/layout/ContentContainer'
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton'
import { EmptyState } from '@/shared/components/common/EmptyState'
import { TaskCard } from '@/modules/tickets/components/TaskCard'
import { TaskDetailSheet } from '@/modules/tickets/components/TaskDetailSheet'
import { RecommendationsBlock } from '@/modules/tickets/components/RecommendationsBlock'
import { useClickUpTasks } from '@/modules/tickets/hooks/useClickUpTasks'
import { useUnreadCounts } from '@/modules/tickets/hooks/useUnreadCounts'
import { useRecommendations } from '@/modules/tickets/hooks/useRecommendations'
import { useAuth } from '@/shared/hooks/useAuth'
import { mapStatus } from '@/modules/tickets/lib/status-mapping'
import type { ClickUpTask } from '@/modules/tickets/types/tasks'

const PRIORITY_ORDER: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3 }

function sortTasks(tasks: ClickUpTask[]): ClickUpTask[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority ?? '3'] ?? 2
    const pb = PRIORITY_ORDER[b.priority ?? '3'] ?? 2
    if (pa !== pb) return pa - pb
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })
}

function groupByList(tasks: ClickUpTask[]): Map<string, ClickUpTask[]> {
  const map = new Map<string, ClickUpTask[]>()
  for (const t of tasks) {
    const key = t.list_name || 'Sonstige'
    const group = map.get(key)
    if (group) group.push(t)
    else map.set(key, [t])
  }
  return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'de')))
}

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

  const attentionTasks = useMemo(
    () => tasks.filter(t => { const s = mapStatus(t.status); return s === 'needs_attention' || s === 'awaiting_approval'; }),
    [tasks],
  )

  const grouped = useMemo(
    () => groupByList(sortTasks(attentionTasks)),
    [attentionTasks],
  )

  function openTask(id: string) {
    setSearchParams({ taskId: id }, { replace: true })
  }

  function closeTask() {
    setSearchParams({}, { replace: true })
  }

  const totalCount = attentionTasks.length + recommendations.length

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

      {/* Loading */}
      {isLoading && (
        <LoadingSkeleton lines={5} height="72px" className="py-4" />
      )}

      {/* Empty state */}
      {!isLoading && attentionTasks.length === 0 && recommendations.length === 0 && (
        <div className="py-8">
          <EmptyState message="Keine offenen Aufgaben — alles erledigt!" icon={<HugeiconsIcon icon={CheckmarkCircle02Icon} size={36} className="text-green-500" />} />
        </div>
      )}

      {/* Grouped task list */}
      {!isLoading && [...grouped.entries()].map(([listName, groupTasks]) => (
        <div key={listName} className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider shrink-0">
              {listName}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="flex flex-col gap-2.5">
            {groupTasks.map(task => (
              <TaskCard
                key={task.clickup_id}
                task={task}
                unreadCount={taskUnread[task.clickup_id] ?? 0}
                onTaskClick={openTask}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Recommendations block */}
      {!isLoading && recommendations.length > 0 && (
        <RecommendationsBlock
          recommendations={recommendations}
          onTaskClick={openTask}
          onSnooze={snoozeRecommendation}
        />
      )}

      {/* Task detail sheet */}
      <TaskDetailSheet taskId={activeTaskId} onClose={closeTask} tasks={tasks} isTasksLoading={isLoading} />
    </ContentContainer>
  )
}
