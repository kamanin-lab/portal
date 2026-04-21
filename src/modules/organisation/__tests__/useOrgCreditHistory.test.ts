import { describe, it, expect, vi } from 'vitest'
import type { CreditTransaction } from '../hooks/useOrgCreditHistory'
import { groupByYearAndMonth } from '../hooks/useOrgCreditHistory'

// Fix "now" for deterministic isCurrent checks
const MOCK_NOW = new Date('2026-04-15T12:00:00Z')
vi.useFakeTimers()
vi.setSystemTime(MOCK_NOW)

function tx(overrides: Partial<CreditTransaction> & { created_at: string; amount: number }): CreditTransaction {
  return {
    id: crypto.randomUUID(),
    type: 'task_deduction',
    task_id: null,
    task_name: null,
    description: null,
    profile_id: 'p1',
    ...overrides,
  }
}

describe('groupByYearAndMonth', () => {
  it('returns empty array for empty input', () => {
    expect(groupByYearAndMonth([])).toEqual([])
  })

  it('groups a single transaction in the current month', () => {
    const result = groupByYearAndMonth([
      tx({ created_at: '2026-04-10T10:00:00Z', amount: -5 }),
    ])

    expect(result).toHaveLength(1)
    const year = result[0]
    expect(year.year).toBe(2026)
    expect(year.label).toBe('2026')
    expect(year.isCurrent).toBe(true)
    expect(year.months).toHaveLength(1)

    const month = year.months[0]
    expect(month.month).toBe('2026-04')
    expect(month.year).toBe(2026)
    expect(month.monthIndex).toBe(3) // April = index 3 (0-based)
    expect(month.label).toBe('April 2026')
    expect(month.shortLabel).toBe('April')
    expect(month.isCurrent).toBe(true)
    expect(month.items).toHaveLength(1)
    expect(month.totalSpent).toBe(-5)
    expect(month.totalAdded).toBe(0)
  })

  it('groups transactions spanning 2 years, sorted desc', () => {
    const result = groupByYearAndMonth([
      tx({ created_at: '2026-04-10T10:00:00Z', amount: -5 }),
      tx({ created_at: '2026-01-15T10:00:00Z', amount: 30, type: 'monthly_topup' }),
      tx({ created_at: '2025-12-01T10:00:00Z', amount: -10 }),
      tx({ created_at: '2025-06-20T10:00:00Z', amount: 30, type: 'monthly_topup' }),
    ])

    expect(result).toHaveLength(2)

    // Newest year first
    expect(result[0].year).toBe(2026)
    expect(result[0].isCurrent).toBe(true)
    expect(result[0].months).toHaveLength(2) // April + January

    expect(result[1].year).toBe(2025)
    expect(result[1].isCurrent).toBe(false)
    expect(result[1].months).toHaveLength(2) // December + June
  })

  it('separates month boundary: last month of prev year vs first month of this year', () => {
    // Use mid-day UTC timestamps to avoid TZ drift in CI. The grouping is
    // intentionally local-time (to stay consistent with DD.MM display via
    // formatDate), so a timestamp like "2025-12-31T23:59:59Z" would land in
    // January for UTC+ timezones — that's correct behavior, just not what
    // this test is trying to cover. Mid-day timestamps are unambiguous.
    const result = groupByYearAndMonth([
      tx({ created_at: '2026-01-10T12:00:00Z', amount: -3 }),
      tx({ created_at: '2025-12-20T12:00:00Z', amount: -7 }),
    ])

    expect(result).toHaveLength(2)
    expect(result[0].year).toBe(2026)
    expect(result[0].months[0].month).toBe('2026-01')
    expect(result[0].months[0].items).toHaveLength(1)

    expect(result[1].year).toBe(2025)
    expect(result[1].months[0].month).toBe('2025-12')
    expect(result[1].months[0].items).toHaveLength(1)
  })

  it('computes totalSpent (negative) and totalAdded (positive) correctly', () => {
    const result = groupByYearAndMonth([
      tx({ created_at: '2026-04-01T10:00:00Z', amount: -5 }),
      tx({ created_at: '2026-04-02T10:00:00Z', amount: -10 }),
      tx({ created_at: '2026-04-03T10:00:00Z', amount: 30, type: 'monthly_topup' }),
      tx({ created_at: '2026-04-04T10:00:00Z', amount: 5, type: 'manual_adjustment' }),
    ])

    const month = result[0].months[0]
    expect(month.totalSpent).toBe(-15)
    expect(month.totalAdded).toBe(35)

    // Year totals should match
    expect(result[0].totalSpent).toBe(-15)
    expect(result[0].totalAdded).toBe(35)
  })

  it('sorts months within a year desc (newest first)', () => {
    const result = groupByYearAndMonth([
      tx({ created_at: '2026-01-10T10:00:00Z', amount: -1 }),
      tx({ created_at: '2026-04-10T10:00:00Z', amount: -2 }),
      tx({ created_at: '2026-02-10T10:00:00Z', amount: -3 }),
    ])

    expect(result).toHaveLength(1)
    const months = result[0].months
    expect(months).toHaveLength(3)
    expect(months[0].month).toBe('2026-04')
    expect(months[1].month).toBe('2026-02')
    expect(months[2].month).toBe('2026-01')
  })
})
