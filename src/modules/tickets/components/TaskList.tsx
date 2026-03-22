import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton'
import { EmptyState } from '@/shared/components/common/EmptyState'
import { TaskCard } from './TaskCard'
import { mapStatus } from '../lib/status-mapping'
import type { TaskFilter } from './TaskFilters'
import type { ActiveFilters } from './TaskFilterPanel'
import type { ClickUpTask } from '../types/tasks'
import { dict } from '../lib/dictionary'

interface Props {
  tasks: ClickUpTask[]
  isLoading: boolean
  filter: TaskFilter
  taskUnread: Record<string, number>
  searchQuery?: string
  activeFilters?: ActiveFilters
  onTaskClick: (id: string) => void
}

function getEmptyMessage(filter: TaskFilter, query: string, activeFilters?: ActiveFilters): string {
  const hasSearch = query.trim().length > 0
  const hasAdvancedFilters = !!activeFilters && (activeFilters.priorities.length > 0 || activeFilters.datePreset !== null)

  if (hasSearch && hasAdvancedFilters) return 'Keine Aufgaben passen zu Suche und Filtern.'
  if (hasSearch) return 'Keine Aufgaben zur aktuellen Suche gefunden.'
  if (hasAdvancedFilters) return 'Keine Aufgaben passen zu den gewählten Filtern.'

  switch (filter) {
    case 'attention':
      return 'Aktuell wartet keine Aufgabe auf Ihre Rückmeldung.'
    case 'open':
      return 'Aktuell gibt es keine offenen Aufgaben.'
    case 'in_progress':
      return 'Aktuell gibt es keine Aufgaben in Bearbeitung.'
    case 'approved':
      return 'Aktuell gibt es keine freigegebenen Aufgaben.'
    case 'done':
      return 'Aktuell gibt es keine erledigten Aufgaben.'
    case 'on_hold':
      return 'Aktuell gibt es keine pausierten Aufgaben.'
    case 'cancelled':
      return 'Aktuell gibt es keine abgebrochenen Aufgaben.'
    default:
      return dict.labels.noTasks
  }
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000)
}

export function matchesTaskSearch(task: ClickUpTask, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true

  return [task.name, task.description, task.list_name]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .some(value => value.toLowerCase().includes(normalized))
}

export function filterTasks(tasks: ClickUpTask[], filter: TaskFilter, query: string, activeFilters?: ActiveFilters): ClickUpTask[] {
  let result = tasks

  if (query.trim()) {
    result = result.filter(t => matchesTaskSearch(t, query))
  }

  switch (filter) {
    case 'attention':   result = result.filter(t => mapStatus(t.status) === 'needs_attention'); break
    case 'open':        result = result.filter(t => mapStatus(t.status) === 'open'); break
    case 'in_progress': result = result.filter(t => mapStatus(t.status) === 'in_progress'); break
    case 'approved':    result = result.filter(t => mapStatus(t.status) === 'approved'); break
    case 'done':        result = result.filter(t => mapStatus(t.status) === 'done'); break
    case 'on_hold':     result = result.filter(t => mapStatus(t.status) === 'on_hold'); break
    case 'cancelled':   result = result.filter(t => mapStatus(t.status) === 'cancelled'); break
    default:            break
  }

  if (!activeFilters) return result

  if (activeFilters.priorities.length > 0) {
    result = result.filter(t => {
      const p = (t.priority ?? 'none').toLowerCase()
      return activeFilters.priorities.includes(p)
    })
  }

  if (activeFilters.datePreset) {
    const now = new Date()
    result = result.filter(t => {
      const due = t.due_date ? new Date(t.due_date) : null
      switch (activeFilters.datePreset) {
        case 'overdue': return due !== null && due < now
        case '1day':    return due !== null && due >= now && due <= addDays(now, 1)
        case '3days':   return due !== null && due >= now && due <= addDays(now, 3)
        case '1week':   return due !== null && due >= now && due <= addDays(now, 7)
        case '1month':  return due !== null && due >= now && due <= addDays(now, 30)
        case '3months': return due !== null && due >= now && due <= addDays(now, 90)
        case 'nodue':   return due === null
        default:        return true
      }
    })
  }

  return result
}

export function TaskList({ tasks, isLoading, filter, taskUnread, searchQuery = '', activeFilters, onTaskClick }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <LoadingSkeleton lines={3} height="100px" />
      </div>
    )
  }

  const filtered = filterTasks(tasks, filter, searchQuery, activeFilters)

  const sorted = [...filtered].sort((a, b) => {
    const aNeeds = mapStatus(a.status) === 'needs_attention'
    const bNeeds = mapStatus(b.status) === 'needs_attention'
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
      {sorted.map(task => (
        <TaskCard
          key={task.clickup_id}
          task={task}
          unreadCount={taskUnread[task.clickup_id] ?? 0}
          onTaskClick={onTaskClick}
        />
      ))}
    </div>
  )
}
