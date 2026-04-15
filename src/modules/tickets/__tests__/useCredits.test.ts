import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'

const orgMock = vi.hoisted(() => ({ useOrg: vi.fn() }))
const rpcMock = vi.hoisted(() => vi.fn())
const fromMock = vi.hoisted(() => vi.fn())
const channelMock = vi.hoisted(() => ({
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
}))

vi.mock('@/shared/hooks/useOrg', () => ({
  useOrg: () => orgMock.useOrg(),
}))

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
    channel: vi.fn(() => channelMock),
    removeChannel: vi.fn(),
  },
}))

import { useCredits } from '@/modules/tickets/hooks/useCredits'

const ORG = { id: 'org-42', name: 'Acme', slug: 'acme', clickup_list_ids: [], nextcloud_client_root: null, support_task_id: null, clickup_chat_channel_id: null, created_at: '', updated_at: '' }

function setupPkgChain(result: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: result, error: null })
  const limit = vi.fn(() => ({ maybeSingle }))
  const activeEq = vi.fn(() => ({ limit }))
  const orgEq = vi.fn(() => ({ eq: activeEq }))
  const select = vi.fn(() => ({ eq: orgEq }))
  fromMock.mockReturnValue({ select })
  return { orgEq, activeEq, select }
}

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children
  )

describe('useCredits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    orgMock.useOrg.mockReturnValue({ organization: ORG, isLoading: false, isViewer: false, isAdmin: true, isMember: true, orgRole: 'admin' })
    rpcMock.mockResolvedValue({ data: 42, error: null })
  })

  test('queries credit_packages by organization_id', async () => {
    const chain = setupPkgChain({ id: 'pkg1', package_name: 'Basic', credits_per_month: 100, is_active: true })
    const { result } = renderHook(() => useCredits(), { wrapper })
    await waitFor(() => expect(result.current.pkg).toBeDefined())
    expect(fromMock).toHaveBeenCalledWith('credit_packages')
    expect(chain.orgEq).toHaveBeenCalledWith('organization_id', 'org-42')
  })

  test('calls get_org_credit_balance RPC with p_org_id', async () => {
    setupPkgChain(null)
    const { result } = renderHook(() => useCredits(), { wrapper })
    await waitFor(() => expect(result.current.balance).toBe(42))
    expect(rpcMock).toHaveBeenCalledWith('get_org_credit_balance', { p_org_id: 'org-42' })
  })
})
