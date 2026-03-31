import { render, screen } from '@testing-library/react'
import { FaqSection } from '../FaqSection'
import { HelpCircleIcon } from '@hugeicons/core-free-icons'

const section = {
  id: 'test',
  title: 'Projekte',
  icon: HelpCircleIcon,
  items: [
    { question: 'Frage 1?', answer: 'Antwort 1.' },
    { question: 'Frage 2?', answer: 'Antwort 2.' },
  ],
}

describe('FaqSection', () => {
  it('renders the section title', () => {
    render(<FaqSection section={section} />)
    expect(screen.getByText('Projekte')).toBeInTheDocument()
  })

  it('renders all questions', () => {
    render(<FaqSection section={section} />)
    expect(screen.getByText('Frage 1?')).toBeInTheDocument()
    expect(screen.getByText('Frage 2?')).toBeInTheDocument()
  })

  it('renders correct number of FaqItems', () => {
    render(<FaqSection section={section} />)
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })
})
