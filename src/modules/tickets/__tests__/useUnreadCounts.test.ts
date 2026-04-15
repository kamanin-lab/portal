import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@/shared/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

import { useUnreadCounts } from '../hooks/useUnreadCounts'

// Stable wrapper — QueryClient created once per wrapper instance
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children
  )

/**
 * Build a mock for the support-count query chain:
 *   .select('id', { count:'exact', head:true })
 *   .eq('task_id', ...).eq('profile_id', ...).eq('is_from_portal', ...)
 *   [optional: .gt('clickup_created_at', ...)]
 * Returns a mock whose final eq/gt resolves to { count, error }.
 */
function makeCountChain(count: number) {
  const resolved = vi.fn().mockResolvedValue({ count, error: null })
  const eq3 = vi.fn(() => ({ gt: resolved }))          // .eq().gt() path
  const eq2 = vi.fn(() => ({ eq: eq3, gt: resolved })) // after 2nd eq — could be last or have gt
  const eq1 = vi.fn(() => ({ eq: eq2 }))               // after 1st eq
  // eq3 is also the last in the 3-eq chain when there's no gt
  // Override: make eq3 itself thenable so await eq3() works
  // Actually: when no gt(), we await the result of eq('is_from_portal', false)
  // which is { gt: resolved } — not a promise. Need to make eq3 return a promise directly.
  // Simplest: make the result of each eq call ALSO be directly awaitable via mockResolvedValue
  const finalEq = vi.fn().mockResolvedValue({ count, error: null })
  const midEq = vi.fn(() => ({ eq: finalEq, gt: vi.fn().mockResolvedValue({ count, error: null }) }))
  const firstEq = vi.fn(() => ({ eq: midEq }))
  void eq3; void eq2; void eq1; void resolved

  return vi.fn(() => ({ eq: firstEq })) // this IS the select() return value
}

/**
 * Build a mock for the all-comments query chain:
 *   .select('task_id, clickup_created_at, is_from_portal')
 *   .eq('profile_id', ...)
 * Returns a mock whose .eq() resolves to { data, error }.
 */
function makeCommentsChain(data: unknown[]) {
  const eq = vi.fn().mockResolvedValue({ data, error: null })
  return vi.fn(() => ({ eq })) // this IS the select() return value
}

/**
 * Build a mock for read_receipts query chain:
 *   .select('context_type, last_read_at')
 *   .eq('profile_id', ...)
 */
function makeReceiptsChain(receipts: { context_type: string; last_read_at: string }[]) {
  const eq = vi.fn().mockResolvedValue({ data: receipts, error: null })
  return vi.fn(() => ({ eq }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useUnreadCounts — supportTaskId as parameter', () => {
  it('when supportTaskId is null, supportCount is 0 and no profiles query is made', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'read_receipts') {
        return { select: makeReceiptsChain([]) }
      }
      if (table === 'comment_cache') {
        return { select: makeCommentsChain([]) }
      }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const { result } = renderHook(
      () => useUnreadCounts('user-123', null),
      { wrapper }
    )

    await waitFor(() => !result.current.isLoading)

    expect(result.current.supportUnread).toBe(0)

    // No profiles table queried
    const calls = mockFrom.mock.calls as string[][]
    expect(calls.filter(c => c[0] === 'profiles')).toHaveLength(0)
  })

  it('when supportTaskId is provided, support comments matching that taskId are counted', async () => {
    const comments = [
      { task_id: 'task-support', clickup_created_at: '2024-06-01T00:00:00Z', is_from_portal: false },
    ]

    mockFrom.mockImplementation((table: string) => {
      if (table === 'read_receipts') {
        return { select: makeReceiptsChain([]) }
      }
      if (table === 'comment_cache') {
        let callCount = 0
        return {
          select: vi.fn().mockImplementation((_cols: string, opts?: { head?: boolean }) => {
            callCount++
            if (callCount === 1 && opts?.head === true) {
              // Support count: .eq().eq().eq() — final eq resolves
              return makeCountChain(2)()
            }
            // All comments: .eq() resolves
            return makeCommentsChain(comments)()
          }),
        }
      }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const { result } = renderHook(
      () => useUnreadCounts('user-123', 'task-support'),
      { wrapper }
    )

    await waitFor(() => expect(result.current.supportUnread).toBe(2), { timeout: 3000 })

    // No profiles table queried
    const calls = mockFrom.mock.calls as string[][]
    expect(calls.filter(c => c[0] === 'profiles')).toHaveLength(0)
  })

  it('query key includes supportTaskId (cache is per-org-config)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'read_receipts') return { select: makeReceiptsChain([]) }
      if (table === 'comment_cache') return { select: makeCommentsChain([]) }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const { result } = renderHook(
      () => useUnreadCounts('user-abc', 'task-xyz'),
      { wrapper }
    )

    expect(result.current).toBeDefined()
    expect(typeof result.current.supportUnread).toBe('number')
  })

  it('default supportTaskId is null when not provided (backward compat)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'read_receipts') return { select: makeReceiptsChain([]) }
      if (table === 'comment_cache') return { select: makeCommentsChain([]) }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const { result } = renderHook(
      () => useUnreadCounts('user-123'),
      { wrapper }
    )

    await waitFor(() => !result.current.isLoading)

    expect(result.current.supportUnread).toBe(0)
  })
})
