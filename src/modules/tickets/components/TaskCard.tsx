import { User } from 'lucide-react'
import { StatusBadge } from '@/shared/components/common/StatusBadge'
import { PriorityIcon } from './PriorityIcon'
import { mapStatus } from '../lib/status-mapping'
import type { ClickUpTask } from '../types/tasks'

interface Props {
  task: ClickUpTask
  unreadCount?: number
  onTaskClick: (id: string) => void
}

function getPreview(task: ClickUpTask): string {
  const text = task.description?.trim()
  if (text) return text.slice(0, 90) + (text.length > 90 ? '…' : '')
  return ''
}

export function TaskCard({ task, unreadCount = 0, onTaskClick }: Props) {
  const portalStatus = mapStatus(task.status)
  const preview = getPreview(task)

  return (
    <button
      onClick={() => onTaskClick(task.clickup_id)}
      className="w-full text-left bg-surface border border-border rounded-[var(--r-md)] shadow-sm px-4 py-3.5 hover:bg-surface-hover hover:shadow-md transition-all duration-[120ms] cursor-pointer"
    >
      {/* Title row */}
      <div className="flex items-start gap-2 mb-1.5">
        <span className="flex-1 text-[13.5px] font-semibold text-text-primary leading-snug">
          {task.name}
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center ml-2 min-w-[18px] h-[18px] px-[5px] rounded-full bg-cta text-white text-[10px] font-bold align-middle">
              {unreadCount}
            </span>
          )}
        </span>
      </div>

      {/* Preview text */}
      {preview && (
        <p className="text-[12px] text-text-tertiary leading-relaxed mb-2 line-clamp-2">
          {preview}
        </p>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={portalStatus} variant="ticket" size="sm" />

        <PriorityIcon priority={task.priority} size={13} showLabel />

        <span className="flex items-center gap-1 text-[11px] text-text-tertiary ml-auto">
          <User size={11} />
          Team
        </span>
      </div>
    </button>
  )
}
