import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InviteMemberDialog } from '../components/InviteMemberDialog'

const invokeMock = vi.fn()
const toastSuccess = vi.fn()
const toastError = vi.fn()

vi.mock('@/shared/lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}))
vi.mock('sonner', () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}))
vi.mock('@/shared/hooks/useOrg', () => ({
  useOrg: () => ({ organization: { id: 'org-1', name: 'Acme', slug: 'acme' }, isAdmin: true, isLoading: false, orgRole: 'admin', isMember: true, isViewer: false }),
}))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

beforeEach(() => {
  invokeMock.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
})

describe('InviteMemberDialog', () => {
  it('renders email input when open', () => {
    render(<InviteMemberDialog open={true} onClose={() => {}} />, { wrapper })
    expect(screen.getByLabelText(/E-Mail/i)).toBeInTheDocument()
  })

  it('calls invite-member Edge Function with correct payload', async () => {
    invokeMock.mockResolvedValue({ data: { success: true, userId: 'u1' }, error: null })
    const onClose = vi.fn()
    render(<InviteMemberDialog open={true} onClose={onClose} />, { wrapper })
    fireEvent.change(screen.getByLabelText(/E-Mail/i), { target: { value: 'anna@acme.at' } })
    fireEvent.click(screen.getByRole('button', { name: /Einladen/i }))
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('invite-member', {
      body: { organizationId: 'org-1', email: 'anna@acme.at', role: 'member' },
    }))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows error toast on failure', async () => {
    invokeMock.mockResolvedValue({ data: { error: 'Member already exists in organization' }, error: null })
    render(<InviteMemberDialog open={true} onClose={() => {}} />, { wrapper })
    fireEvent.change(screen.getByLabelText(/E-Mail/i), { target: { value: 'bob@acme.at' } })
    fireEvent.click(screen.getByRole('button', { name: /Einladen/i }))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
  })
})
