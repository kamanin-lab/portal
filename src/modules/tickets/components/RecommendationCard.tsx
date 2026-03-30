import { motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Idea01Icon } from '@hugeicons/core-free-icons'
import { CreditBadge } from './CreditBadge'
import { dict } from '../lib/dictionary'
import type { ClickUpTask } from '../types/tasks'

interface Props {
  task: ClickUpTask
  onAccept: (task: ClickUpTask) => void
  onDecline: (task: ClickUpTask) => void
  onTaskClick: (id: string) => void
}

export function RecommendationCard({ task, onAccept, onDecline, onTaskClick }: Props) {
  const preview = task.description?.trim() || 'Keine Beschreibung verfügbar.'
  const hasDescription = Boolean(task.description?.trim())

  return (
    <motion.div
      className="h-[152px]"
      whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <div className="flex w-full h-full bg-surface border border-border rounded-[var(--r-md)] shadow-sm overflow-hidden">
        {/* Amber left border for recommendations */}
        <div className="w-[3px] shrink-0 rounded-l-[var(--r-md)] bg-[var(--phase-3)]" />

        {/* Card content */}
        <button
          onClick={() => onTaskClick(task.clickup_id)}
          className="flex-1 flex flex-col min-w-0 px-4 py-3.5 text-left hover:bg-surface-hover transition-colors duration-[120ms] cursor-pointer"
        >
          {/* Title */}
          <div className="flex items-start gap-2">
            <HugeiconsIcon
              icon={Idea01Icon}
              size={15}
              className="shrink-0 text-[var(--phase-3)] mt-0.5"
            />
            <h3 className="text-sm font-semibold text-text-primary leading-snug line-clamp-2">
              {task.name}
            </h3>
          </div>

          {/* Description */}
          <p className={`text-body leading-[1.4] line-clamp-2 mt-1 overflow-hidden pl-[23px] ${
            hasDescription ? 'text-text-secondary' : 'text-text-tertiary italic'
          }`}>
            {preview}
          </p>

          <div className="flex-1" />

          {/* Bottom row: credits */}
          <div className="flex items-center gap-2 pt-1 pl-[23px]">
            <CreditBadge credits={task.credits} />
          </div>
        </button>

        {/* Action buttons — right side */}
        <div className="flex flex-col gap-1.5 justify-center px-3 shrink-0 border-l border-border">
          <button
            onClick={(e) => { e.stopPropagation(); onAccept(task); }}
            className="px-3 py-1.5 text-xs font-semibold bg-accent text-white rounded-[var(--r-sm)] hover:bg-accent-hover transition-colors cursor-pointer whitespace-nowrap"
          >
            {dict.actions.accept}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDecline(task); }}
            className="px-3 py-1.5 text-xs font-semibold bg-surface-hover text-text-secondary border border-border rounded-[var(--r-sm)] hover:bg-surface-active transition-colors cursor-pointer whitespace-nowrap"
          >
            {dict.actions.decline}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
