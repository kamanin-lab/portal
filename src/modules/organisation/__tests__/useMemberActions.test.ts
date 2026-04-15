import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useMemberActions } from '../hooks/useMemberActions'
import type { OrgMember } from '../hooks/useOrgMembers'

const updateEq = vi.fn()
const deleteEq = vi.fn()
const toastSuccess = vi.fn()
const toastError = vi.fn()

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (patch: unknown) => ({ eq: (col: string, val: string) => updateEq(patch, col, val) }),
      delete: () => ({ eq: (col: string, val: string) => deleteEq(col, val) }),
    }),
  },
}))
vi.mock('sonner', () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}))

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) },
    children
  )

const mkMember = (id: string, role: OrgMember['role']): OrgMember => ({
  id, organization_id: 'o1', profile_id: `p-${id}`, role, created_at: '2026-01-01T00:00:00Z',
  profile: { id: `p-${id}`, email: `${id}@acme.at`, full_name: id },
})

beforeEach(() => {
  updateEq.mockReset(); deleteEq.mockReset(); toastSuccess.mockReset(); toastError.mockReset()
  updateEq.mockResolvedValue({ error: null })
  deleteEq.mockResolvedValue({ error: null })
})

describe('useMemberActions', () => {
  const members = [mkMember('a1', 'admin'), mkMember('m1', 'member'), mkMember('v1', 'viewer')]

  it('changeRole updates org_members', async () => {
    const { result } = renderHook(() => useMemberActions({ members, currentUserId: 'p-a1' }), { wrapper })
    await result.current.changeRole({ memberId: 'm1', nextRole: 'viewer' })
    expect(updateEq).toHaveBeenCalledWith({ role: 'viewer' }, 'id', 'm1')
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
  })

  it('changeRole rejects demoting last admin', async () => {
    const { result } = renderHook(() => useMemberActions({ members, currentUserId: 'p-a1' }), { wrapper })
    await expect(
      result.current.changeRole({ memberId: 'a1', nextRole: 'viewer' })
    ).rejects.toThrow()
    expect(updateEq).not.toHaveBeenCalled()
  })

  it('removeMember deletes row', async () => {
    const { result } = renderHook(() => useMemberActions({ members, currentUserId: 'p-a1' }), { wrapper })
    await result.current.removeMember({ memberId: 'm1' })
    expect(deleteEq).toHaveBeenCalledWith('id', 'm1')
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
  })

  it('removeMember rejects when removing self as last admin', async () => {
    const { result } = renderHook(() => useMemberActions({ members, currentUserId: 'p-a1' }), { wrapper })
    await expect(
      result.current.removeMember({ memberId: 'a1' })
    ).rejects.toThrow()
    expect(deleteEq).not.toHaveBeenCalled()
  })
})
