import { describe, expect, test, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TaskDetailSheet } from '../components/TaskDetailSheet'
import type { ClickUpTask } from '../types/tasks'

const mocks = vi.hoisted(() => ({
  singleTask: vi.fn(),
  markAsRead: vi.fn(),
}))

vi.mock('../hooks/useSingleTask', () => ({
  useSingleTask: (...args: unknown[]) => mocks.singleTask(...args),
}))

vi.mock('../hooks/useUnreadCounts', () => ({
  useUnreadCounts: () => ({ markAsRead: mocks.markAsRead }),
}))

vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

vi.mock('../components/TaskDetail', () => ({
  TaskDetail: ({ task }: { task: ClickUpTask }) => <div data-testid="task-detail">{task.name}</div>,
}))

vi.mock('../components/TaskComments', () => ({
  TaskCommentComposer: () => <div data-testid="comment-composer" />,
  TaskCommentsList: () => <div data-testid="comments-list" />,
}))

function makeTask(overrides: Partial<ClickUpTask> = {}): ClickUpTask {
  return {
    id: overrides.clickup_id ?? 'task-1',
    clickup_id: overrides.clickup_id ?? 'task-1',
    name: 'Fallback task',
    description: '',
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
    ...overrides,
  }
}

beforeEach(() => {
  mocks.markAsRead.mockReset()
  mocks.singleTask.mockReturnValue({
    task: null,
    isLoading: false,
    isError: false,
    isNotFound: false,
    error: null,
  })
})

describe('TaskDetailSheet', () => {
  test('renders fallback single-task result when task is missing from cached list', () => {
    mocks.singleTask.mockReturnValue({
      task: makeTask({ name: 'Recovered from fallback' }),
      isLoading: false,
      isError: false,
      isNotFound: false,
      error: null,
    })

    render(<TaskDetailSheet taskId="task-1" onClose={() => {}} tasks={[]} />)

    expect(screen.getByTestId('task-detail')).toHaveTextContent('Recovered from fallback')
  })

  test('shows explicit loading state while tasks are loading from parent', () => {
    render(<TaskDetailSheet taskId="task-1" onClose={() => {}} tasks={[]} isTasksLoading={true} />)

    expect(screen.getByText('Aufgabe wird geladen')).toBeInTheDocument()
  })

  test('shows explicit error state when single-task fallback fails', () => {
    mocks.singleTask.mockReturnValue({
      task: null,
      isLoading: false,
      isError: true,
      isNotFound: false,
      error: new Error('Backend unavailable'),
    })

    render(<TaskDetailSheet taskId="task-500" onClose={() => {}} tasks={[]} />)

    expect(screen.getByText('Aufgabe konnte nicht geladen werden')).toBeInTheDocument()
    expect(screen.getByText('Backend unavailable')).toBeInTheDocument()
  })

  test('shows explicit not-found state when fallback confirms task is unavailable', () => {
    mocks.singleTask.mockReturnValue({
      task: null,
      isLoading: false,
      isError: true,
      isNotFound: true,
      error: new Error('Task not found'),
    })

    render(<TaskDetailSheet taskId="task-404" onClose={() => {}} tasks={[]} />)

    expect(screen.getByText('Aufgabe nicht gefunden')).toBeInTheDocument()
  })

  test('renders task from parent tasks prop when available', () => {
    const parentTasks = [makeTask({ clickup_id: 'task-42', name: 'From parent cache' })]

    render(<TaskDetailSheet taskId="task-42" onClose={() => {}} tasks={parentTasks} />)

    expect(screen.getByTestId('task-detail')).toHaveTextContent('From parent cache')
  })
})
