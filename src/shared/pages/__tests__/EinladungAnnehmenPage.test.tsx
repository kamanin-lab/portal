import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

// Must mock before importing the component
vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
  },
}))

import { EinladungAnnehmenPage } from '../EinladungAnnehmenPage'

function renderWithRouter(initialEntries: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <EinladungAnnehmenPage />
    </MemoryRouter>
  )
}

describe('EinladungAnnehmenPage', () => {
  let assignSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Mock window.location.href assignment
    assignSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { href: '', assign: assignSpy },
      writable: true,
      configurable: true,
    })
  })

  it('renders heading and button when token is present', () => {
    renderWithRouter(['/einladung-annehmen?token=abc123&type=recovery'])
    expect(screen.getByText('Willkommen bei KAMANIN')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Einladung annehmen/i })).toBeInTheDocument()
  })

  it('shows error state when token is missing', () => {
    renderWithRouter(['/einladung-annehmen'])
    expect(screen.getByText('Ungültiger Einladungslink')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Einladung annehmen/i })).toBeNull()
  })

  it('button click triggers redirect with token in URL', () => {
    renderWithRouter(['/einladung-annehmen?token=abc123&type=recovery'])
    const btn = screen.getByRole('button', { name: /Einladung annehmen/i })
    fireEvent.click(btn)
    expect(window.location.href).toContain('/passwort-setzen?token=abc123&type=recovery')
  })
})
