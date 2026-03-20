import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { TaskDetail } from './TaskDetail'
import { useClickUpTasks } from '../hooks/useClickUpTasks'

interface Props {
  taskId: string | null
  onClose: () => void
}

export function TaskDetailSheet({ taskId, onClose }: Props) {
  const { data: tasks = [] } = useClickUpTasks()
  const task = taskId ? tasks.find(t => t.clickup_id === taskId) : null

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

          {/* Close button */}
          <div className="flex items-center justify-end px-5 py-3 border-b border-border shrink-0">
            <Dialog.Close asChild>
              <button className="p-1.5 rounded-[var(--r-sm)] text-text-tertiary hover:text-text-primary hover:bg-surface-raised transition-colors">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {task ? (
              <TaskDetail task={task} onClose={onClose} />
            ) : (
              <div className="flex items-center justify-center h-40 text-text-tertiary text-sm">
                Aufgabe nicht gefunden
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
