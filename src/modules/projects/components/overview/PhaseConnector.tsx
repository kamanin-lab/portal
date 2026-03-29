import { motion } from "motion/react"
import type { Chapter, ChapterStatus } from "../../types/project"
import { getChapterProgress } from "../../lib/helpers"
import { getPhaseColor } from "../../lib/phase-colors"

interface PhaseConnectorProps {
  chapter: Chapter
  status: ChapterStatus
}

export function PhaseConnector({ chapter, status }: PhaseConnectorProps) {
  const color = getPhaseColor(chapter.order)

  let fillPct = 0
  if (status === "completed") {
    fillPct = 100
  } else if (status === "current") {
    const [done, total] = getChapterProgress(chapter).split("/").map(Number)
    fillPct = total > 0 ? (done / total) * 100 : 0
  }

  return (
    <div className="relative h-[2px] w-full rounded-[1px] bg-[var(--border-light)]">
      <motion.div
        className="absolute inset-y-0 left-0 rounded-[1px]"
        style={{ backgroundColor: color.main }}
        initial={{ width: 0 }}
        animate={{ width: fillPct + "%", opacity: fillPct > 0 ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 30 }}
      />
    </div>
  )
}
