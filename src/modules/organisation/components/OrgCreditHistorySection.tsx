import { useState, useMemo } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { FlashIcon, Add01Icon, MinusSignIcon, ArrowUpRight01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { useCredits } from '@/modules/tickets/hooks/useCredits'
import { useOrgCreditHistory } from '@/modules/organisation/hooks/useOrgCreditHistory'
import { TaskDetailSheet } from '@/modules/tickets/components/TaskDetailSheet'
import { CollapsibleRow } from '@/shared/components/common/CollapsibleRow'
import { TransactionTypeFilter } from '@/modules/organisation/components/TransactionTypeFilter'
import { matchesTypeFilter } from '@/modules/organisation/lib/transaction-filters'
import type { TxTypeFilter } from '@/modules/organisation/lib/transaction-filters'
import { Input } from '@/shared/components/ui/input'
import type { CreditTransaction, YearGroup } from '@/modules/organisation/hooks/useOrgCreditHistory'
import { cn } from '@/shared/lib/utils'

function formatAmount(amount: number): string {
  const abs = Math.abs(amount)
  return abs % 1 === 0 ? String(abs) : abs.toFixed(1)
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`
}

function getBalanceColor(balance: number, creditsPerMonth: number | null): string {
  if (balance < 0) return 'text-credit-low'
  if (!creditsPerMonth || creditsPerMonth <= 0) return 'text-text-secondary'
  const ratio = balance / creditsPerMonth
  if (ratio > 0.5) return 'text-credit-ok'
  if (ratio >= 0.2) return 'text-credit-warn'
  return 'text-credit-low'
}

function TotalsBadge({ spent, added }: { spent: number; added: number }) {
  if (spent === 0 && added === 0) return <span className="text-xxs text-text-tertiary tabular-nums">&mdash;</span>
  return (
    <span className="flex items-center gap-2 text-xxs tabular-nums">
      {spent < 0 && <span className="text-credit-low">&minus;{formatAmount(spent)}</span>}
      {added > 0 && <span className="text-credit-ok">+{formatAmount(added)}</span>}
    </span>
  )
}

function TransactionRow({ tx, onTaskClick }: { tx: CreditTransaction; onTaskClick: (taskId: string) => void }) {
  const isPositive = tx.amount > 0
  let label: string
  if (tx.type === 'monthly_topup') {
    label = 'Monatliche Gutschrift'
  } else if (tx.type === 'task_deduction' && tx.task_name) {
    label = tx.task_name
  } else {
    label = tx.description ?? 'Anpassung'
  }
  const canClick = tx.type === 'task_deduction' && tx.task_id

  return (
    <div
      className={cn(
        'flex items-center gap-2 py-2 px-1 rounded-[6px] transition-colors',
        canClick && 'hover:bg-surface-hover cursor-pointer'
      )}
      onClick={() => canClick && onTaskClick(tx.task_id!)}
    >
      <div className={cn(
        'w-5 h-5 rounded-full flex items-center justify-center shrink-0',
        isPositive ? 'bg-credit-ok/10' : 'bg-credit-low/10'
      )}>
        {isPositive
          ? <HugeiconsIcon icon={Add01Icon} size={12} className="text-credit-ok" />
          : <HugeiconsIcon icon={MinusSignIcon} size={12} className="text-credit-low" />
        }
      </div>
      <span className="flex-1 text-sm text-text-primary truncate">{label}</span>
      {canClick && (
        <HugeiconsIcon icon={ArrowUpRight01Icon} size={12} className="text-text-tertiary shrink-0" />
      )}
      <span className={cn(
        'text-sm font-medium tabular-nums shrink-0',
        isPositive ? 'text-credit-ok' : 'text-credit-low'
      )}>
        {isPositive ? '+' : '-'}{formatAmount(tx.amount)}
      </span>
      <span className="text-xxs text-text-tertiary w-12 text-right shrink-0">
        {formatDate(tx.created_at)}
      </span>
    </div>
  )
}

function TransactionList({ years, hasActiveFilter, onTaskClick }: {
  years: YearGroup[]
  hasActiveFilter: boolean
  onTaskClick: (taskId: string) => void
}) {
  return (
    <div className="mt-3 space-y-1">
      {years.map(year => (
        <CollapsibleRow
          key={year.year}
          defaultOpen={year.isCurrent}
          forceOpen={hasActiveFilter}
          header={
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm font-semibold text-text-primary">
                {year.label}
                {year.isCurrent && (
                  <span className="ml-1.5 text-xxs font-normal text-text-tertiary">(aktuell)</span>
                )}
              </span>
              <TotalsBadge spent={year.totalSpent} added={year.totalAdded} />
            </div>
          }
        >
          <div className="ml-4 space-y-0.5">
            {year.months.map(month => (
              <CollapsibleRow
                key={month.month}
                defaultOpen={month.isCurrent}
                forceOpen={hasActiveFilter}
                header={
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs font-medium text-text-secondary">
                      {month.shortLabel}
                      {month.isCurrent && (
                        <span className="ml-1 text-xxs font-normal text-text-tertiary">(aktuell)</span>
                      )}
                    </span>
                    <TotalsBadge spent={month.totalSpent} added={month.totalAdded} />
                  </div>
                }
              >
                <div className="border-t border-border/50 ml-1">
                  {month.items.map(tx => (
                    <TransactionRow key={tx.id} tx={tx} onTaskClick={onTaskClick} />
                  ))}
                </div>
              </CollapsibleRow>
            ))}
          </div>
        </CollapsibleRow>
      ))}
    </div>
  )
}

export function OrgCreditHistorySection() {
  const { balance, packageName, creditsPerMonth, isLoading: balanceLoading } = useCredits()
  const { years, allTransactions, isLoading: historyLoading } = useOrgCreditHistory()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<TxTypeFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const hasActiveFilter = typeFilter !== 'all' || searchQuery.trim().length > 0

  const filterCounts = useMemo(() => {
    const txs = allTransactions
    return {
      all: txs.length,
      credits: txs.filter(tx => matchesTypeFilter(tx, 'credits')).length,
      debits: txs.filter(tx => matchesTypeFilter(tx, 'debits')).length,
      adjustments: txs.filter(tx => matchesTypeFilter(tx, 'adjustments')).length,
    }
  }, [allTransactions])

  const filteredYears = useMemo(() => {
    if (!hasActiveFilter) return years
    const q = searchQuery.trim().toLowerCase()
    return years
      .map(year => ({
        ...year,
        months: year.months
          .map(month => ({
            ...month,
            items: month.items.filter(tx => {
              if (!matchesTypeFilter(tx, typeFilter)) return false
              if (!q) return true
              const hay = [
                tx.task_name ?? '',
                tx.description ?? '',
                tx.type === 'monthly_topup' ? 'Monatliche Gutschrift' : '',
              ].join(' ').toLowerCase()
              return hay.includes(q)
            }),
          }))
          .filter(m => m.items.length > 0),
      }))
      .filter(y => y.months.length > 0)
  }, [years, typeFilter, searchQuery, hasActiveFilter])

  if (balanceLoading) return null

  const balanceColor = getBalanceColor(balance, creditsPerMonth)
  const displayBalance = balance % 1 === 0 ? String(balance) : balance.toFixed(1)

  return (
    <>
      <section id="guthaben" className="bg-surface rounded-[14px] border border-border p-5">
        {/* Balance header — unchanged */}
        <div className="flex items-center gap-2 mb-1">
          <HugeiconsIcon icon={FlashIcon} size={18} className={balanceColor} />
          <h2 className="text-base font-semibold text-text-primary">Guthaben</h2>
        </div>
        <div className="flex items-baseline gap-2 mb-4">
          <span className={cn('text-2xl font-bold', balanceColor)}>
            {displayBalance}
          </span>
          <span className="text-sm text-text-secondary">
            Credits {balance < 0 ? 'überzogen' : 'verfügbar'}
          </span>
          <span className="text-xxs text-text-tertiary ml-auto">
            {packageName
              ? `${packageName} · ${creditsPerMonth}/Monat`
              : 'Kein aktives Paket'}
          </span>
        </div>

        {historyLoading ? (
          <div className="py-6 text-center text-sm text-text-tertiary">Laden...</div>
        ) : years.length === 0 ? (
          <div className="py-6 text-center text-sm text-text-tertiary">
            Noch keine Transaktionen vorhanden.
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="relative mb-2">
              <HugeiconsIcon
                icon={Search01Icon}
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
              />
              <Input
                aria-label="Transaktionen durchsuchen"
                placeholder="Nach Aufgabe oder Beschreibung suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Type filter chips */}
            <TransactionTypeFilter active={typeFilter} onChange={setTypeFilter} counts={filterCounts} />

            {/* Accordion list */}
            {filteredYears.length === 0 ? (
              <div className="py-6 text-center text-sm text-text-tertiary">
                Keine Transaktionen gefunden.
              </div>
            ) : (
              <TransactionList
                years={filteredYears}
                hasActiveFilter={hasActiveFilter}
                onTaskClick={setSelectedTaskId}
              />
            )}
          </>
        )}
      </section>

      <TaskDetailSheet
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
      />
    </>
  )
}
