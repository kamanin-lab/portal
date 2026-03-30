import { motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Idea01Icon } from '@hugeicons/core-free-icons'
import { RecommendationCard } from './RecommendationCard'
import { cardVariants } from '../lib/task-list-utils'
import { dict } from '../lib/dictionary'
import type { ClickUpTask } from '../types/tasks'

interface Props {
  recommendations: ClickUpTask[]
  onTaskClick: (id: string) => void
}

export function RecommendationsBlock({ recommendations, onTaskClick }: Props) {
  if (recommendations.length === 0) return null

  return (
    <div className="mt-2">
      {/* Divider */}
      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-text-tertiary font-medium">{dict.labels.recommendations}</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Section header */}
      <div className="flex items-center gap-2 mb-1">
        <HugeiconsIcon icon={Idea01Icon} size={16} className="text-[var(--phase-3)]" />
        <span className="text-sm font-semibold text-text-primary">{dict.labels.recommendations}</span>
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--phase-3)]/20 text-[var(--phase-3)] text-2xs font-bold">
          {recommendations.length}
        </span>
      </div>
      <p className="text-xs text-text-tertiary mb-4">{dict.labels.recommendationsSubtitle}</p>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {recommendations.map((task, i) => (
          <motion.div
            key={task.clickup_id}
            custom={i}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
          >
            <RecommendationCard
              task={task}
              onTaskClick={onTaskClick}
            />
          </motion.div>
        ))}
      </div>
    </div>
  )
}
