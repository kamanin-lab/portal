import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FaqItem } from '../FaqItem'

describe('FaqItem', () => {
  const props = {
    question: 'Was bedeuten die Projektphasen?',
    answer: 'Jedes Projekt durchläuft vier Phasen.',
  }

  it('renders the question text', () => {
    render(<FaqItem {...props} />)
    expect(screen.getByText(props.question)).toBeInTheDocument()
  })

  it('does not show answer by default', () => {
    render(<FaqItem {...props} />)
    expect(screen.queryByText(props.answer)).not.toBeInTheDocument()
  })

  it('shows answer after clicking the question button', () => {
    render(<FaqItem {...props} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText(props.answer)).toBeInTheDocument()
  })

  it('hides answer again when clicking a second time', async () => {
    render(<FaqItem {...props} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText(props.answer)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.queryByText(props.answer)).not.toBeInTheDocument())
  })

  it('renders a separator by default', () => {
    const { container } = render(<FaqItem {...props} />)
    expect(container.firstChild).toHaveClass('border-b')
  })

  it('does not render a separator when isLast=true', () => {
    const { container } = render(<FaqItem {...props} isLast />)
    expect(container.firstChild).not.toHaveClass('border-b')
  })
})
