import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageCircle, SlidersHorizontal } from 'lucide-react'
import { ContentContainer } from '@/shared/components/layout/ContentContainer'
import { TaskFilters, type TaskFilter } from '../components/TaskFilters'
import { TaskList } from '../components/TaskList'
import { TaskSearchBar } from '../components/TaskSearchBar'
import { SyncIndicator } from '../components/SyncIndicator'
import { NewTaskButton } from '../components/NewTaskButton'
import { TaskDetailSheet } from '../components/TaskDetailSheet'
import { TaskFilterPanel, type ActiveFilters } from '../components/TaskFilterPanel'
import { SupportSheet } from '../components/SupportSheet'
import { NewTicketDialog } from '../components/NewTicketDialog'
import { useClickUpTasks } from '../hooks/useClickUpTasks'
import { useUnreadCounts } from '../hooks/useUnreadCounts'
import { useAuth } from '@/shared/hooks/useAuth'
import { mapStatus } from '../lib/status-mapping'
import { cn } from '@/shared/lib/utils'

export function TicketsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({ priorities: [], datePreset: null })

  const { data: tasks = [], isLoading, isFetching, dataUpdatedAt, forceRefresh } = useClickUpTasks()
  const { user } = useAuth()
  const { taskUnread } = useUnreadCounts(user?.id)

  const activeTaskId = searchParams.get('taskId')
  const filterCount = activeFilters.priorities.length + (activeFilters.datePreset ? 1 : 0)

  // Auto-select "Ihre Rückmeldung" filter when tasks in client review exist
  useEffect(() => {
    if (!isLoading && tasks.length > 0) {
      const hasAttention = tasks.some(t => mapStatus(t.status) === 'needs_attention')
      if (hasAttention && filter === 'all') setFilter('attention')
    }
  }, [isLoading, tasks]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle ?filter= param from MeineAufgabenPage redirect
  useEffect(() => {
    const filterParam = searchParams.get('filter')
    if (filterParam === 'needs_attention') {
      setFilter('attention')
      setSearchParams(p => { p.delete('filter'); return p }, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openTask(id: string) {
    setSearchParams({ taskId: id }, { replace: true })
  }

  function closeTask() {
    setSearchParams({}, { replace: true })
  }

  const lastSynced = dataUpdatedAt ? new Date(dataUpdatedAt) : null

  return (
    <ContentContainer width="narrow" className="p-6 max-[768px]:p-4">
      {/* Row 1: New task button + search + Support */}
      <div className="flex items-center gap-3 mb-4">
        <NewTaskButton onClick={() => setDialogOpen(true)} />
        <div className="flex items-center gap-2 ml-auto">
          <TaskSearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            className="max-w-[280px]"
          />
          <button
            onClick={() => setSupportOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold bg-accent text-white rounded-[var(--r-md)] hover:bg-accent-hover transition-colors cursor-pointer shrink-0"
          >
            <MessageCircle size={15} />
            Support
          </button>
        </div>
      </div>

      {/* Row 2: Filter chips */}
      <div className="mb-3">
        <TaskFilters active={filter} onChange={setFilter} tasks={tasks} />
      </div>

      {/* Row 3: Sync indicator + Filter button */}
      <div className="flex items-center justify-between mb-4">
        <SyncIndicator
          lastSyncedAt={lastSynced}
          isSyncing={isFetching}
          onSync={forceRefresh}
        />
        <div className="relative">
          <button
            onClick={() => setFilterPanelOpen(v => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium border rounded-[var(--r-sm)] transition-colors cursor-pointer',
              filterCount > 0
                ? 'bg-accent/10 text-accent border-accent/30'
                : 'bg-surface border-border text-text-secondary hover:border-accent hover:text-accent'
            )}
          >
            <SlidersHorizontal size={13} />
            Filter
            {filterCount > 0 && (
              <span className="min-w-[16px] h-[16px] px-[4px] rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">
                {filterCount}
              </span>
            )}
          </button>
          <TaskFilterPanel
            open={filterPanelOpen}
            activeFilters={activeFilters}
            onChange={setActiveFilters}
            onClose={() => setFilterPanelOpen(false)}
          />
        </div>
      </div>

      {/* Row 4: Task grid */}
      <TaskList
        tasks={tasks}
        isLoading={isLoading}
        filter={filter}
        taskUnread={taskUnread}
        searchQuery={searchQuery}
        activeFilters={activeFilters}
        onTaskClick={openTask}
      />

      {/* Sheet: task detail (URL-based) */}
      <TaskDetailSheet taskId={activeTaskId} onClose={closeTask} />

      {/* Sheet: support chat */}
      <SupportSheet open={supportOpen} onClose={() => setSupportOpen(false)} />

      {/* New task dialog */}
      <NewTicketDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </ContentContainer>
  )
}
