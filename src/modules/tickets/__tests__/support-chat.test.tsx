import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SupportChat } from '../components/SupportChat'

const mocks = vi.hoisted(() => ({
  supportTaskChat: vi.fn(),
}))

vi.mock('../hooks/useSupportTaskChat', () => ({
  useSupportTaskChat: () => mocks.supportTaskChat(),
}))

vi.mock('@/shared/components/common/MessageBubble', () => ({
  MessageBubble: ({ content }: { content: string }) => <div>{content}</div>,
}))

vi.mock('@/shared/components/common/EmptyState', () => ({
  EmptyState: ({ message }: { message: string }) => <div>{message}</div>,
}))

vi.mock('@/shared/components/common/LoadingSkeleton', () => ({
  LoadingSkeleton: () => <div>loading…</div>,
}))

vi.mock('../components/CommentInput', () => ({
  CommentInput: () => <div>comment-input</div>,
}))

beforeEach(() => {
  mocks.supportTaskChat.mockReturnValue({
    comments: [
      {
        id: 'comment-1',
        text: 'Hallo',
        created_at: '2026-01-01T10:00:00.000Z',
        isFromPortal: false,
        author: { name: 'Portal Team' },
      },
    ],
    isLoading: false,
    error: null,
    sendMessage: vi.fn(),
    isSending: false,
    refetch: vi.fn(),
    userName: 'User',
    isConfigured: true,
    supportTaskId: 'support-1',
  })
})

describe('SupportChat', () => {
  test('calls onRead when support chat is active and ready', () => {
    const onRead = vi.fn()

    render(<SupportChat active onRead={onRead} />)

    expect(screen.getByText('Hallo')).toBeInTheDocument()
    expect(onRead).toHaveBeenCalledTimes(1)
  })

  test('does not call onRead when support chat is inactive', () => {
    const onRead = vi.fn()

    render(<SupportChat active={false} onRead={onRead} />)

    expect(screen.getByText('Hallo')).toBeInTheDocument()
    expect(onRead).not.toHaveBeenCalled()
  })
})
