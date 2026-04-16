import { cn } from '@/shared/lib/utils'

export type MeineAufgabenTab = 'unread' | 'kostenfreigabe' | 'freigabe' | 'empfehlungen'

interface TabCounts {
  unread: number
  kostenfreigabe: number
  freigabe: number
  empfehlungen: number
}

interface Props {
  active: MeineAufgabenTab
  onChange: (tab: MeineAufgabenTab) => void
  counts: TabCounts
  isAdmin?: boolean
}

const TAB_LABELS: Record<MeineAufgabenTab, string> = {
  unread: 'Warten auf Antwort',
  kostenfreigabe: 'Kostenfreigabe',
  freigabe: 'Warten auf Freigabe',
  empfehlungen: 'Empfehlungen',
}

export const TAB_ORDER: MeineAufgabenTab[] = ['unread', 'kostenfreigabe', 'freigabe', 'empfehlungen']

export function MeineAufgabenFilters({ active, onChange, counts, isAdmin = false }: Props) {
  const visibleTabs = TAB_ORDER.filter(tab => tab !== 'empfehlungen' || isAdmin)
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
      {visibleTabs.map(tab => {
        const isActive = active === tab
        const count = counts[tab]
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-full border transition-colors cursor-pointer whitespace-nowrap',
              isActive
                ? 'bg-accent text-white border-accent'
                : 'bg-surface border-border text-text-secondary hover:border-accent hover:text-accent',
            )}
          >
            {TAB_LABELS[tab]}
            <span
              className={cn(
                'min-w-[16px] h-[16px] px-1 rounded-full text-2xs font-bold flex items-center justify-center',
                isActive ? 'bg-white/25 text-white' : 'bg-surface-raised text-text-tertiary',
              )}
            >
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
