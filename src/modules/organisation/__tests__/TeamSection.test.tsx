import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TeamSection } from '../components/TeamSection'
import type { OrgMember } from '../hooks/useOrgMembers'

const useOrgMembersMock = vi.fn()
vi.mock('../hooks/useOrgMembers', () => ({
  useOrgMembers: () => useOrgMembersMock(),
}))

vi.mock('@/shared/hooks/useOrg', () => ({
  useOrg: () => ({
    organization: { id: 'org-1', name: 'Acme GmbH', slug: 'acme' },
    isAdmin: true,
    isLoading: false,
    orgRole: 'admin',
    isMember: true,
    isViewer: false,
  }),
}))

vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'p-current-admin' } }),
}))

vi.mock('@/shared/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

vi.mock('../hooks/useMemberActions', () => ({
  useMemberActions: () => ({ changeRole: vi.fn(), removeMember: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

const sampleMembers: OrgMember[] = [
  { id: 'm1', organization_id: 'o1', profile_id: 'p1', role: 'admin', created_at: '2026-01-01T00:00:00Z', accepted_at: '2026-01-01T10:00:00Z', invited_email: null, profile: { id: 'p1', email: 'admin@acme.at', full_name: 'Admin Anna' } },
  { id: 'm2', organization_id: 'o1', profile_id: 'p2', role: 'member', created_at: '2026-01-02T00:00:00Z', accepted_at: null, invited_email: 'pending@acme.at', profile: { id: 'p2', email: 'pending@acme.at', full_name: null } },
]

describe('TeamSection', () => {
  it('shows loading state', () => {
    useOrgMembersMock.mockReturnValue({ data: [], isLoading: true })
    render(<TeamSection />, { wrapper })
    expect(screen.getByText(/Lädt/i)).toBeInTheDocument()
  })

  it('shows empty state', () => {
    useOrgMembersMock.mockReturnValue({ data: [], isLoading: false })
    render(<TeamSection />, { wrapper })
    expect(screen.getByText(/Noch keine Mitglieder/i)).toBeInTheDocument()
  })

  it('renders one row per member', () => {
    useOrgMembersMock.mockReturnValue({ data: sampleMembers, isLoading: false })
    render(<TeamSection />, { wrapper })
    // Both desktop and mobile render, so use getAllByText
    expect(screen.getAllByText('Admin Anna').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('admin@acme.at').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('pending@acme.at').length).toBeGreaterThanOrEqual(1)
  })

  it('shows "Einladung ausstehend" badge for pending invites (accepted_at is null)', () => {
    useOrgMembersMock.mockReturnValue({ data: sampleMembers, isLoading: false })
    render(<TeamSection />, { wrapper })
    // The badge text should appear for the pending member
    const badges = screen.getAllByText(/Einladung ausstehend/)
    expect(badges.length).toBeGreaterThanOrEqual(1)
  })

  it('does NOT show "Einladung ausstehend" badge for accepted members', () => {
    const allAccepted: OrgMember[] = [
      { id: 'm1', organization_id: 'o1', profile_id: 'p1', role: 'admin', created_at: '2026-01-01T00:00:00Z', accepted_at: '2026-01-01T10:00:00Z', invited_email: null, profile: { id: 'p1', email: 'admin@acme.at', full_name: 'Admin Anna' } },
    ]
    useOrgMembersMock.mockReturnValue({ data: allAccepted, isLoading: false })
    render(<TeamSection />, { wrapper })
    expect(screen.queryByText(/Einladung ausstehend/)).not.toBeInTheDocument()
  })

  it('shows email local-part as name for pending member without full_name', () => {
    useOrgMembersMock.mockReturnValue({ data: sampleMembers, isLoading: false })
    render(<TeamSection />, { wrapper })
    // m2 has no full_name but invited_email is 'pending@acme.at', so name shows 'pending'
    // Both desktop and mobile render, so use getAllByText
    expect(screen.getAllByText('pending').length).toBeGreaterThanOrEqual(1)
  })

  it('opens invite dialog on button click', () => {
    useOrgMembersMock.mockReturnValue({ data: [], isLoading: false })
    render(<TeamSection />, { wrapper })
    const btn = screen.getByRole('button', { name: /Mitglied einladen/i })
    fireEvent.click(btn)
    // dialog open state is internal; assert dialog title (heading) appears
    expect(screen.getByRole('heading', { name: /Mitglied einladen/i })).toBeInTheDocument()
  })
})
