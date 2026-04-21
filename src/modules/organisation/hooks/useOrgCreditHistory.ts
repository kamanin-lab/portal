import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
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
  month: string        // "2026-04"
  year: number
  monthIndex: number   // 0-11
  label: string        // "April 2026"
  shortLabel: string   // "April"
  items: CreditTransaction[]
  totalSpent: number   // sum of negative amounts (negative number)
  totalAdded: number   // sum of positive amounts (positive number)
  isCurrent: boolean   // same year+month as today
}

export interface YearGroup {
  year: number
  label: string        // "2026"
  months: MonthGroup[] // sorted desc (newest month first)
  totalSpent: number
  totalAdded: number
  isCurrent: boolean   // year === current year
}

const MONTH_NAMES_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

export function groupByYearAndMonth(transactions: CreditTransaction[]): YearGroup[] {
  if (transactions.length === 0) return []

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() // 0-based

  // Group by "YYYY-MM" key in LOCAL time — must stay consistent with
  // formatDate() below, which renders DD.MM in local time. Grouping in UTC
  // while displaying in local caused month-boundary drift for Austrian users
  // (00:30 local on the 1st = previous UTC month → visible date "01.05."
  // grouped under April).
  const monthMap = new Map<string, CreditTransaction[]>()
  for (const tx of transactions) {
    const d = new Date(tx.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const list = monthMap.get(key) ?? []
    list.push(tx)
    monthMap.set(key, list)
  }

  // Build MonthGroups
  const monthGroups: MonthGroup[] = [...monthMap.entries()].map(([month, items]) => {
    const [y, m] = month.split('-').map(Number)
    const mi = m - 1 // 0-based
    const totalSpent = items.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)
    const totalAdded = items.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    return {
      month,
      year: y,
      monthIndex: mi,
      label: `${MONTH_NAMES_DE[mi]} ${y}`,
      shortLabel: MONTH_NAMES_DE[mi],
      items,
      totalSpent,
      totalAdded,
      isCurrent: y === currentYear && mi === currentMonth,
    }
  })

  // Group by year
  const yearMap = new Map<number, MonthGroup[]>()
  for (const mg of monthGroups) {
    const list = yearMap.get(mg.year) ?? []
    list.push(mg)
    yearMap.set(mg.year, list)
  }

  // Build YearGroups sorted desc
  const years: YearGroup[] = [...yearMap.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => {
      // Sort months desc within year
      months.sort((a, b) => b.monthIndex - a.monthIndex)
      const totalSpent = months.reduce((s, m) => s + m.totalSpent, 0)
      const totalAdded = months.reduce((s, m) => s + m.totalAdded, 0)
      return {
        year,
        label: String(year),
        months,
        totalSpent,
        totalAdded,
        isCurrent: year === currentYear,
      }
    })

  return years
}

export function useOrgCreditHistory() {
  const { organization } = useOrg()

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

  const years = useMemo(() => groupByYearAndMonth(transactions), [transactions])

  return { years, allTransactions: transactions, isLoading }
}
