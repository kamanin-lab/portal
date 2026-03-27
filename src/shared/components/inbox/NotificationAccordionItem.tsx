import { motion, AnimatePresence } from 'motion/react'
import { ArrowRight, ChevronDown } from 'lucide-react'
import type { Notification } from '@/modules/tickets/hooks/useNotifications'
import { cn } from '@/shared/lib/utils'
import { linkifyText } from '@/shared/lib/linkify'
import { TypeBadge } from './TypeBadge'
import { formatDate } from './notification-utils'

interface NotificationAccordionItemProps {
  notification: Notification
  isExpanded: boolean
  isSelected: boolean
  onSelect: () => void
  onGoToTask: (taskId: string) => void
}

export function NotificationAccordionItem({
  notification: n,
  isExpanded,
  isSelected,
  onSelect,
  onGoToTask,
}: NotificationAccordionItemProps) {
  return (
    <div>
      <button
        onClick={onSelect}
        className={cn(
          'w-full text-left px-5 py-3.5 border-b border-border/50 transition-colors hover:bg-surface-raised',
          isSelected && 'bg-surface-raised',
          !n.is_read && 'bg-accent/5'
        )}
      >
        <div className="flex items-start gap-2 mb-1">
          {!n.is_read && (
            <span className="mt-1.5 w-2 h-2 rounded-full bg-accent shrink-0" />
          )}
          {n.is_read && <span className="mt-1.5 w-2 h-2 shrink-0" />}
          <span className="text-sm font-medium text-text-primary leading-snug line-clamp-2 flex-1">
            {n.title}
          </span>
          <ChevronDown
            size={14}
            className={cn(
              'text-text-tertiary shrink-0 mt-1 transition-transform duration-200',
              isExpanded && 'rotate-180'
            )}
          />
        </div>
        <div className="flex items-center gap-2 pl-4">
          <TypeBadge type={n.type} />
          <span className="text-xs text-text-tertiary">
            {formatDate(n.created_at)}
          </span>
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pl-9 pr-5 py-4 bg-surface-raised/50 border-b border-border/50">
              <p className="text-sm text-text-secondary leading-relaxed mb-3">{linkifyText(n.message)}</p>
              {n.task_id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onGoToTask(n.task_id!)
                  }}
                  className="inline-flex items-center gap-1.5 text-body font-medium text-accent hover:text-accent/80 transition-colors"
                >
                  Zur Aufgabe
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
