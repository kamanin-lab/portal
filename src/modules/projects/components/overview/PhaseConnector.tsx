import { motion } from "motion/react"
import type { Chapter } from "../../types/project"
import { getChapterProgress } from "../../lib/helpers"
import { getPhaseColor } from "../../lib/phase-colors"

interface PhaseConnectorProps {
  chapter: Chapter
  prevChapterOrder: number
}

export function PhaseConnector({ chapter, prevChapterOrder }: PhaseConnectorProps) {
  const [done, total] = getChapterProgress(chapter).split("/").map(Number)
  const fillPct = total > 0 ? (done / total) * 100 : 0
  const color = getPhaseColor(prevChapterOrder)

  return (
    <div className="relative w-[28px] h-[2px] bg-[var(--border)] opacity-40 rounded-[1px] flex-shrink-0">
      <motion.div
        className="absolute top-0 left-0 h-full rounded-[1px]"
        style={{ backgroundColor: color.main }}
        initial={{ width: 0 }}
        animate={{ width: fillPct + "%", opacity: fillPct > 0 ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 30 }}
      />
    </div>
  )
}
