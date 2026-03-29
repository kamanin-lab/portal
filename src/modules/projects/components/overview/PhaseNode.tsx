import { motion, AnimatePresence } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Idea01Icon, PaintBrush01Icon, CodeIcon, Rocket01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons"
import type { Chapter, ChapterStatus } from "../../types/project"
import { getChapterProgress } from "../../lib/helpers"
import { getPhaseColor } from "../../lib/phase-colors"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/shared/components/ui/tooltip"

const PHASE_ICONS = [Idea01Icon, PaintBrush01Icon, CodeIcon, Rocket01Icon] as const

interface PhaseNodeProps {
  chapter: Chapter
  status: ChapterStatus
  onClick?: () => void
  showTooltip?: boolean
}

export function PhaseNode({ chapter, status, onClick, showTooltip = true }: PhaseNodeProps) {
  const color = getPhaseColor(chapter.order)
  const progress = getChapterProgress(chapter)
  const stateLabel = status === "completed" ? "Abgeschlossen" : status === "current" ? "Aktuell" : "Ausstehend"

  const content = (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-1.5 cursor-pointer py-1 pr-3"
    >
      {/* Indicator — fixed 32px container for consistent connector alignment */}
      <div className="relative flex items-center justify-center w-[32px] h-[32px] flex-shrink-0">
        {status === "current" && (
          <div
            className="absolute inset-[-3px] rounded-full animate-[phase-pulse_2.4s_ease-in-out_infinite]"
            style={{ backgroundColor: color.main }}
          />
        )}
        <div
          className={`relative flex items-center justify-center rounded-full border-2 ${
            status === "current" ? "w-[32px] h-[32px]" : "w-[28px] h-[28px]"
          }`}
          style={{
            backgroundColor: status === "completed" ? "var(--committed)" : status === "current" ? color.main : "var(--surface)",
            borderColor: status === "completed" ? "var(--committed)" : status === "current" ? color.main : "var(--border)",
          }}
        >
          {status === "completed" ? (
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} color="white" />
          ) : (
            <HugeiconsIcon
              icon={PHASE_ICONS[(chapter.order - 1) % PHASE_ICONS.length]}
              size={14}
              color={status === "current" ? "white" : "var(--text-tertiary)"}
              style={status === "upcoming" ? { opacity: 0.5 } : undefined}
            />
          )}
        </div>
      </div>

      {/* Text */}
      <div className="flex flex-col items-start">
        <span
          className={`text-sm font-semibold leading-tight whitespace-nowrap ${
            status === "completed" ? "text-[var(--text-primary)]" :
            status === "current" ? "font-bold" : "text-[var(--text-tertiary)] font-[450]"
          }`}
          style={status === "current" ? { color: color.text } : undefined}
        >
          {chapter.title}
        </span>
        <span
          className="text-2xs text-[var(--text-tertiary)] mt-0.5"
          style={status === "current" ? { color: color.text } : undefined}
        >
          {progress}
        </span>
        <AnimatePresence mode="wait">
          <motion.span
            key={stateLabel}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium mt-1.5"
            style={{
              backgroundColor: status === "completed" ? "rgba(5, 150, 105, 0.1)" :
                              status === "current" ? color.light : "var(--surface-hover)",
              color: status === "completed" ? "var(--committed)" :
                     status === "current" ? color.text : "var(--text-tertiary)",
            }}
          >
            {stateLabel}
          </motion.span>
        </AnimatePresence>
      </div>
    </button>
  )

  if (!showTooltip) return content

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{chapter.narrative}</p>
      </TooltipContent>
    </Tooltip>
  )
}
