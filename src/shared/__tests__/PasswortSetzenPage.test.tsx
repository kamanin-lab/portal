import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PasswortSetzenPage } from '../pages/PasswortSetzenPage'

const updatePasswordMock = vi.fn()
const navigateMock = vi.fn()
const useAuthMock = vi.fn()

vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: () => useAuthMock(),
}))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

beforeEach(() => {
  updatePasswordMock.mockReset().mockResolvedValue({ error: null })
  navigateMock.mockReset()
  useAuthMock.mockReset()
})

function mountPage() {
  return render(
    <MemoryRouter>
      <PasswortSetzenPage />
    </MemoryRouter>
  )
}

describe('PasswortSetzenPage', () => {
  it('shows expired link message when no session', () => {
    useAuthMock.mockReturnValue({ session: null, isLoading: false, updatePassword: updatePasswordMock })
    mountPage()
    expect(screen.getByText(/Link abgelaufen/i)).toBeInTheDocument()
  })

  it('renders password form when session is present', () => {
    useAuthMock.mockReturnValue({ session: { access_token: 'x' }, isLoading: false, updatePassword: updatePasswordMock })
    mountPage()
    expect(screen.getByLabelText(/Neues Passwort/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Passwort bestätigen/i)).toBeInTheDocument()
  })

  it('disables submit when passwords do not match', () => {
    useAuthMock.mockReturnValue({ session: { access_token: 'x' }, isLoading: false, updatePassword: updatePasswordMock })
    mountPage()
    fireEvent.change(screen.getByLabelText(/Neues Passwort/i), { target: { value: 'abcdefgh' } })
    fireEvent.change(screen.getByLabelText(/Passwort bestätigen/i), { target: { value: 'different' } })
    expect(screen.getByRole('button', { name: /Passwort festlegen/i })).toBeDisabled()
  })

  it('calls updatePassword and navigates to /tickets on success', async () => {
    useAuthMock.mockReturnValue({ session: { access_token: 'x' }, isLoading: false, updatePassword: updatePasswordMock })
    mountPage()
    fireEvent.change(screen.getByLabelText(/Neues Passwort/i), { target: { value: 'abcdefgh' } })
    fireEvent.change(screen.getByLabelText(/Passwort bestätigen/i), { target: { value: 'abcdefgh' } })
    fireEvent.click(screen.getByRole('button', { name: /Passwort festlegen/i }))
    await waitFor(() => expect(updatePasswordMock).toHaveBeenCalledWith('abcdefgh'))
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/tickets', { replace: true }))
  })

  it('shows error on failed updatePassword', async () => {
    updatePasswordMock.mockResolvedValue({ error: new Error('boom') })
    useAuthMock.mockReturnValue({ session: { access_token: 'x' }, isLoading: false, updatePassword: updatePasswordMock })
    mountPage()
    fireEvent.change(screen.getByLabelText(/Neues Passwort/i), { target: { value: 'abcdefgh' } })
    fireEvent.change(screen.getByLabelText(/Passwort bestätigen/i), { target: { value: 'abcdefgh' } })
    fireEvent.click(screen.getByRole('button', { name: /Passwort festlegen/i }))
    await waitFor(() => expect(screen.getByText(/Passwort konnte nicht gesetzt werden/i)).toBeInTheDocument())
  })
})
