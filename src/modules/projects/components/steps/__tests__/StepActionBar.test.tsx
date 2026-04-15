import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'

const orgMock = vi.hoisted(() => ({ useOrg: vi.fn() }))

vi.mock('@/shared/hooks/useOrg', () => ({
  useOrg: () => orgMock.useOrg(),
}))

vi.mock('@/modules/tickets/hooks/useTaskActions', () => ({
  useTaskActions: () => ({
    approveTask: vi.fn(),
    requestChanges: vi.fn(),
    isLoading: false,
  }),
}))

import { StepActionBar } from '../StepActionBar'

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children
  )

describe('StepActionBar viewer guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('renders nothing when isViewer is true', () => {
    orgMock.useOrg.mockReturnValue({
      organization: null,
      orgRole: 'viewer',
      isAdmin: false,
      isMember: false,
      isViewer: true,
      isLoading: false,
    })
    const { container } = render(
      createElement(StepActionBar, { taskId: 'task-1', projectId: 'proj-1' }),
      { wrapper }
    )
    expect(container).toBeEmptyDOMElement()
  })

  test('renders action bar when isViewer is false', () => {
    orgMock.useOrg.mockReturnValue({
      organization: null,
      orgRole: 'member',
      isAdmin: false,
      isMember: true,
      isViewer: false,
      isLoading: false,
    })
    const { container } = render(
      createElement(StepActionBar, { taskId: 'task-1', projectId: 'proj-1' }),
      { wrapper }
    )
    expect(container).not.toBeEmptyDOMElement()
  })
})
