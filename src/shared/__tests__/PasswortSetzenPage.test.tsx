import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const verifyOtpMock = vi.fn()
const updateUserMock = vi.fn()
const getUserMock = vi.fn()
const navigateMock = vi.fn()

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    auth: {
      verifyOtp: (...args: unknown[]) => verifyOtpMock(...args),
      updateUser: (...args: unknown[]) => updateUserMock(...args),
      getUser: (...args: unknown[]) => getUserMock(...args),
    },
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

import { PasswortSetzenPage } from '../pages/PasswortSetzenPage'

beforeEach(() => {
  verifyOtpMock.mockReset().mockResolvedValue({ error: null })
  updateUserMock.mockReset().mockResolvedValue({ error: null })
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: 'user-xyz' } }, error: null })
  navigateMock.mockReset()
})

function mountPage(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/passwort-setzen${search}`]}>
      <PasswortSetzenPage />
    </MemoryRouter>
  )
}

describe('PasswortSetzenPage', () => {
  it('shows invalid link message when no token param', () => {
    mountPage()
    expect(screen.getByText(/Ungültiger oder fehlender Link/i)).toBeInTheDocument()
  })

  it('renders password form when token is present', () => {
    mountPage('?token=abc123&type=recovery')
    expect(screen.getByLabelText(/Neues Passwort/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Passwort bestätigen/i)).toBeInTheDocument()
  })

  it('disables submit when passwords do not match', () => {
    mountPage('?token=abc123&type=recovery')
    fireEvent.change(screen.getByLabelText(/Neues Passwort/i), { target: { value: 'Test@1234' } })
    fireEvent.change(screen.getByLabelText(/Passwort bestätigen/i), { target: { value: 'different' } })
    expect(screen.getByRole('button', { name: /Passwort festlegen/i })).toBeDisabled()
  })

  it('calls verifyOtp then updateUser on submit and navigates to /tickets', async () => {
    mountPage('?token=abc123&type=recovery')
    fireEvent.change(screen.getByLabelText(/Vollständiger Name/i), { target: { value: 'Test User' } })
    fireEvent.change(screen.getByLabelText(/Neues Passwort/i), { target: { value: 'Test@1234' } })
    fireEvent.change(screen.getByLabelText(/Passwort bestätigen/i), { target: { value: 'Test@1234' } })
    fireEvent.click(screen.getByRole('button', { name: /Passwort festlegen/i }))

    await waitFor(() => expect(verifyOtpMock).toHaveBeenCalledWith({
      token_hash: 'abc123',
      type: 'recovery',
    }))
    await waitFor(() => expect(updateUserMock).toHaveBeenCalledWith({ password: 'Test@1234' }))
    // Navigate is called via setTimeout, so allow for timing
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/tickets', { replace: true }), { timeout: 2000 })
  })

  it('shows error when verifyOtp fails', async () => {
    verifyOtpMock.mockResolvedValue({ error: new Error('expired') })
    mountPage('?token=bad&type=recovery')
    fireEvent.change(screen.getByLabelText(/Vollständiger Name/i), { target: { value: 'Test User' } })
    fireEvent.change(screen.getByLabelText(/Neues Passwort/i), { target: { value: 'Test@1234' } })
    fireEvent.change(screen.getByLabelText(/Passwort bestätigen/i), { target: { value: 'Test@1234' } })
    fireEvent.click(screen.getByRole('button', { name: /Passwort festlegen/i }))
    await waitFor(() => expect(screen.getByText(/Link abgelaufen oder ungültig/i)).toBeInTheDocument())
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('shows error when updateUser fails', async () => {
    updateUserMock.mockResolvedValue({ error: new Error('boom') })
    mountPage('?token=abc123&type=recovery')
    fireEvent.change(screen.getByLabelText(/Vollständiger Name/i), { target: { value: 'Test User' } })
    fireEvent.change(screen.getByLabelText(/Neues Passwort/i), { target: { value: 'Test@1234' } })
    fireEvent.change(screen.getByLabelText(/Passwort bestätigen/i), { target: { value: 'Test@1234' } })
    fireEvent.click(screen.getByRole('button', { name: /Passwort festlegen/i }))
    await waitFor(() => expect(screen.getByText(/Passwort konnte nicht gesetzt werden/i)).toBeInTheDocument())
  })
})
