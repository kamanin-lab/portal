/**
 * Tests for MeineAufgabenPage 4-tab filter system.
 *
 * Tabs (in order): Nachrichten, Kostenfreigabe, Warten auf Freigabe, Empfehlungen
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MeineAufgabenPage } from '../MeineAufgabenPage'
import type { ClickUpTask } from '@/modules/tickets/types/tasks'

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  tasks: vi.fn<[], { data: ClickUpTask[]; isLoading: boolean }>(),
  unreadCounts: vi.fn(),
}))

vi.mock('@/modules/tickets/hooks/useClickUpTasks', () => ({
  useClickUpTasks: () => mocks.tasks(),
}))

vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'test-user-id' } }),
}))

vi.mock('@/modules/tickets/hooks/useUnreadCounts', () => ({
  useUnreadCounts: () => mocks.unreadCounts(),
}))

vi.mock('@/modules/tickets/components/TaskDetailSheet', () => ({
  TaskDetailSheet: () => null,
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<ClickUpTask> = {}): ClickUpTask {
  return {
    id: overrides.clickup_id ?? 'task-default',
    clickup_id: overrides.clickup_id ?? 'task-default',
    name: 'Default Task',
    description: '',
    status: 'client review',
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

function makeRecommendation(overrides: Partial<ClickUpTask> = {}): ClickUpTask {
  return makeTask({
    clickup_id: 'rec-task-1',
    name: 'Empfehlung: SSL-Zertifikat erneuern',
    status: 'to do',
    tags: [{ name: 'recommendation', color: '#FFD700', background: '#FFF8DC' }],
    ...overrides,
  })
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderPage(queryClient = createQueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MeineAufgabenPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mocks.unreadCounts.mockReturnValue({ taskUnread: {} })
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MeineAufgabenPage 4-tab filter', () => {
  it('renders all 4 tab chips when tasks exist', () => {
    const attentionTask = makeTask({ clickup_id: 'task-1', status: 'client review' })
    mocks.tasks.mockReturnValue({ data: [attentionTask], isLoading: false })

    renderPage()

    expect(screen.getByText('Nachrichten')).toBeInTheDocument()
    expect(screen.getByText('Kostenfreigabe')).toBeInTheDocument()
    expect(screen.getByText('Warten auf Freigabe')).toBeInTheDocument()
    expect(screen.getByText('Empfehlungen')).toBeInTheDocument()
  })

  it('default tab is the first tab with count > 0 (freigabe when only attention tasks)', () => {
    const attentionTask = makeTask({
      clickup_id: 'task-freigabe',
      name: 'Freigabe Task',
      status: 'client review',
    })
    mocks.tasks.mockReturnValue({ data: [attentionTask], isLoading: false })

    renderPage()

    // The "Warten auf Freigabe" chip should be active (bg-accent + white text)
    const freigabeChip = screen.getByRole('button', { name: /Warten auf Freigabe/ })
    expect(freigabeChip.className).toContain('bg-accent')

    // And the matching task should be visible in the grid
    expect(screen.getByText('Freigabe Task')).toBeInTheDocument()
  })

  it('clicking a tab filters the grid', () => {
    const unreadTask = makeTask({
      clickup_id: 'task-unread',
      name: 'Unread Task',
      status: 'in progress',
    })
    const attentionTask = makeTask({
      clickup_id: 'task-attention',
      name: 'Attention Task',
      status: 'client review',
    })
    mocks.unreadCounts.mockReturnValue({ taskUnread: { 'task-unread': 2 } })
    mocks.tasks.mockReturnValue({
      data: [unreadTask, attentionTask],
      isLoading: false,
    })

    renderPage()

    // Default tab should be 'unread' (first non-zero in TAB_ORDER)
    expect(screen.getByText('Unread Task')).toBeInTheDocument()

    // Click "Warten auf Freigabe"
    const freigabeChip = screen.getByRole('button', { name: /Warten auf Freigabe/ })
    fireEvent.click(freigabeChip)

    expect(screen.getByText('Attention Task')).toBeInTheDocument()
    expect(screen.queryByText('Unread Task')).not.toBeInTheDocument()
  })

  it('shows global empty state when all counts are zero', () => {
    mocks.tasks.mockReturnValue({ data: [], isLoading: false })

    renderPage()

    expect(
      screen.getByText('Keine offenen Aufgaben — alles erledigt!')
    ).toBeInTheDocument()
  })

  it('shows recommendation task in Empfehlungen tab', () => {
    const rec = makeRecommendation({ name: 'Empfehlung: SSL-Zertifikat erneuern' })
    mocks.tasks.mockReturnValue({ data: [rec], isLoading: false })

    renderPage()

    // Empfehlungen tab should be the default (only category with count > 0)
    expect(
      screen.getByText('Empfehlung: SSL-Zertifikat erneuern')
    ).toBeInTheDocument()
  })

  it('UI-03: clicking a recommendation card opens the task', () => {
    const rec = makeRecommendation({ clickup_id: 'rec-abc-123' })
    mocks.tasks.mockReturnValue({ data: [rec], isLoading: false })

    renderPage()

    const card = screen.getByRole('button', { name: /Empfehlung: SSL-Zertifikat erneuern/i })
    fireEvent.click(card)

    expect(card).toBeInTheDocument()
  })
})
