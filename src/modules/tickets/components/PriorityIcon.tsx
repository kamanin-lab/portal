import { HugeiconsIcon } from '@hugeicons/react'
import { AlertCircleIcon } from '@hugeicons/core-free-icons'
import { PRIORITY_LABELS } from '../lib/status-dictionary'

interface PriorityIconProps {
  priority: string | null
  size?: number
  showLabel?: boolean
  className?: string
}

// Color styles per priority level using CSS custom properties
const PRIORITY_STYLE: Record<string, string> = {
  urgent: 'var(--priority-urgent)',
  high:   'var(--priority-high)',
  normal: 'var(--priority-normal)',
  low:    'var(--priority-low)',
}

// Volume-style bar count per priority
const BAR_COUNT: Record<string, number> = {
  high:   3,
  normal: 2,
  low:    1,
}

// Volume-bar icon: ascending bars like a volume indicator
function VolumeIcon({ size, barCount }: { size: number; barCount: number }) {
  const w = size
  const h = size
  const barW = Math.max(2, Math.round(w * 0.22))
  const gap = Math.max(1, Math.round(w * 0.1))
  // Bars are left-aligned within the viewBox
  const maxBars = 3
  const heights = [0.35, 0.65, 1.0] // ascending height ratios

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      {Array.from({ length: maxBars }, (_, i) => {
        const active = i < barCount
        const bh = Math.round(h * heights[i])
        const x = i * (barW + gap)
        const y = h - bh
        return (
          <rect
            key={i}
            x={x} y={y} width={barW} height={bh} rx={1}
            fill="currentColor"
            opacity={active ? 1 : 0.15}
          />
        )
      })}
    </svg>
  )
}

export function PriorityIcon({ priority, size = 14, showLabel = false, className = '' }: PriorityIconProps) {
  const key = priority?.toLowerCase() ?? null
  const color = key ? (PRIORITY_STYLE[key] ?? 'var(--text-tertiary)') : 'var(--text-tertiary)'
  const label = key ? (PRIORITY_LABELS[key] ?? key) : null

  let icon: React.ReactNode

  if (!key) {
    icon = (
      <span
        className="font-bold leading-none select-none"
        style={{ fontSize: size * 0.75, letterSpacing: '-0.05em' }}
      >
        ---
      </span>
    )
  } else if (key === 'urgent') {
    icon = <HugeiconsIcon icon={AlertCircleIcon} size={size} />
  } else if (BAR_COUNT[key]) {
    icon = <VolumeIcon size={size} barCount={BAR_COUNT[key]} />
  } else {
    icon = <VolumeIcon size={size} barCount={1} />
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`} style={{ color }}>
      {icon}
      {showLabel && label && (
        <span className="text-xxs font-medium leading-none">{label}</span>
      )}
    </span>
  )
}
