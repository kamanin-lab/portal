import { HugeiconsIcon } from '@hugeicons/react'
import { Search01Icon, MultiplicationSignIcon } from '@hugeicons/core-free-icons'
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
      <HugeiconsIcon icon={Search01Icon} size={14} className="absolute left-3 text-text-tertiary pointer-events-none" />
      <Input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Aufgaben suchen..."
        className="pl-8 pr-8 rounded-[var(--r-md)] !text-xxs"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2.5 text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
        >
          <HugeiconsIcon icon={MultiplicationSignIcon} size={14} />
        </button>
      )}
    </div>
  )
}
