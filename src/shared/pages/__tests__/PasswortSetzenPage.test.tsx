import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock supabase before importing the component
const mockUpdateUser = vi.fn()
const mockVerifyOtp = vi.fn()
const mockGetUser = vi.fn()
const mockUpdate = vi.fn()
const mockEq = vi.fn()

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    auth: {
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
    from: () => ({
      update: (...args: unknown[]) => {
        mockUpdate(...args)
        return { eq: (...eqArgs: unknown[]) => { mockEq(...eqArgs); return Promise.resolve({ error: null }) } }
      },
    }),
  },
}))

vi.mock('@/shared/components/common/PasswordChecklist', () => ({
  PasswordChecklist: () => <div data-testid="password-checklist" />,
}))

import { PasswortSetzenPage } from '../PasswortSetzenPage'

function renderPage(query = '?token=test-token-123') {
  return render(
    <MemoryRouter initialEntries={[`/passwort-setzen${query}`]}>
      <PasswortSetzenPage />
    </MemoryRouter>
  )
}

/** Fill password fields with a valid password (meets all rules) */
function fillValidPassword() {
  fireEvent.change(screen.getByLabelText('Neues Passwort'), { target: { value: 'Test1234!' } })
  fireEvent.change(screen.getByLabelText('Passwort bestätigen'), { target: { value: 'Test1234!' } })
}

describe('PasswortSetzenPage — fullName field', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyOtp.mockResolvedValue({ error: null })
    mockUpdateUser.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
  })

  it('disables submit when fullName is empty even with valid password', () => {
    renderPage()
    fillValidPassword()

    const submitBtn = screen.getByRole('button', { name: /Passwort festlegen/i })
    expect(submitBtn).toBeDisabled()
  })

  it('disables submit when fullName trimmed length < 2', () => {
    renderPage()
    fillValidPassword()

    // Single char
    fireEvent.change(screen.getByLabelText('Vollständiger Name'), { target: { value: 'A' } })
    expect(screen.getByRole('button', { name: /Passwort festlegen/i })).toBeDisabled()

    // Single char with whitespace padding
    fireEvent.change(screen.getByLabelText('Vollständiger Name'), { target: { value: ' A ' } })
    expect(screen.getByRole('button', { name: /Passwort festlegen/i })).toBeDisabled()
  })

  it('calls profiles.update with trimmed full_name and correct user id on valid submit', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Vollständiger Name'), { target: { value: 'Max Mustermann' } })
    fillValidPassword()

    const submitBtn = screen.getByRole('button', { name: /Passwort festlegen/i })
    expect(submitBtn).not.toBeDisabled()
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'Test1234!' })
    })

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ full_name: 'Max Mustermann' })
      expect(mockEq).toHaveBeenCalledWith('id', 'user-123')
    })
  })

  it('trims whitespace from fullName before persisting to profiles', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Vollständiger Name'), { target: { value: '  Max Mustermann  ' } })
    fillValidPassword()

    fireEvent.click(screen.getByRole('button', { name: /Passwort festlegen/i }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ full_name: 'Max Mustermann' })
      expect(mockEq).toHaveBeenCalledWith('id', 'user-123')
    })
  })
})
