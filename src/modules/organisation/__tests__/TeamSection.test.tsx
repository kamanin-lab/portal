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

vi.mock('@/shared/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
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
  { id: 'm1', organization_id: 'o1', profile_id: 'p1', role: 'admin', created_at: '2026-01-01T00:00:00Z', profile: { id: 'p1', email: 'admin@acme.at', full_name: 'Admin Anna' } },
  { id: 'm2', organization_id: 'o1', profile_id: 'p2', role: 'member', created_at: '2026-01-02T00:00:00Z', profile: { id: 'p2', email: 'pending@acme.at', full_name: null } },
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
    expect(screen.getByText('Admin Anna')).toBeInTheDocument()
    expect(screen.getByText('admin@acme.at')).toBeInTheDocument()
    expect(screen.getByText('pending@acme.at')).toBeInTheDocument()
  })

  it('shows "Einladung ausstehend" for pending invites', () => {
    useOrgMembersMock.mockReturnValue({ data: sampleMembers, isLoading: false })
    render(<TeamSection />, { wrapper })
    expect(screen.getByText(/Einladung ausstehend/)).toBeInTheDocument()
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
