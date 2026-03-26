import { ArrowRight } from 'lucide-react'
import type { Notification } from '@/modules/tickets/hooks/useNotifications'
import { linkifyText } from '@/shared/lib/linkify'
import { TypeBadge } from './TypeBadge'
import { formatDate } from './notification-utils'

export function NotificationDetailPanel({
  notification,
  onGoToTask,
}: {
  notification: Notification | null
  onGoToTask?: (taskId: string) => void
}) {
  if (!notification) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
        Benachrichtigung auswählen
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-start gap-3 mb-4">
        <TypeBadge type={notification.type} />
        <span className="text-xs text-text-tertiary">{formatDate(notification.created_at)}</span>
      </div>
      <h2 className="text-base font-semibold text-text-primary mb-3">{notification.title}</h2>
      <p className="text-sm text-text-secondary leading-relaxed mb-6">{linkifyText(notification.message)}</p>
      {notification.task_id && onGoToTask && (
        <button
          onClick={() => onGoToTask(notification.task_id!)}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:text-accent/80 transition-colors"
        >
          Zur Aufgabe
          <ArrowRight size={14} />
        </button>
      )}
    </div>
  )
}
