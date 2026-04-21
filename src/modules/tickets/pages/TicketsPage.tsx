import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { FlashIcon, TimeScheduleIcon, Comment01Icon, PreferenceHorizontalIcon } from '@hugeicons/core-free-icons'
import { ContentContainer } from '@/shared/components/layout/ContentContainer'
import { TaskFilters, type TaskFilter } from '../components/TaskFilters'
import { TaskList } from '../components/TaskList'
import { TaskSearchBar } from '../components/TaskSearchBar'
import { NewTaskButton } from '../components/NewTaskButton'
import { TaskDetailSheet } from '../components/TaskDetailSheet'
import { TaskFilterPanel, type ActiveFilters } from '../components/TaskFilterPanel'
import { SupportSheet } from '../components/SupportSheet'
import { NewTicketDialog } from '../components/NewTicketDialog'
import { useClickUpTasks } from '../hooks/useClickUpTasks'
import { useUnreadCounts } from '../hooks/useUnreadCounts'
import { useAuth } from '@/shared/hooks/useAuth'
import { useOrg } from '@/shared/hooks/useOrg'
import { useCredits } from '../hooks/useCredits'
import { cn } from '@/shared/lib/utils'

export function TicketsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filter, setFilter] = useState<TaskFilter>('open')
  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({ priorities: [], datePreset: null })

  const { data: tasks = [], isLoading } = useClickUpTasks()
  const { user } = useAuth()
  const { isViewer, isAdmin } = useOrg()
  const { taskUnread, supportUnread } = useUnreadCounts(user?.id)
  const { balance, packageName, creditsPerMonth, isLoading: creditsLoading } = useCredits()

  const activeTaskId = searchParams.get('taskId')
  const filterCount = activeFilters.priorities.length + (activeFilters.datePreset ? 1 : 0)

  function openTask(id: string) {
    setFilterPanelOpen(false)
    setSearchParams({ taskId: id }, { replace: true })
  }

  function closeTask() {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('taskId')
      return next
    }, { replace: true })
  }

  return (
    <ContentContainer width="narrow" className="p-6 max-[768px]:p-4">
      {/* Row 1: New task button + credits + search + Support */}
      <div className="flex items-center gap-3 mb-4">
        {!isViewer && <NewTaskButton onClick={() => setDialogOpen(true)} />}

        <div className="flex items-center gap-2 ml-auto">
          {/* Credit balance — desktop only (mobile shows in MobileHeader). Link only for admins (history page is admin-only). */}
          {!creditsLoading && packageName && (() => {
            const balanceColorClass = balance < 0 ? 'text-credit-low'
              : creditsPerMonth && balance / creditsPerMonth > 0.5 ? 'text-credit-ok'
              : creditsPerMonth && balance / creditsPerMonth >= 0.2 ? 'text-credit-warn'
              : 'text-credit-low'
            const inner = (
              <>
                <HugeiconsIcon icon={FlashIcon} size={14} className={balanceColorClass} />
                <span className={cn('font-semibold', balanceColorClass)}>
                  {balance % 1 === 0 ? balance : balance.toFixed(1)} Credits
                </span>
                <span className="text-text-tertiary">/ {creditsPerMonth} pro Monat</span>
                {isAdmin && <HugeiconsIcon icon={TimeScheduleIcon} size={13} className="text-accent" />}
              </>
            )
            return isAdmin ? (
              <Link
                to="/organisation#guthaben"
                className="hidden md:flex items-center gap-1.5 text-xs shrink-0"
                title="Kreditverlauf anzeigen"
              >
                {inner}
              </Link>
            ) : (
              <div className="hidden md:flex items-center gap-1.5 text-xs shrink-0">
                {inner}
              </div>
            )
          })()}
          <TaskSearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            className="max-w-[280px]"
          />
          <button
            onClick={() => setSupportOpen(true)}
            className="hidden md:flex items-center gap-1.5 px-4 py-2 text-body font-semibold border border-accent/40 text-accent bg-transparent hover:bg-accent hover:text-white rounded-[var(--r-md)] transition-colors cursor-pointer shrink-0 relative"
          >
            <HugeiconsIcon icon={Comment01Icon} size={15} />
            Support
            {supportUnread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-cta text-white text-2xs font-bold flex items-center justify-center leading-none">
                {supportUnread > 99 ? '99+' : supportUnread}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Row 2: Filter chips + Filter button */}
      <div className="flex items-center gap-1.5 mb-4">
        <div className="flex-1 min-w-0">
          <TaskFilters active={filter} onChange={setFilter} tasks={tasks} />
        </div>
        <div className="relative shrink-0">
          <button
            onClick={() => setFilterPanelOpen(v => !v)}
            className={cn(
              'relative flex items-center justify-center w-8 h-8 border rounded-[var(--r-sm)] transition-colors cursor-pointer',
              filterCount > 0
                ? 'bg-accent/10 text-accent border-accent/30'
                : 'bg-surface border-border text-text-secondary hover:border-accent hover:text-accent'
            )}
          >
            <HugeiconsIcon icon={PreferenceHorizontalIcon} size={16} />
            {filterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-accent text-white text-2xs font-bold flex items-center justify-center">
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
      <TaskDetailSheet taskId={activeTaskId} onClose={closeTask} tasks={tasks} isTasksLoading={isLoading} />

      {/* Sheet: support chat */}
      <SupportSheet open={supportOpen} onClose={() => setSupportOpen(false)} />

      {/* New task dialog */}
      <NewTicketDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </ContentContainer>
  )
}
