import { motion } from 'motion/react'
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton'
import { EmptyState } from '@/shared/components/common/EmptyState'
import { TaskCard } from './TaskCard'
import { mapStatus } from '../lib/status-mapping'
import { filterTasks, getEmptyMessage, cardVariants } from '../lib/task-list-utils'
import type { TaskFilter } from './TaskFilters'
import type { ActiveFilters } from './TaskFilterPanel'
import type { ClickUpTask } from '../types/tasks'

interface Props {
  tasks: ClickUpTask[]
  isLoading: boolean
  filter: TaskFilter
  taskUnread: Record<string, number>
  searchQuery?: string
  activeFilters?: ActiveFilters
  onTaskClick: (id: string) => void
}

export function TaskList({ tasks, isLoading, filter, taskUnread, searchQuery = '', activeFilters, onTaskClick }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <LoadingSkeleton lines={3} height="152px" />
      </div>
    )
  }

  const filtered = filterTasks(tasks, filter, searchQuery, activeFilters)

  const sorted = [...filtered].sort((a, b) => {
    const aStatus = mapStatus(a.status)
    const bStatus = mapStatus(b.status)
    const aNeeds = aStatus === 'needs_attention' || aStatus === 'awaiting_approval'
    const bNeeds = bStatus === 'needs_attention' || bStatus === 'awaiting_approval'
    if (aNeeds && !bNeeds) return -1
    if (bNeeds && !aNeeds) return 1
    const aTime = a.last_activity_at ?? a.updated_at
    const bTime = b.last_activity_at ?? b.updated_at
    return new Date(bTime).getTime() - new Date(aTime).getTime()
  })

  if (sorted.length === 0) {
    return <EmptyState message={getEmptyMessage(filter, searchQuery, activeFilters)} />
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {sorted.map((task, i) => (
        <motion.div
          key={task.clickup_id}
          custom={i}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
        >
          <TaskCard
            task={task}
            unreadCount={taskUnread[task.clickup_id] ?? 0}
            onTaskClick={onTaskClick}
          />
        </motion.div>
      ))}
    </div>
  )
}
