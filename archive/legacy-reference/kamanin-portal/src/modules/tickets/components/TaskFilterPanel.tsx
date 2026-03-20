import { useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { PriorityIcon } from './PriorityIcon'
import { PRIORITY_LABELS } from '../lib/status-dictionary'
import { cn } from '@/shared/lib/utils'

export interface ActiveFilters {
  priorities: string[]
  datePreset: string | null
}

interface Props {
  open: boolean
  activeFilters: ActiveFilters
  onChange: (f: ActiveFilters) => void
  onClose: () => void
}

const PRIORITY_OPTIONS = ['urgent', 'high', 'normal', 'low']

const DATE_PRESETS = [
  { value: 'overdue', label: 'Überfällig' },
  { value: '1day',    label: 'In 1 Tag' },
  { value: '3days',   label: 'In 3 Tagen' },
  { value: '1week',   label: 'In 1 Woche' },
  { value: '1month',  label: 'In 1 Monat' },
  { value: '3months', label: 'In 3 Monaten' },
  { value: 'nodue',   label: 'Kein Datum' },
]

export function TaskFilterPanel({ open, activeFilters, onChange, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, onClose])

  if (!open) return null

  function togglePriority(p: string) {
    const next = activeFilters.priorities.includes(p)
      ? activeFilters.priorities.filter(x => x !== p)
      : [...activeFilters.priorities, p]
    onChange({ ...activeFilters, priorities: next })
  }

  function setDatePreset(v: string) {
    onChange({ ...activeFilters, datePreset: activeFilters.datePreset === v ? null : v })
  }

  function clearAll() {
    onChange({ priorities: [], datePreset: null })
  }

  const hasAny = activeFilters.priorities.length > 0 || activeFilters.datePreset !== null

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-20 w-64 bg-surface border border-border rounded-[var(--r-md)] shadow-lg py-1"
    >
      {/* Priority section */}
      <div className="px-3 pt-2 pb-1">
        <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wide mb-2">Priorität</p>
        {PRIORITY_OPTIONS.map(p => {
          const checked = activeFilters.priorities.includes(p)
          return (
            <button
              key={p}
              onClick={() => togglePriority(p)}
              className={cn(
                'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-[var(--r-sm)] text-[13px] transition-colors',
                checked ? 'bg-accent/10 text-accent' : 'hover:bg-surface-raised text-text-secondary'
              )}
            >
              <span className={cn(
                'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                checked ? 'bg-accent border-accent' : 'border-border'
              )}>
                {checked && <X size={10} className="text-white" />}
              </span>
              <PriorityIcon priority={p} size={13} />
              <span>{PRIORITY_LABELS[p] ?? p}</span>
            </button>
          )
        })}
      </div>

      <div className="h-px bg-border mx-3 my-1" />

      {/* Date preset section */}
      <div className="px-3 pt-1 pb-2">
        <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wide mb-2">Fälligkeitsdatum</p>
        {DATE_PRESETS.map(({ value, label }) => {
          const active = activeFilters.datePreset === value
          return (
            <button
              key={value}
              onClick={() => setDatePreset(value)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-[var(--r-sm)] text-[13px] transition-colors',
                active ? 'bg-accent/10 text-accent font-medium' : 'hover:bg-surface-raised text-text-secondary'
              )}
            >
              <span className={cn(
                'w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 transition-colors',
                active ? 'border-accent' : 'border-border'
              )}>
                {active && <span className="w-2 h-2 rounded-full bg-accent block" />}
              </span>
              {label}
            </button>
          )
        })}
      </div>

      {/* Clear button */}
      {hasAny && (
        <>
          <div className="h-px bg-border mx-3" />
          <div className="px-3 py-2">
            <button
              onClick={clearAll}
              className="w-full text-center text-[12px] text-text-tertiary hover:text-text-secondary transition-colors py-1"
            >
              Filter löschen
            </button>
          </div>
        </>
      )}
    </div>
  )
}
