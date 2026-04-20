import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PasswordChecklist } from '../PasswordChecklist'

describe('PasswordChecklist', () => {
  it('renders nothing when password is empty', () => {
    const { container } = render(<PasswordChecklist password="" />)
    expect(container.innerHTML).toBe('')
  })

  it('shows all rules as failing (amber) for a weak password', () => {
    render(<PasswordChecklist password="abc" />)
    const labels = [
      'Mindestens 8 Zeichen',
      'Mindestens ein Großbuchstabe',
      'Mindestens eine Ziffer',
      'Mindestens ein Sonderzeichen',
    ]
    for (const label of labels) {
      const span = screen.getByText(label)
      expect(span).toBeInTheDocument()
      expect(span.className).toContain('text-awaiting')
    }
  })

  it('shows all rules as passing (green) for a strong password', () => {
    render(<PasswordChecklist password="Test@1234" />)
    const labels = [
      'Mindestens 8 Zeichen',
      'Mindestens ein Großbuchstabe',
      'Mindestens eine Ziffer',
      'Mindestens ein Sonderzeichen',
    ]
    for (const label of labels) {
      const span = screen.getByText(label)
      expect(span).toBeInTheDocument()
      expect(span.className).toContain('text-committed')
    }
  })

  it('shows mixed pass/fail for a partially-valid password', () => {
    // 'abc1' has a digit but fails length, uppercase, and special
    render(<PasswordChecklist password="abc1" />)

    const failing = [
      'Mindestens 8 Zeichen',
      'Mindestens ein Großbuchstabe',
      'Mindestens ein Sonderzeichen',
    ]
    for (const label of failing) {
      expect(screen.getByText(label).className).toContain('text-awaiting')
    }

    const passing = ['Mindestens eine Ziffer']
    for (const label of passing) {
      expect(screen.getByText(label).className).toContain('text-committed')
    }
  })
})
