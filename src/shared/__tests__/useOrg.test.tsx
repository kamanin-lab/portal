import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'

const authMock = vi.hoisted(() => ({
  useAuth: vi.fn(),
}))

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
}))

vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: () => authMock.useAuth(),
}))

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => supabaseMock.from(...args),
  },
}))

import { OrgProvider, useOrg } from '@/shared/hooks/useOrg'

function makeQueryChain(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  return { select }
}

const TEST_USER = { id: 'user-123' }

const TEST_ORG = {
  id: 'org-1',
  name: 'Acme',
  slug: 'acme',
  clickup_list_ids: ['123'],
  nextcloud_client_root: '/acme',
  support_task_id: null,
  clickup_chat_channel_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('useOrg', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.useAuth.mockReturnValue({ user: TEST_USER })
  })

  test('throws German error when used outside OrgProvider', () => {
    expect(() => renderHook(() => useOrg())).toThrow(
      'useOrg muss innerhalb von OrgProvider verwendet werden'
    )
  })

  test('legacy fallback when org_members returns null', async () => {
    supabaseMock.from.mockReturnValue(makeQueryChain({ data: null, error: null }))
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(OrgProvider, null, children)
    const { result } = renderHook(() => useOrg(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.organization).toBeNull()
    expect(result.current.isMember).toBe(true)
    expect(result.current.isViewer).toBe(false)
    expect(result.current.isAdmin).toBe(false)
  })

  test('role=admin returns isAdmin=true, isMember=true, isViewer=false', async () => {
    supabaseMock.from.mockReturnValue(
      makeQueryChain({ data: { role: 'admin', organizations: TEST_ORG }, error: null })
    )
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(OrgProvider, null, children)
    const { result } = renderHook(() => useOrg(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isAdmin).toBe(true)
    expect(result.current.isMember).toBe(true)
    expect(result.current.isViewer).toBe(false)
    expect(result.current.organization?.id).toBe('org-1')
  })

  test('role=member returns isAdmin=false, isMember=true, isViewer=false', async () => {
    supabaseMock.from.mockReturnValue(
      makeQueryChain({ data: { role: 'member', organizations: TEST_ORG }, error: null })
    )
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(OrgProvider, null, children)
    const { result } = renderHook(() => useOrg(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isAdmin).toBe(false)
    expect(result.current.isMember).toBe(true)
    expect(result.current.isViewer).toBe(false)
  })

  test('role=viewer returns isAdmin=false, isMember=false, isViewer=true', async () => {
    supabaseMock.from.mockReturnValue(
      makeQueryChain({ data: { role: 'viewer', organizations: TEST_ORG }, error: null })
    )
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(OrgProvider, null, children)
    const { result } = renderHook(() => useOrg(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isAdmin).toBe(false)
    expect(result.current.isMember).toBe(false)
    expect(result.current.isViewer).toBe(true)
  })

  test('isLoading transitions to false after user becomes available', async () => {
    supabaseMock.from.mockReturnValue(
      makeQueryChain({ data: { role: 'member', organizations: TEST_ORG }, error: null })
    )
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(OrgProvider, null, children)
    const { result } = renderHook(() => useOrg(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isLoading).toBe(false)
  })
})
