import { User, CalendarDays } from 'lucide-react'
import { motion } from 'motion/react'
import { StatusBadge } from '@/shared/components/common/StatusBadge'
import { PriorityIcon } from './PriorityIcon'
import { CreditBadge } from './CreditBadge'
import { mapStatus } from '../lib/status-mapping'
import type { ClickUpTask } from '../types/tasks'

interface Props {
  task: ClickUpTask
  unreadCount?: number
  onTaskClick: (id: string) => void
}

function getPreview(task: ClickUpTask): string {
  return task.description?.trim() || 'Keine Vorschau verfügbar.'
}

function formatDueDate(date: string | null): string | null {
  if (!date) return null
  return new Date(date).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: 'short',
  })
}

const STATUS_BORDER_COLORS: Record<string, string> = {
  open:            'var(--text-tertiary)',
  in_progress:     'var(--phase-2)',
  needs_attention: 'var(--awaiting)',
  approved:        'var(--committed)',
  done:            'var(--text-tertiary)',
  on_hold:         'var(--phase-1)',
  cancelled:       'var(--text-tertiary)',
}

export function TaskCard({ task, unreadCount = 0, onTaskClick }: Props) {
  const portalStatus = mapStatus(task.status)
  const preview = getPreview(task)
  const dueDate = formatDueDate(task.due_date)
  const borderColor = STATUS_BORDER_COLORS[portalStatus] ?? 'var(--border)'
  const hasDescription = Boolean(task.description?.trim())

  return (
    <motion.div
      className="h-[152px]"
      whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <button
        onClick={() => onTaskClick(task.clickup_id)}
        className="flex w-full h-full text-left bg-surface border border-border rounded-[var(--r-md)] shadow-sm overflow-hidden hover:bg-surface-hover transition-colors duration-[120ms] cursor-pointer"
      >
        {/* Status left border */}
        <div
          className="w-[3px] shrink-0 rounded-l-[var(--r-md)]"
          style={{ background: borderColor }}
        />

        {/* Card content */}
        <div className="flex-1 flex flex-col min-w-0 px-4 py-3.5">
          {/* Title — max 2 lines */}
          <h3 className="text-[14px] font-semibold text-text-primary leading-snug line-clamp-2">
            {task.name}
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center ml-2 min-w-[18px] h-[18px] px-[5px] rounded-full bg-cta text-white text-[10px] font-bold align-middle">
                {unreadCount}
              </span>
            )}
          </h3>

          {/* Description — max 2 lines, flex-1 fills remaining space */}
          <p className={`text-[13px] leading-relaxed line-clamp-2 mt-1 flex-1 ${
            hasDescription ? 'text-text-secondary' : 'text-text-tertiary italic'
          }`}>
            {preview}
          </p>

          {/* Meta row — always at bottom */}
          <div className="flex items-center gap-2 flex-wrap mt-auto pt-1">
            <StatusBadge status={portalStatus} variant="ticket" size="sm" />

            <PriorityIcon priority={task.priority} size={13} showLabel />

            <CreditBadge credits={task.credits} />

            {dueDate && (
              <span className="inline-flex items-center gap-1 text-[12px] text-text-tertiary">
                <CalendarDays size={12} />
                {dueDate}
              </span>
            )}

            <span className="flex items-center gap-1 text-[12px] text-text-tertiary ml-auto">
              <User size={12} />
              Team
            </span>
          </div>
        </div>
      </button>
    </motion.div>
  )
}
