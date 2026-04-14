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
import { MeineAufgabenFilters } from '@/modules/tickets/components/MeineAufgabenFilters'
import { useClickUpTasks } from '@/modules/tickets/hooks/useClickUpTasks'
import { useUnreadCounts } from '@/modules/tickets/hooks/useUnreadCounts'
import { useAuth } from '@/shared/hooks/useAuth'
import { useMeineAufgaben } from '@/shared/hooks/useMeineAufgaben'
import { cardVariants } from '@/modules/tickets/lib/task-list-utils'

export function MeineAufgabenPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: tasks = [], isLoading } = useClickUpTasks()
  const { user } = useAuth()
  const { taskUnread, needsReply } = useUnreadCounts(user?.id)
  const {
    counts,
    activeTab,
    setActiveTab,
    visibleTasks,
    totalCount,
    recommendations,
    snoozeRecommendation,
  } = useMeineAufgaben(tasks, taskUnread, isLoading, needsReply)

  const activeTaskId = searchParams.get('taskId')

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
