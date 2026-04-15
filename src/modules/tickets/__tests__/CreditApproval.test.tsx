import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'

const orgMock = vi.hoisted(() => ({ useOrg: vi.fn() }))

vi.mock('@/shared/hooks/useOrg', () => ({
  useOrg: () => orgMock.useOrg(),
}))

vi.mock('../hooks/useTaskActions', () => ({
  useTaskActions: () => ({
    approveTask: vi.fn(),
    requestChanges: vi.fn(),
    putOnHold: vi.fn(),
    resumeTask: vi.fn(),
    cancelTask: vi.fn(),
    approveCredits: vi.fn(),
    isLoading: false,
  }),
}))

vi.mock('../hooks/useTaskComments', () => ({
  usePostComment: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}))

import { CreditApproval } from '../components/CreditApproval'

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children
  )

describe('CreditApproval viewer guard', () => {
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
      createElement(CreditApproval, { taskId: 'task-1', credits: 5, taskName: 'Test task' }),
      { wrapper }
    )
    expect(container).toBeEmptyDOMElement()
  })

  test('renders component when isViewer is false', () => {
    orgMock.useOrg.mockReturnValue({
      organization: null,
      orgRole: 'member',
      isAdmin: false,
      isMember: true,
      isViewer: false,
      isLoading: false,
    })
    const { container } = render(
      createElement(CreditApproval, { taskId: 'task-1', credits: 5, taskName: 'Test task' }),
      { wrapper }
    )
    expect(container).not.toBeEmptyDOMElement()
  })
})
