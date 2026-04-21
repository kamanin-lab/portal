import type { CreditTransaction } from '@/modules/organisation/hooks/useOrgCreditHistory'

export type TxTypeFilter = 'all' | 'credits' | 'debits' | 'adjustments'

export function matchesTypeFilter(tx: CreditTransaction, filter: TxTypeFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'credits':
      return tx.type === 'monthly_topup' || (tx.type === 'manual_adjustment' && tx.amount > 0)
    case 'debits':
      return tx.type === 'task_deduction' || (tx.type === 'manual_adjustment' && tx.amount < 0)
    case 'adjustments':
      return tx.type === 'manual_adjustment'
  }
}
