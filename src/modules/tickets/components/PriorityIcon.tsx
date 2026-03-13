import { AlertCircle } from 'lucide-react'
import { PRIORITY_LABELS } from '../lib/status-dictionary'

interface PriorityIconProps {
  priority: string | null
  size?: number
  showLabel?: boolean
  className?: string
}

// Color classes per priority level
const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'text-red-500',
  high:   'text-orange-500',
  normal: 'text-sky-500',
  low:    'text-text-tertiary',
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
            fill={active ? 'currentColor' : 'currentColor'}
            opacity={active ? 1 : 0.15}
          />
        )
      })}
    </svg>
  )
}

export function PriorityIcon({ priority, size = 14, showLabel = false, className = '' }: PriorityIconProps) {
  const key = priority?.toLowerCase() ?? null
  const colorClass = key ? (PRIORITY_COLOR[key] ?? 'text-text-tertiary') : 'text-text-tertiary'
  const label = key ? (PRIORITY_LABELS[key] ?? key) : null

  let icon: React.ReactNode

  if (!key) {
    icon = (
      <span
        className="font-bold leading-none select-none"
        style={{ fontSize: size * 0.75, letterSpacing: '-0.05em' }}
      >
        –––
      </span>
    )
  } else if (key === 'urgent') {
    icon = <AlertCircle size={size} />
  } else if (BAR_COUNT[key]) {
    icon = <VolumeIcon size={size} barCount={BAR_COUNT[key]} />
  } else {
    icon = <VolumeIcon size={size} barCount={1} />
  }

  return (
    <span className={`inline-flex items-center gap-1 ${colorClass} ${className}`}>
      {icon}
      {showLabel && label && (
        <span className="text-[11px] font-medium leading-none">{label}</span>
      )}
    </span>
  )
}
