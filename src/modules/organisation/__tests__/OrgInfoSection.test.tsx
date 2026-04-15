import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OrgInfoSection } from '../components/OrgInfoSection'

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

vi.mock('@/modules/tickets/hooks/useCredits', () => ({
  useCredits: () => ({ balance: 42, isLoading: false, packageName: null, creditsPerMonth: null, pkg: null }),
}))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

describe('OrgInfoSection', () => {
  it('renders org name', () => {
    render(<OrgInfoSection />, { wrapper })
    expect(screen.getByText('Acme GmbH')).toBeInTheDocument()
  })
  it('renders org slug', () => {
    render(<OrgInfoSection />, { wrapper })
    expect(screen.getByText(/acme/)).toBeInTheDocument()
  })
  it('renders credit balance', () => {
    render(<OrgInfoSection />, { wrapper })
    expect(screen.getByText(/42/)).toBeInTheDocument()
  })
})
