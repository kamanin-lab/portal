import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { TaskDetail } from './TaskDetail'
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
        <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>
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
    <Dialog.Root open={!!taskId} onOpenChange={open => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 data-[state=open]:animate-[fadeIn_150ms_ease]" />
        <Dialog.Content
          className="fixed top-0 right-0 z-50 h-full w-full max-w-[680px] bg-bg shadow-2xl flex flex-col data-[state=open]:animate-[slideInRight_200ms_ease] data-[state=closed]:animate-[slideOutRight_150ms_ease] focus:outline-none overflow-hidden"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">
            {task?.name ?? 'Aufgabe'}
          </Dialog.Title>

          <div className="flex items-center justify-end px-5 py-3 border-b border-border shrink-0">
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-[var(--r-sm)] text-text-tertiary hover:text-text-primary hover:bg-surface-raised transition-colors">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto">
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
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
