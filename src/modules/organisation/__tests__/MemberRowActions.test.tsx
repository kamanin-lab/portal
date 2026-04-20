import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { MemberRowActions } from '../components/MemberRowActions'
import type { OrgMember } from '../hooks/useOrgMembers'

// Helper: open a Radix DropdownMenu trigger in jsdom (requires pointer events)
function openDropdown(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { bubbles: true, cancelable: true, button: 0 })
  fireEvent.click(trigger)
}

const changeRole = vi.fn()
const removeMember = vi.fn()
vi.mock('../hooks/useMemberActions', () => ({
  useMemberActions: () => ({ changeRole, removeMember }),
}))
vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'p-current' } }),
}))

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children
  )

const mkMember = (id: string, role: OrgMember['role'], profileId = `p-${id}`): OrgMember => ({
  id, organization_id: 'o1', profile_id: profileId, role, created_at: '2026-01-01T00:00:00Z',
  invited_email: null, accepted_at: '2026-01-01T10:00:00Z',
  profile: { id: profileId, email: `${id}@a.at`, full_name: id },
})

beforeEach(() => {
  changeRole.mockReset().mockResolvedValue(undefined)
  removeMember.mockReset().mockResolvedValue(undefined)
})

describe('MemberRowActions', () => {
  it('hides action button for current user row', () => {
    const member = mkMember('self', 'member', 'p-current')
    const { container } = render(<MemberRowActions member={member} members={[member]} />, { wrapper })
    expect(container.querySelector('button[aria-label="Aktionen"]')).toBeNull()
  })

  it('opens menu with Rolle ändern and Entfernen', async () => {
    const m1 = mkMember('m1', 'member')
    render(<MemberRowActions member={m1} members={[m1]} />, { wrapper })
    act(() => openDropdown(screen.getByLabelText('Aktionen')))
    await waitFor(() => expect(screen.getByText(/Rolle ändern/)).toBeInTheDocument())
    expect(screen.getByText(/Entfernen/)).toBeInTheDocument()
  })

  it('calls changeRole toggling member->viewer', async () => {
    const m1 = mkMember('m1', 'member')
    render(<MemberRowActions member={m1} members={[m1]} />, { wrapper })
    act(() => openDropdown(screen.getByLabelText('Aktionen')))
    fireEvent.click(await screen.findByText(/Rolle ändern/))
    await waitFor(() => expect(changeRole).toHaveBeenCalledWith({ memberId: 'm1', nextRole: 'viewer' }))
  })

  it('opens confirm dialog on Entfernen and calls removeMember on confirm', async () => {
    const m1 = mkMember('m1', 'member')
    render(<MemberRowActions member={m1} members={[m1]} />, { wrapper })
    act(() => openDropdown(screen.getByLabelText('Aktionen')))
    fireEvent.click(await screen.findByText(/Entfernen/))
    const confirmBtn = await screen.findByRole('button', { name: /Entfernen/i })
    fireEvent.click(confirmBtn)
    await waitFor(() => expect(removeMember).toHaveBeenCalledWith({ memberId: 'm1' }))
  })
})
