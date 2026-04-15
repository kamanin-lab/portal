import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@/shared/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

import { useUnreadCounts } from '../hooks/useUnreadCounts'

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

function setupMocks({
  receipts = [] as { context_type: string; last_read_at: string }[],
  comments = [] as { task_id: string; clickup_created_at: string; is_from_portal: boolean | null }[],
  supportCommentCount = 0,
} = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'read_receipts') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: receipts, error: null }),
        }),
      }
    }
    if (table === 'comment_cache') {
      let callCount = 0
      return {
        select: vi.fn().mockImplementation((_cols: string, opts?: { head?: boolean; count?: string }) => {
          callCount++
          if (callCount === 1 && opts?.head === true) {
            // Support unread count query
            return {
              eq: vi.fn().mockReturnThis(),
              gt: vi.fn().mockResolvedValue({ count: supportCommentCount, error: null }),
            }
          }
          // All comments query
          return {
            eq: vi.fn().mockResolvedValue({ data: comments, error: null }),
          }
        }),
      }
    }
    return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useUnreadCounts — supportTaskId as parameter', () => {
  it('when supportTaskId is null, supportCount is 0 and no profiles query is made', async () => {
    setupMocks({ receipts: [], comments: [] })

    const { result } = renderHook(
      () => useUnreadCounts('user-123', null),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => !result.current.isLoading)

    expect(result.current.supportUnread).toBe(0)

    // Confirm no profiles table was queried
    const calls = mockFrom.mock.calls as string[][]
    const profileCalls = calls.filter(c => c[0] === 'profiles')
    expect(profileCalls).toHaveLength(0)
  })

  it('when supportTaskId is provided, support comments matching that taskId are counted', async () => {
    const receipts: { context_type: string; last_read_at: string }[] = []
    const comments = [
      { task_id: 'task-support', clickup_created_at: '2024-06-01T00:00:00Z', is_from_portal: false },
    ]

    mockFrom.mockImplementation((table: string) => {
      if (table === 'read_receipts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: receipts, error: null }),
          }),
        }
      }
      if (table === 'comment_cache') {
        let callCount = 0
        return {
          select: vi.fn().mockImplementation((_cols: string, opts?: { head?: boolean; count?: string }) => {
            callCount++
            if (callCount === 1 && opts?.head === true) {
              return {
                eq: vi.fn().mockReturnThis(),
                gt: vi.fn().mockResolvedValue({ count: 2, error: null }),
              }
            }
            return {
              eq: vi.fn().mockResolvedValue({ data: comments, error: null }),
            }
          }),
        }
      }
      return { select: vi.fn().mockResolvedValue({ data: null, error: null }) }
    })

    const { result } = renderHook(
      () => useUnreadCounts('user-123', 'task-support'),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => !result.current.isLoading)

    expect(result.current.supportUnread).toBe(2)

    // Confirm no profiles table was queried
    const calls = mockFrom.mock.calls as string[][]
    const profileCalls = calls.filter(c => c[0] === 'profiles')
    expect(profileCalls).toHaveLength(0)
  })

  it('query returns defined result when supportTaskId is in the key', async () => {
    setupMocks()

    const { result } = renderHook(
      () => useUnreadCounts('user-abc', 'task-xyz'),
      { wrapper: makeWrapper() }
    )

    expect(result.current).toBeDefined()
    expect(typeof result.current.supportUnread).toBe('number')
  })

  it('default supportTaskId is null when not provided (backward compat)', async () => {
    setupMocks({ receipts: [], comments: [] })

    const { result } = renderHook(
      () => useUnreadCounts('user-123'),
      { wrapper: makeWrapper() }
    )

    await waitFor(() => !result.current.isLoading)

    expect(result.current.supportUnread).toBe(0)
  })
})
