import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useOrg } from '@/shared/hooks/useOrg'

export interface CreditTransaction {
  id: string
  amount: number
  type: 'monthly_topup' | 'task_deduction' | 'manual_adjustment'
  task_id: string | null
  task_name: string | null
  description: string | null
  created_at: string
  profile_id: string
}

export interface MonthGroup {
  month: string   // "2026-03"
  label: string   // "März 2026"
  items: CreditTransaction[]
  totalSpent: number
  totalAdded: number
}

const MONTH_NAMES_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

const INITIAL_MONTHS = 3

function groupByMonth(transactions: CreditTransaction[]): MonthGroup[] {
  const map = new Map<string, CreditTransaction[]>()

  for (const tx of transactions) {
    const d = new Date(tx.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const list = map.get(key) ?? []
    list.push(tx)
    map.set(key, list)
  }

  // Sort months descending
  const sorted = [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))

  return sorted.map(([month, items]) => {
    const [y, m] = month.split('-').map(Number)
    const label = `${MONTH_NAMES_DE[m - 1]} ${y}`
    const totalSpent = items.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)
    const totalAdded = items.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    return { month, label, items, totalSpent, totalAdded }
  })
}

export function useOrgCreditHistory() {
  const { organization } = useOrg()
  const [visibleCount, setVisibleCount] = useState(INITIAL_MONTHS)

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['credit-history-org', organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('id, amount, type, task_id, task_name, description, created_at, profile_id')
        .eq('organization_id', organization!.id)
        .neq('amount', 0)
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) {
        console.warn('[CreditHistory] fetch error:', error.message)
        return []
      }
      return data as CreditTransaction[]
    },
    enabled: !!organization?.id,
    staleTime: 1000 * 60 * 2,
  })

  const allMonths = useMemo(() => groupByMonth(transactions), [transactions])
  const months = allMonths.slice(0, visibleCount)
  const hasMore = allMonths.length > visibleCount

  function loadMore() {
    setVisibleCount(c => c + 3)
  }

  return { months, hasMore, loadMore, isLoading }
}
