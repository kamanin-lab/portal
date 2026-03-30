/**
 * Scroll isolation tests
 *
 * Regression tests for the layout fix that ensures the messages list scrolls
 * independently from the task header/description. Before this fix, a single
 * overflow-y-auto container wrapped both task info AND comments, so
 * scrollIntoView on new messages dragged the user away from whatever they
 * were reading in the header area.
 *
 * These tests verify the DOM structure that makes independent scrolling
 * possible — the messages list must live in its own inner scroll container,
 * separate from the task title / description / meta sections.
 */

import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TaskComments } from '../components/TaskComments'
import { TaskDetail } from '../components/TaskDetail'
import { SupportChat } from '../components/SupportChat'
import { useTaskComments } from '../hooks/useTaskComments'
import { useSupportTaskChat } from '../hooks/useSupportTaskChat'
import type { ClickUpTask } from '../types/tasks'

// ── shared mocks ─────────────────────────────────────────────────────────────

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

vi.mock('../hooks/useTaskActions', () => ({
  useTaskActions: vi.fn(() => ({ updateStatus: vi.fn(), isPending: false })),
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

vi.mock('@/shared/components/common/StatusBadge', () => ({
  StatusBadge: () => <div data-testid="status-badge" />,
}))

vi.mock('../components/TaskActions', () => ({
  TaskActions: () => <div data-testid="task-actions" />,
}))

vi.mock('../components/CreditApproval', () => ({
  CreditApproval: () => <div data-testid="credit-approval" />,
}))

vi.mock('../components/RecommendationApproval', () => ({
  RecommendationApproval: () => <div data-testid="recommendation-approval" />,
}))

vi.mock('../lib/status-mapping', () => ({
  mapStatus: (s: string) => s,
}))

vi.mock('../lib/dictionary', () => ({
  dict: {
    labels: {
      commentsTitle: 'Kommentare',
      noComments: 'Noch keine Nachrichten',
      createdBy: 'Erstellt von',
      dueDate: 'Fällig',
      lastActivity: 'Letzte Aktivität',
      supportTitle: 'Support',
    },
  },
}))

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<ClickUpTask> = {}): ClickUpTask {
  return {
    id: 'task-1',
    clickup_id: 'task-1',
    name: 'Beispielaufgabe',
    description: 'Eine lange Beschreibung dieser Aufgabe',
    status: 'open',
    status_color: '#000',
    priority: null,
    priority_color: null,
    due_date: null,
    time_estimate: null,
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T10:00:00.000Z',
    assignees: [],
    tags: [],
    url: '',
    list_id: 'list-1',
    list_name: 'Support',
    credits: null,
    last_activity_at: undefined,
    created_by_name: undefined,
    ...overrides,
  }
}

// ── TaskComments: inner scroll container ──────────────────────────────────────

describe('TaskComments — scroll isolation', () => {
  test('messages list is wrapped in a dedicated overflow-y-auto scroll container', () => {
    vi.mocked(useTaskComments).mockReturnValue({
      data: [
        { id: 'c1', text: 'Erste Nachricht', created_at: '2026-01-01T10:00:00Z', isFromPortal: false, author: { name: 'Team' } },
        { id: 'c2', text: 'Zweite Nachricht', created_at: '2026-01-01T11:00:00Z', isFromPortal: true, author: { name: 'Client' } },
      ],
      isLoading: false,
      error: null,
    } as ReturnType<typeof useTaskComments>)

    const { container } = render(<TaskComments taskId="task-1" />)

    const scrollContainer = container.querySelector('.overflow-y-auto')
    expect(scrollContainer).not.toBeNull()

    // The "Kommentare" heading must be OUTSIDE (not inside) the scroll container
    const heading = screen.getByText('Kommentare')
    expect(scrollContainer).not.toContainElement(heading)

    // The comment input must be OUTSIDE (not inside) the scroll container
    const input = screen.getByTestId('comment-input')
    expect(scrollContainer).not.toContainElement(input)

    // Messages must be INSIDE the scroll container
    expect(scrollContainer).toContainElement(screen.getByText('Erste Nachricht'))
    expect(scrollContainer).toContainElement(screen.getByText('Zweite Nachricht'))
  })

  test('loading skeleton is inside the inner scroll container', () => {
    vi.mocked(useTaskComments).mockReturnValue({ data: [], isLoading: true, error: null } as unknown as ReturnType<typeof useTaskComments>)

    const { container } = render(<TaskComments taskId="task-1" />)

    const scrollContainer = container.querySelector('.overflow-y-auto')
    expect(scrollContainer).toContainElement(screen.getByTestId('loading-skeleton'))
  })

  test('empty state is inside the inner scroll container', () => {
    vi.mocked(useTaskComments).mockReturnValue({ data: [], isLoading: false, error: null } as unknown as ReturnType<typeof useTaskComments>)

    const { container } = render(<TaskComments taskId="task-1" />)

    const scrollContainer = container.querySelector('.overflow-y-auto')
    expect(scrollContainer).toContainElement(screen.getByTestId('empty-state'))
  })

  test('comment input is rendered after (outside) the scroll container in DOM order', () => {
    const { container } = render(<TaskComments taskId="task-1" />)

    const scrollContainer = container.querySelector('.overflow-y-auto')!
    const commentInput = screen.getByTestId('comment-input')

    // Input must come after the scroll container in DOM order
    const position = scrollContainer.compareDocumentPosition(commentInput)
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(scrollContainer).not.toContainElement(commentInput)
  })

  test('scrollIntoView is called once on initial load and not again on comment updates', () => {
    const scrollSpy = window.HTMLElement.prototype.scrollIntoView as ReturnType<typeof vi.fn>
    scrollSpy.mockClear()

    vi.mocked(useTaskComments).mockReturnValue({
      data: [
        { id: 'c1', text: 'Initial', created_at: '2026-01-01T10:00:00Z', isFromPortal: false, author: { name: 'Team' } },
      ],
      isLoading: false,
      error: null,
    } as ReturnType<typeof useTaskComments>)

    const { rerender } = render(<TaskComments taskId="task-1" />)
    expect(scrollSpy).toHaveBeenCalledTimes(1)

    // Simulate a new message arriving (Realtime update)
    vi.mocked(useTaskComments).mockReturnValue({
      data: [
        { id: 'c1', text: 'Initial', created_at: '2026-01-01T10:00:00Z', isFromPortal: false, author: { name: 'Team' } },
        { id: 'c2', text: 'New message', created_at: '2026-01-01T11:00:00Z', isFromPortal: true, author: { name: 'Client' } },
      ],
      isLoading: false,
      error: null,
    } as ReturnType<typeof useTaskComments>)
    rerender(<TaskComments taskId="task-1" />)

    // Must still be 1 — no additional scroll after user could have scrolled up
    expect(scrollSpy).toHaveBeenCalledTimes(1)
  })
})

// ── TaskDetail: fixed header zone separate from comments zone ─────────────────

describe('TaskDetail — scroll isolation', () => {
  test('task title is in the shrink-0 header zone, not the flex-1 comments zone', () => {
    const { container } = render(<TaskDetail task={makeTask()} />)

    const outerWrapper = container.firstElementChild!
    expect(outerWrapper.className).toMatch(/flex/)
    expect(outerWrapper.className).toMatch(/flex-col/)

    const shrinkZone = outerWrapper.querySelector('.shrink-0')
    expect(shrinkZone).not.toBeNull()
    expect(shrinkZone).toContainElement(screen.getByText('Beispielaufgabe'))
  })

  test('task description is in the fixed header zone', () => {
    const { container } = render(
      <TaskDetail task={makeTask({ description: 'Projektbeschreibungstext hier' })} />
    )

    const outerWrapper = container.firstElementChild!
    const shrinkZone = outerWrapper.querySelector('.shrink-0')!
    expect(shrinkZone).toContainElement(screen.getByText('Projektbeschreibungstext hier'))
  })

  test('task title and comments live in separate direct-child DOM zones', () => {
    const { container } = render(<TaskDetail task={makeTask()} />)

    const outerWrapper = container.firstElementChild!
    const children = Array.from(outerWrapper.children)

    // Must have exactly 2 direct children: header zone + comments zone
    expect(children.length).toBe(2)

    const [headerZone, commentsZone] = children

    // Header zone contains the title
    expect(headerZone).toContainElement(screen.getByText('Beispielaufgabe'))

    // Comments zone is flex-1 and must NOT contain the title
    expect(commentsZone.className).toMatch(/flex-1/)
    expect(commentsZone).not.toContainElement(screen.getByText('Beispielaufgabe'))
  })
})

// ── SupportChat: inner scroll container independent from header ───────────────

describe('SupportChat — scroll isolation', () => {
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
