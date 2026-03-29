import { motion, AnimatePresence } from "motion/react"
import type { Chapter, ChapterStatus } from "../../types/project"
import { getChapterProgress } from "../../lib/helpers"
import { getPhaseColor } from "../../lib/phase-colors"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/shared/components/ui/tooltip"

interface PhaseNodeProps {
  chapter: Chapter
  status: ChapterStatus
  onClick?: () => void
  showTooltip?: boolean
}

export function PhaseNode({ chapter, status, onClick, showTooltip = true }: PhaseNodeProps) {
  const color = getPhaseColor(chapter.order)
  const progress = getChapterProgress(chapter)
  const stateLabel =
    status === "completed" ? "Abgeschlossen" :
    status === "current" ? "Aktuell" : ""

  const dotBase = "flex items-center justify-center flex-shrink-0 rounded-full border-[2.5px]"

  const dot = (
    <div className="relative flex items-center justify-center flex-shrink-0">
      {status === "current" && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: color.main, opacity: 0.3 }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.15, 0.3] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <motion.div
        layout
        className={`${dotBase} ${
          status === "completed"
            ? "w-[20px] h-[20px]"
            : status === "current"
            ? "w-[24px] h-[24px]"
            : "w-[20px] h-[20px]"
        }`}
        animate={{
          backgroundColor:
            status === "completed"
              ? "var(--committed)"
              : status === "current"
              ? color.main
              : "var(--surface)",
          borderColor:
            status === "completed"
              ? "var(--committed)"
              : status === "current"
              ? color.main
              : "var(--border)",
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        {status === "completed" && (
          <span className="text-3xs text-white font-bold leading-none">✓</span>
        )}
        {status === "current" && (
          <span className="block w-[8px] h-[8px] rounded-full bg-white" />
        )}
        {status === "upcoming" && (
          <span className="text-2xs font-semibold text-[var(--text-tertiary)] opacity-50 leading-none">–</span>
        )}
      </motion.div>
    </div>
  )

  const nodeContent = (
    <>
      {dot}
      <div className="flex flex-col gap-0">
        <span
          className={`text-body font-semibold leading-[1.3] ${
            status === "completed"
              ? "text-[var(--text-primary)]"
              : status === "current"
              ? "font-bold"
              : "text-[var(--text-tertiary)] font-[450]"
          }`}
          style={status === "current" ? { color: color.text } : undefined}
        >
          {chapter.title}
        </span>
        <span
          className="text-2xs mt-0.5 text-[var(--text-tertiary)]"
          style={status === "current" ? { color: color.text } : undefined}
        >
          {progress}
        </span>
        <AnimatePresence mode="wait">
          {stateLabel && (
            <motion.span
              key={stateLabel}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2 }}
              className="text-2xs font-semibold tracking-[0.03em] mt-0.5"
              style={{ color: status === "completed" ? "var(--committed)" : color.main }}
            >
              {stateLabel}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </>
  )

  const button = (
    <button
      onClick={onClick}
      className="phase-node flex-1 flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--r-sm)] transition-all duration-[180ms] cursor-pointer border border-transparent"
      style={
        status === "current"
          ? {
              background: color.light,
              border: `1px solid ${color.mid}`,
              margin: "-1px 0",
            }
          : undefined
      }
    >
      {nodeContent}
    </button>
  )

  if (!showTooltip) return button

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{chapter.narrative}</p>
      </TooltipContent>
    </Tooltip>
  )
}
