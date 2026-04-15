import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'

const orgMock = vi.hoisted(() => ({ useOrg: vi.fn() }))
const queryBuilder = vi.hoisted(() => ({
  order: vi.fn(),
  activeEq: vi.fn(),
  orgEq: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/shared/hooks/useOrg', () => ({
  useOrg: () => orgMock.useOrg(),
}))

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => queryBuilder.from(...args),
  },
}))

import { useWorkspaces } from '@/shared/hooks/useWorkspaces'

const ORG = { id: 'org-1', name: 'Acme', slug: 'acme', clickup_list_ids: [], nextcloud_client_root: null, support_task_id: null, clickup_chat_channel_id: null, created_at: '', updated_at: '' }

function setupSupabase(rows: unknown[]) {
  queryBuilder.order.mockResolvedValue({ data: rows, error: null })
  queryBuilder.activeEq.mockReturnValue({ order: queryBuilder.order })
  queryBuilder.orgEq.mockReturnValue({ eq: queryBuilder.activeEq })
  queryBuilder.select.mockReturnValue({ eq: queryBuilder.orgEq })
  queryBuilder.from.mockReturnValue({ select: queryBuilder.select })
}

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children
  )

describe('useWorkspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns empty array when organization is null', async () => {
    orgMock.useOrg.mockReturnValue({ organization: null, isLoading: false, isViewer: false, isAdmin: false, isMember: true, orgRole: 'member' })
    setupSupabase([])
    const { result } = renderHook(() => useWorkspaces(), { wrapper })
    // Query is disabled when organization.id is null
    expect(result.current.data).toBeUndefined()
    expect(queryBuilder.from).not.toHaveBeenCalled()
  })

  test('queries client_workspaces by organization_id when org is present', async () => {
    orgMock.useOrg.mockReturnValue({ organization: ORG, isLoading: false, isViewer: false, isAdmin: false, isMember: true, orgRole: 'member' })
    setupSupabase([{ id: 'ws1', name: 'Main', is_active: true, sort_order: 1 }])
    const { result } = renderHook(() => useWorkspaces(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(queryBuilder.from).toHaveBeenCalledWith('client_workspaces')
    expect(queryBuilder.orgEq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(result.current.data).toHaveLength(1)
  })
})
