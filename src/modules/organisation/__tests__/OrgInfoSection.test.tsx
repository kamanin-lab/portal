import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

describe('OrgInfoSection', () => {
  it('renders org name', () => {
    render(<OrgInfoSection />)
    expect(screen.getByText('Acme GmbH')).toBeInTheDocument()
  })
  it('renders section header', () => {
    render(<OrgInfoSection />)
    expect(screen.getByText('Organisation')).toBeInTheDocument()
  })
  it('does not render Guthaben field (moved to CreditHistorySection)', () => {
    render(<OrgInfoSection />)
    expect(screen.queryByText('Guthaben')).not.toBeInTheDocument()
  })
})
