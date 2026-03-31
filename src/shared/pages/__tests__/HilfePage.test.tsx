// src/shared/pages/__tests__/HilfePage.test.tsx
import { render, screen } from '@testing-library/react'
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

  it('renders all 6 section titles', () => {
    renderPage()
    expect(screen.getByText('Projekte')).toBeInTheDocument()
    expect(screen.getByText('Tickets & Anfragen')).toBeInTheDocument()
    expect(screen.getByText('Dateien')).toBeInTheDocument()
    expect(screen.getByText('Kredite')).toBeInTheDocument()
    expect(screen.getByText('Benachrichtigungen')).toBeInTheDocument()
    expect(screen.getByText('Konto & Einstellungen')).toBeInTheDocument()
  })

  it('renders at least 18 question buttons across all sections', () => {
    renderPage()
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(18)
  })
})
