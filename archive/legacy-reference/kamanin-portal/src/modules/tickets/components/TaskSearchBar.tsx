import { Search, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

interface Props {
  value: string
  onChange: (v: string) => void
  className?: string
}

export function TaskSearchBar({ value, onChange, className }: Props) {
  return (
    <div className={cn('relative flex items-center', className)}>
      <Search size={14} className="absolute left-3 text-text-tertiary pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Aufgaben suchen…"
        className="w-full pl-8 pr-8 py-2 text-[13px] bg-surface border border-border rounded-[var(--r-md)] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2.5 text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
