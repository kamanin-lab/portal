import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { FlashIcon, Add01Icon, MinusSignIcon, ArrowUpRight01Icon, ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { useCredits } from '@/modules/tickets/hooks/useCredits'
import { useOrgCreditHistory } from '@/modules/organisation/hooks/useOrgCreditHistory'
import { TaskDetailSheet } from '@/modules/tickets/components/TaskDetailSheet'
import type { CreditTransaction, MonthGroup } from '@/modules/organisation/hooks/useOrgCreditHistory'
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

      <span className="flex-1 text-sm text-text-primary truncate">
        {label}
      </span>

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

function MonthSection({ group, onTaskClick }: { group: MonthGroup; onTaskClick: (taskId: string) => void }) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
          {group.label}
        </span>
        <span className="text-xxs text-text-tertiary">
          {group.totalSpent !== 0 && `${group.totalSpent > 0 ? '+' : ''}${group.totalSpent % 1 === 0 ? group.totalSpent : group.totalSpent.toFixed(1)}`}
          {group.totalAdded > 0 && group.totalSpent !== 0 && ' / '}
          {group.totalAdded > 0 && `+${formatAmount(group.totalAdded)}`}
        </span>
      </div>
      <div className="border-t border-border/50">
        {group.items.map(tx => (
          <TransactionRow key={tx.id} tx={tx} onTaskClick={onTaskClick} />
        ))}
      </div>
    </div>
  )
}

export function OrgCreditHistorySection() {
  const { balance, packageName, creditsPerMonth, isLoading: balanceLoading } = useCredits()
  const { months, hasMore, loadMore, isLoading: historyLoading } = useOrgCreditHistory()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  if (balanceLoading) return null

  const balanceColor = getBalanceColor(balance, creditsPerMonth)
  const displayBalance = balance % 1 === 0 ? String(balance) : balance.toFixed(1)

  return (
    <>
      <section id="guthaben" className="bg-surface rounded-[14px] border border-border p-5">
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
        ) : months.length === 0 ? (
          <div className="py-6 text-center text-sm text-text-tertiary">
            Noch keine Transaktionen vorhanden.
          </div>
        ) : (
          <>
            {months.map(group => (
              <MonthSection key={group.month} group={group} onTaskClick={setSelectedTaskId} />
            ))}

            {hasMore && (
              <button
                onClick={loadMore}
                className="flex items-center gap-1 mx-auto mt-4 text-xs text-accent hover:text-accent/80 transition-colors cursor-pointer"
              >
                <HugeiconsIcon icon={ArrowDown01Icon} size={14} />
                Weitere laden
              </button>
            )}
          </>
        )}
      </section>

      {/* Task detail sheet — opens in-place, no navigation */}
      <TaskDetailSheet
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
      />
    </>
  )
}
