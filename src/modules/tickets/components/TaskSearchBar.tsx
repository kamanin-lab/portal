import { Search, X } from 'lucide-react'
import { Input } from '@/shared/components/ui/input'
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
      <Input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Aufgaben suchen..."
        className="pl-8 pr-8 rounded-[var(--r-md)]"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2.5 text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
