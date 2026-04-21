import type { TxTypeFilter } from '@/modules/organisation/lib/transaction-filters'
import { cn } from '@/shared/lib/utils'

interface TransactionTypeFilterProps {
  active: TxTypeFilter
  onChange: (f: TxTypeFilter) => void
  counts: Record<TxTypeFilter, number>
}

const FILTERS: { key: TxTypeFilter; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'credits', label: 'Gutschriften' },
  { key: 'debits', label: 'Abzüge' },
  { key: 'adjustments', label: 'Anpassungen' },
]

export function TransactionTypeFilter({ active, onChange, counts }: TransactionTypeFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {FILTERS.map(({ key, label }) => {
        const isActive = active === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-full border transition-colors cursor-pointer whitespace-nowrap',
              isActive
                ? 'bg-accent text-white border-accent'
                : 'bg-surface border-border text-text-secondary hover:border-accent hover:text-accent'
            )}
          >
            {label}
            <span
              className={cn(
                'min-w-[16px] h-[16px] px-1 rounded-full text-2xs font-bold flex items-center justify-center',
                isActive
                  ? 'bg-white/20 text-white'
                  : 'bg-border/50 text-text-tertiary'
              )}
            >
              {counts[key]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
