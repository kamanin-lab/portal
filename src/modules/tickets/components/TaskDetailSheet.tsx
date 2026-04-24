import { SideSheet } from '@/shared/components/ui/SideSheet'
import { TaskDetail } from './TaskDetail'
import { TaskCommentComposer } from './TaskComments'
import { useSingleTask } from '../hooks/useSingleTask'
import { useUnreadCounts } from '../hooks/useUnreadCounts'
import { useAuth } from '@/shared/hooks/useAuth'
import type { ClickUpTask } from '../types/tasks'

interface Props {
  taskId: string | null
  onClose: () => void
  /** Pre-loaded tasks from parent — avoids duplicate Realtime subscriptions */
  tasks?: ClickUpTask[]
  isTasksLoading?: boolean
}

function SheetMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full min-h-[280px] items-center justify-center px-6 py-10 text-center">
      <div className="max-w-[340px] space-y-2">
        <h2 className="text-md font-semibold text-text-primary">{title}</h2>
        <p className="text-sm leading-6 text-text-tertiary">{body}</p>
      </div>
    </div>
  )
}

export function TaskDetailSheet({ taskId, onClose, tasks = [], isTasksLoading = false }: Props) {
  const { user } = useAuth()
  const { markAsRead } = useUnreadCounts(user?.id)
  const cachedTask = taskId ? tasks.find(t => t.clickup_id === taskId) : null
  const fallbackTaskQuery = useSingleTask(taskId, !!taskId && !cachedTask && !isTasksLoading)

  const task = cachedTask ?? fallbackTaskQuery.task
  const isLoading = !!taskId && !task && (isTasksLoading || fallbackTaskQuery.isLoading)
  const isError = !!taskId && !task && (fallbackTaskQuery.isError && !fallbackTaskQuery.isNotFound)
  const isNotFound = !!taskId && !task && !isLoading && !isError && fallbackTaskQuery.isNotFound

  const errorMessage = fallbackTaskQuery.error instanceof Error
    ? fallbackTaskQuery.error.message
    : null

  return (
    <SideSheet
      open={!!taskId}
      onClose={onClose}
      title={task?.name ?? 'Aufgabe'}
      footer={task ? <TaskCommentComposer taskId={task.clickup_id} /> : undefined}
    >
      {task ? (
        <TaskDetail task={task} onClose={onClose} onRead={() => markAsRead(`task:${task.clickup_id}`)} />
      ) : isLoading ? (
        <SheetMessage title="Aufgabe wird geladen" body="Wir laden die aktuellen Aufgabendetails. Bitte einen Moment." />
      ) : isError ? (
        <SheetMessage
          title="Aufgabe konnte nicht geladen werden"
          body={errorMessage ?? 'Die Aufgabendetails sind gerade nicht verfügbar. Bitte versuchen Sie es erneut.'}
        />
      ) : isNotFound ? (
        <SheetMessage
          title="Aufgabe nicht gefunden"
          body="Diese Aufgabe ist nicht mehr verfügbar oder für Ihr Portal nicht freigegeben."
        />
      ) : (
        <SheetMessage title="Keine Aufgabe ausgewählt" body="Waehlen Sie eine Aufgabe aus, um die Details zu sehen." />
      )}
    </SideSheet>
  )
}
