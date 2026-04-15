import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { createElement, type ReactNode } from 'react'

const orgMock = vi.hoisted(() => ({ useOrg: vi.fn() }))

vi.mock('@/shared/hooks/useOrg', () => ({
  useOrg: () => orgMock.useOrg(),
}))

vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user-id' } }),
}))

vi.mock('../hooks/useClickUpTasks', () => ({
  useClickUpTasks: () => ({ data: [], isLoading: false, refetch: vi.fn() }),
}))

vi.mock('../hooks/useUnreadCounts', () => ({
  useUnreadCounts: () => ({ taskUnread: {}, supportUnread: 0 }),
}))

vi.mock('../hooks/useCredits', () => ({
  useCredits: () => ({
    balance: 0,
    packageName: null,
    creditsPerMonth: null,
    isLoading: false,
  }),
}))

import { TicketsPage } from '../pages/TicketsPage'

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    createElement(BrowserRouter, null, children)
  )

describe('TicketsPage viewer guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('does not render Neue Aufgabe button for viewer', () => {
    orgMock.useOrg.mockReturnValue({
      organization: null,
      orgRole: 'viewer',
      isAdmin: false,
      isMember: false,
      isViewer: true,
      isLoading: false,
    })
    render(createElement(TicketsPage), { wrapper })
    expect(screen.queryByText('Neue Aufgabe')).not.toBeInTheDocument()
  })

  test('renders Neue Aufgabe button for non-viewer', () => {
    orgMock.useOrg.mockReturnValue({
      organization: null,
      orgRole: 'member',
      isAdmin: false,
      isMember: true,
      isViewer: false,
      isLoading: false,
    })
    render(createElement(TicketsPage), { wrapper })
    expect(screen.queryByText('Neue Aufgabe')).toBeInTheDocument()
  })
})
