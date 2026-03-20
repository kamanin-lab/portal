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

// Bar SVG icon: 3 bottom-aligned vertical bars
// height arrays [left, middle, right] in proportion 0–1 of full height
const BAR_HEIGHTS: Record<string, [number, number, number]> = {
  high:   [1, 1, 1],          // all full
  normal: [0.5, 1, 0.5],      // center tall
  low:    [0.4, 0.4, 0.4],    // all short
}

function BarIcon({ size, heights }: { size: number; heights: [number, number, number] }) {
  const w = size
  const h = size
  const barW = Math.max(2, Math.round(w * 0.22))
  const gap = Math.max(1, Math.round(w * 0.1))
  const totalW = barW * 3 + gap * 2
  const offsetX = (w - totalW) / 2

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="currentColor" aria-hidden>
      {heights.map((ratio, i) => {
        const bh = Math.round(h * ratio)
        const x = offsetX + i * (barW + gap)
        const y = h - bh
        return <rect key={i} x={x} y={y} width={barW} height={bh} rx={1} />
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
  } else if (BAR_HEIGHTS[key]) {
    icon = <BarIcon size={size} heights={BAR_HEIGHTS[key]} />
  } else {
    // fallback for unknown priority
    icon = <BarIcon size={size} heights={[0.4, 0.4, 0.4]} />
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
