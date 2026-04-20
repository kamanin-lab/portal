// src/shared/pages/__tests__/HilfePage.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HilfePage } from '../HilfePage'

function renderPage() {
  return render(
    <MemoryRouter>
      <HilfePage />
    </MemoryRouter>
  )
}

describe('HilfePage', () => {
  it('renders the page heading', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Hilfe & FAQ' })).toBeInTheDocument()
  })

  it('renders all 7 section titles', () => {
    renderPage()
    expect(screen.getByText('Projekte')).toBeInTheDocument()
    expect(screen.getByText('Tickets & Anfragen')).toBeInTheDocument()
    expect(screen.getByText('Dateien')).toBeInTheDocument()
    expect(screen.getByText('Kredite')).toBeInTheDocument()
    expect(screen.getByText('Benachrichtigungen')).toBeInTheDocument()
    expect(screen.getByText('Konto & Einstellungen')).toBeInTheDocument()
    expect(screen.getByText('Organisation & Team')).toBeInTheDocument()
  })

  it('renders at least 28 question buttons across all sections', () => {
    renderPage()
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(28)
  })

  it('renders new section "Organisation & Team"', () => {
    renderPage()
    expect(screen.getByText('Organisation & Team')).toBeInTheDocument()
    expect(screen.getByText('Was ist eine Organisation?')).toBeInTheDocument()
    expect(screen.getByText('Welche Rollen gibt es?')).toBeInTheDocument()
  })

  describe('search', () => {
    it('renders the search input', () => {
      renderPage()
      expect(screen.getByPlaceholderText('FAQ durchsuchen...')).toBeInTheDocument()
    })

    it('filters sections when typing a matching term', () => {
      renderPage()
      const input = screen.getByPlaceholderText('FAQ durchsuchen...')
      fireEvent.change(input, { target: { value: 'Passwort' } })
      expect(screen.getByText('Konto & Einstellungen')).toBeInTheDocument()
      expect(screen.queryByText('Projekte')).not.toBeInTheDocument()
      expect(screen.queryByText('Tickets & Anfragen')).not.toBeInTheDocument()
    })

    it('shows empty state when no results match', () => {
      renderPage()
      const input = screen.getByPlaceholderText('FAQ durchsuchen...')
      fireEvent.change(input, { target: { value: 'xyznonexistent' } })
      expect(screen.getByText('Keine Ergebnisse. Versuchen Sie andere Begriffe.')).toBeInTheDocument()
    })

    it('restores all 7 sections when clearing the search', () => {
      renderPage()
      const input = screen.getByPlaceholderText('FAQ durchsuchen...')
      fireEvent.change(input, { target: { value: 'Passwort' } })
      expect(screen.queryByText('Projekte')).not.toBeInTheDocument()
      fireEvent.change(input, { target: { value: '' } })
      expect(screen.getByText('Projekte')).toBeInTheDocument()
      expect(screen.getByText('Tickets & Anfragen')).toBeInTheDocument()
      expect(screen.getByText('Dateien')).toBeInTheDocument()
      expect(screen.getByText('Kredite')).toBeInTheDocument()
      expect(screen.getByText('Benachrichtigungen')).toBeInTheDocument()
      expect(screen.getByText('Konto & Einstellungen')).toBeInTheDocument()
      expect(screen.getByText('Organisation & Team')).toBeInTheDocument()
    })
  })
})
