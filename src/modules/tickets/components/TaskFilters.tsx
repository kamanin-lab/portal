import { useState, useRef, useEffect } from 'react'
import { ChevronDown, AlertCircle, Circle, PlayCircle, Clock, CheckCircle2, CheckCheck, PauseCircle, XCircle, Layers } from 'lucide-react'
import { mapStatus } from '../lib/status-mapping'
import { STATUS_LABELS } from '../lib/status-dictionary'
import { cn } from '@/shared/lib/utils'
import type { ClickUpTask } from '../types/tasks'

export type TaskFilter = 'all' | 'attention' | 'ready' | 'open' | 'in_progress' | 'approved' | 'done' | 'on_hold' | 'cancelled'

interface Props {
  active: TaskFilter
  onChange: (f: TaskFilter) => void
  tasks: ClickUpTask[]
}

function countByFilter(tasks: ClickUpTask[], filter: TaskFilter): number {
  return tasks.filter(t => {
    const s = mapStatus(t.status)
    switch (filter) {
      case 'attention':   return s === 'needs_attention' || s === 'awaiting_approval'
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

const PRIMARY_FILTERS: TaskFilter[] = ['attention', 'open', 'ready', 'in_progress', 'approved', 'done']
const MORE_FILTERS: TaskFilter[] = ['on_hold', 'cancelled', 'all']

const FILTER_LABELS: Record<TaskFilter, string> = {
  all:         STATUS_LABELS.all,
  attention:   STATUS_LABELS.needs_attention,
  ready:       STATUS_LABELS.ready,
  open:        STATUS_LABELS.open,
  in_progress: STATUS_LABELS.in_progress,
  approved:    STATUS_LABELS.approved,
  done:        STATUS_LABELS.done,
  on_hold:     STATUS_LABELS.on_hold,
  cancelled:   STATUS_LABELS.cancelled,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STATUS_ICONS: Partial<Record<TaskFilter, React.ComponentType<any>>> = {
  attention:   AlertCircle,
  ready:       PlayCircle,
  open:        Circle,
  in_progress: Clock,
  approved:    CheckCircle2,
  done:        CheckCheck,
  on_hold:     PauseCircle,
  cancelled:   XCircle,
  all:         Layers,
}

export function TaskFilters({ active, onChange, tasks }: Props) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

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

  function chipClass(isActive: boolean, isAttention: boolean) {
    return cn(
      'flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium rounded-full border transition-colors cursor-pointer whitespace-nowrap',
      isActive && isAttention
        ? 'bg-amber-500 text-white border-amber-500'
        : isActive
        ? 'bg-accent text-white border-accent'
        : 'bg-surface border-border text-text-secondary hover:border-accent hover:text-accent'
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Scrollable chips — overflow only on this inner container */}
      <div className="flex items-center gap-1.5 max-[768px]:overflow-x-auto max-[768px]:flex-nowrap flex-wrap flex-1 min-w-0" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
        {PRIMARY_FILTERS.map(f => {
          const count = countByFilter(tasks, f)
          const isActive = active === f
          const isAttention = f === 'attention'
          const Icon = STATUS_ICONS[f]
          return (
            <button
              key={f}
              onClick={() => onChange(f)}
              className={chipClass(isActive, isAttention)}
            >
              {Icon && <Icon size={11} />}
              {FILTER_LABELS[f]}
              <span className={cn(
                'min-w-[16px] h-[16px] px-[4px] rounded-full text-[10px] font-bold flex items-center justify-center',
                isActive ? 'bg-white/25 text-white' : 'bg-surface-raised text-text-tertiary'
              )}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Mehr dropdown — outside scroll container so it's not clipped */}
      <div ref={moreRef} className="relative shrink-0">
        <button
          onClick={() => setMoreOpen(v => !v)}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium rounded-full border transition-colors cursor-pointer whitespace-nowrap',
            MORE_FILTERS.includes(active)
              ? 'bg-accent text-white border-accent'
              : 'bg-surface border-border text-text-secondary hover:border-accent hover:text-accent'
          )}
        >
          Mehr
          <ChevronDown size={11} className={cn('transition-transform duration-200', moreOpen && 'rotate-180')} />
        </button>
        {moreOpen && (
          <div className="absolute top-full right-0 mt-1 w-44 bg-surface border border-border rounded-[var(--r-md)] shadow-md z-10 py-1">
            {MORE_FILTERS.map(f => {
              const count = countByFilter(tasks, f)
              const Icon = STATUS_ICONS[f]
              return (
                <button
                  key={f}
                  onClick={() => { onChange(f); setMoreOpen(false) }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-surface-raised transition-colors',
                    active === f ? 'text-accent font-medium' : 'text-text-secondary'
                  )}
                >
                  {Icon && <Icon size={13} />}
                  <span className="flex-1 text-left">{FILTER_LABELS[f]}</span>
                  <span className="text-[11px] text-text-tertiary">{count}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
