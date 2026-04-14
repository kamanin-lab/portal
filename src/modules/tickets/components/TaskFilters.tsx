import { useState, useRef, useEffect } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import {
  ArrowDown01Icon, CircleIcon, PlayCircleIcon, Clock01Icon,
  CheckmarkCircle02Icon, TickDouble01Icon, PauseCircleIcon, CancelCircleIcon, Layers01Icon,
} from '@hugeicons/core-free-icons'
import { mapStatus } from '../lib/status-mapping'
import { STATUS_LABELS } from '../lib/status-dictionary'
import { useBreakpoint } from '@/shared/hooks/useBreakpoint'
import { cn } from '@/shared/lib/utils'
import type { ClickUpTask } from '../types/tasks'

export type TaskFilter = 'all' | 'ready' | 'open' | 'in_progress' | 'approved' | 'done' | 'on_hold' | 'cancelled'

interface Props {
  active: TaskFilter
  onChange: (f: TaskFilter) => void
  tasks: ClickUpTask[]
}

function isRecommendation(task: ClickUpTask): boolean {
  return task.tags?.some(tag => tag.name.toLowerCase() === 'recommendation') ?? false
}

function countByFilter(tasks: ClickUpTask[], filter: TaskFilter): number {
  return tasks.filter(t => !isRecommendation(t)).filter(t => {
    const s = mapStatus(t.status)
    switch (filter) {
      case 'ready':       return s === 'ready'
      case 'open':        return s === 'open'
      case 'in_progress': return s === 'in_progress'
      case 'approved':    return s === 'approved'
      case 'done':        return s === 'done'
      case 'on_hold':     return s === 'on_hold'
      case 'cancelled':   return s === 'cancelled'
      default:            return true
    }
  }).length
}

const PRIMARY_FILTERS: TaskFilter[] = ['open', 'in_progress', 'ready', 'approved', 'done']
const MORE_FILTERS: TaskFilter[] = ['on_hold', 'cancelled', 'all']
const ALL_FILTERS: TaskFilter[] = [...PRIMARY_FILTERS, ...MORE_FILTERS]

const FILTER_LABELS: Record<TaskFilter, string> = {
  all:         STATUS_LABELS.all,
  ready:       STATUS_LABELS.ready,
  open:        STATUS_LABELS.open,
  in_progress: STATUS_LABELS.in_progress,
  approved:    STATUS_LABELS.approved,
  done:        STATUS_LABELS.done,
  on_hold:     STATUS_LABELS.on_hold,
  cancelled:   STATUS_LABELS.cancelled,
}

const STATUS_ICONS: Partial<Record<TaskFilter, IconSvgElement>> = {
  ready:       PlayCircleIcon,
  open:        CircleIcon,
  in_progress: Clock01Icon,
  approved:    CheckmarkCircle02Icon,
  done:        TickDouble01Icon,
  on_hold:     PauseCircleIcon,
  cancelled:   CancelCircleIcon,
  all:         Layers01Icon,
}

export function TaskFilters({ active, onChange, tasks }: Props) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const { isMobile } = useBreakpoint()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [])

  function chipClass(isActive: boolean) {
    return cn(
      'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-full border transition-colors cursor-pointer whitespace-nowrap',
      isActive
        ? 'bg-accent text-white border-accent'
        : 'bg-surface border-border text-text-secondary hover:border-accent hover:text-accent'
    )
  }

  // On mobile: dropdown shows all filters; on desktop: only secondary filters
  const dropdownFilters = isMobile ? ALL_FILTERS : MORE_FILTERS
  // Filter button is highlighted when a non-default filter is active
  const moreIsActive = isMobile ? active !== 'all' : MORE_FILTERS.includes(active)

  return (
    <div className="flex items-center gap-1.5">
      {/* Desktop: chip row (hidden on mobile) */}
      <div className="hidden min-[769px]:flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
        {PRIMARY_FILTERS.map(f => {
          const count = countByFilter(tasks, f)
          const isActive = active === f
          const Icon = STATUS_ICONS[f]
          return (
            <button
              key={f}
              onClick={() => onChange(f)}
              className={chipClass(isActive)}
            >
              {Icon && <HugeiconsIcon icon={Icon} size={11} />}
              {FILTER_LABELS[f]}
              <span className={cn(
                'min-w-[16px] h-[16px] px-1 rounded-full text-2xs font-bold flex items-center justify-center',
                isActive ? 'bg-white/25 text-white' : 'bg-surface-raised text-text-tertiary'
              )}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Mobile: show active filter label */}
      {isMobile && (
        <span className="text-xs text-text-secondary flex-1 truncate">
          {FILTER_LABELS[active]}
          <span className="ml-1 text-text-tertiary">({countByFilter(tasks, active)})</span>
        </span>
      )}

      {/* Mehr / Filter dropdown */}
      <div ref={moreRef} className="relative shrink-0">
        <button
          onClick={() => setMoreOpen(v => !v)}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-full border transition-colors cursor-pointer whitespace-nowrap',
            moreIsActive
              ? 'bg-accent text-white border-accent'
              : 'bg-surface border-border text-text-secondary hover:border-accent hover:text-accent'
          )}
        >
          {isMobile ? 'Weitere Status' : 'Mehr'}
          <HugeiconsIcon icon={ArrowDown01Icon} size={11} className={cn('transition-transform duration-200', moreOpen && 'rotate-180')} />
        </button>
        {moreOpen && (
          <div className="absolute top-full right-0 mt-1 w-48 bg-surface border border-border rounded-[var(--r-md)] shadow-md z-10 py-1">
            {dropdownFilters.map(f => {
              const count = countByFilter(tasks, f)
              const Icon = STATUS_ICONS[f]
              return (
                <button
                  key={f}
                  onClick={() => { onChange(f); setMoreOpen(false) }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-body hover:bg-surface-raised transition-colors',
                    active === f ? 'text-accent font-medium' : 'text-text-secondary'
                  )}
                >
                  {Icon && <HugeiconsIcon icon={Icon} size={13} />}
                  <span className="flex-1 text-left">{FILTER_LABELS[f]}</span>
                  <span className="text-xxs text-text-tertiary">{count}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
