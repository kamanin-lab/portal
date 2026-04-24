/**
 * Scroll isolation tests
 *
 * After the unified sheet refactor (TaskDetailSheet / StepSheet / SupportSheet):
 *  - TaskDetail is flat: no inner scroll, composer lives in SideSheet footer slot.
 *  - TaskCommentsList has NO inner overflow-y-auto; it relies on the outer
 *    SideSheet scroll body.
 *  - SupportChat (used on SupportPage, not in a sheet) keeps its own inner
 *    bounded flex chain with overflow-y-auto — tested here as the page-level
 *    regression guard.
 */

import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SupportChat } from '../components/SupportChat'
import { useSupportTaskChat } from '../hooks/useSupportTaskChat'

vi.mock('../hooks/useTaskComments', () => ({
  useTaskComments: vi.fn(() => ({ data: [], isLoading: false, error: null })),
  usePostComment: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}))

vi.mock('../hooks/useSupportTaskChat', () => ({
  useSupportTaskChat: vi.fn(() => ({
    comments: [],
    isLoading: false,
    error: null,
    sendMessage: vi.fn(),
    isSending: false,
    isConfigured: true,
    supportTaskId: 'support-1',
  })),
}))

vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'user-1' } })),
}))

vi.mock('../components/CommentInput', () => ({
  CommentInput: () => <div data-testid="comment-input">comment-input</div>,
}))

vi.mock('@/shared/components/common/MessageBubble', () => ({
  MessageBubble: ({ content }: { content: string }) => <div>{content}</div>,
}))

vi.mock('@/shared/components/common/EmptyState', () => ({
  EmptyState: ({ message }: { message: string }) => <div data-testid="empty-state">{message}</div>,
}))

vi.mock('@/shared/components/common/LoadingSkeleton', () => ({
  LoadingSkeleton: () => <div data-testid="loading-skeleton" />,
}))

vi.mock('../lib/dictionary', () => ({
  dict: {
    labels: {
      commentsTitle: 'Kommentare',
      noComments: 'Noch keine Nachrichten',
      supportTitle: 'Support',
    },
  },
}))

// ── SupportChat (page-level): inner scroll container independent from header ──

describe('SupportChat — page-level scroll isolation', () => {
  beforeEach(() => {
    vi.mocked(useSupportTaskChat).mockReturnValue({
      comments: [
        { id: 'c1', text: 'Support-Nachricht', created_at: '2026-01-01T10:00:00Z', isFromPortal: false, author: { name: 'Team' } },
      ],
      isLoading: false,
      error: null,
      sendMessage: vi.fn(),
      isSending: false,
      isConfigured: true,
      supportTaskId: 'support-1',
      refetch: vi.fn(),
      userName: 'Test User',
    } as unknown as ReturnType<typeof useSupportTaskChat>)
  })

  test('messages list has its own overflow-y-auto scroll container', () => {
    const { container } = render(<SupportChat active />)

    const scrollContainer = container.querySelector('.overflow-y-auto')
    expect(scrollContainer).not.toBeNull()
  })

  test('support header title is outside the scroll container', () => {
    const { container } = render(<SupportChat active />)

    const scrollContainer = container.querySelector('.overflow-y-auto')!
    const heading = screen.getByText('Support')
    expect(scrollContainer).not.toContainElement(heading)
  })

  test('messages are inside the scroll container', () => {
    const { container } = render(<SupportChat active />)

    const scrollContainer = container.querySelector('.overflow-y-auto')!
    expect(scrollContainer).toContainElement(screen.getByText('Support-Nachricht'))
  })

  test('comment input is outside the scroll container', () => {
    const { container } = render(<SupportChat active />)

    const scrollContainer = container.querySelector('.overflow-y-auto')!
    expect(scrollContainer).not.toContainElement(screen.getByTestId('comment-input'))
  })

  test('outer wrapper uses flex-1 (not h-full) to participate correctly in flex chain', () => {
    const { container } = render(<SupportChat active />)

    const outerWrapper = container.firstElementChild!
    expect(outerWrapper.className).toMatch(/flex-1/)
    expect(outerWrapper.className).not.toMatch(/\bh-full\b/)
  })
})
