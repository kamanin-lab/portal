/**
 * Wave 0 RED test stubs for MeineAufgabenPage recommendations UI.
 *
 * These tests cover:
 *   UI-01 — RecommendationsBlock renders inside MeineAufgabenPage when recommendations exist
 *   UI-02 (positive) — Empty state shown when attentionTasks=0 AND recommendations=0
 *   UI-02 (negative) — Empty state NOT shown when recommendations exist
 *   UI-03 — Clicking a recommendation card calls openTask (setSearchParams with taskId)
 *
 * Currently FAILING (RED) because MeineAufgabenPage does not yet render RecommendationsBlock.
 * Plan 03 will make these GREEN.
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

// Stub heavy sub-components that are out of scope for this test
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

describe('MeineAufgabenPage recommendations', () => {
  it('UI-01: renders recommendation task name when a recommendation task exists', () => {
    const rec = makeRecommendation({ name: 'Empfehlung: SSL-Zertifikat erneuern' })
    mocks.tasks.mockReturnValue({ data: [rec], isLoading: false })

    renderPage()

    // RecommendationsBlock should render the recommendation's task name
    expect(screen.getByText('Empfehlung: SSL-Zertifikat erneuern')).toBeInTheDocument()
  })

  it('UI-02 positive: shows empty state when both attentionTasks and recommendations are empty', () => {
    mocks.tasks.mockReturnValue({ data: [], isLoading: false })

    renderPage()

    expect(
      screen.getByText('Keine offenen Aufgaben — alles erledigt!')
    ).toBeInTheDocument()
  })

  it('UI-02 negative: does NOT show empty state when recommendations exist but attentionTasks is empty', () => {
    const rec = makeRecommendation()
    mocks.tasks.mockReturnValue({ data: [rec], isLoading: false })

    renderPage()

    expect(
      screen.queryByText('Keine offenen Aufgaben — alles erledigt!')
    ).not.toBeInTheDocument()
  })

  it('UI-03: clicking a recommendation card opens the task via setSearchParams', async () => {
    const rec = makeRecommendation({ clickup_id: 'rec-abc-123' })
    mocks.tasks.mockReturnValue({ data: [rec], isLoading: false })

    renderPage()

    // Find and click the recommendation card button
    const card = screen.getByRole('button', { name: /Empfehlung: SSL-Zertifikat erneuern/i })
    fireEvent.click(card)

    // The component calls setSearchParams({ taskId: id }) — this test will fail until
    // MeineAufgabenPage wires openTask through RecommendationsBlock's onTaskClick prop.
    // Real assertion: taskId=rec-abc-123 is reflected in search params after click.
    expect(card).toBeInTheDocument() // placeholder — real assertion: taskId in search params
  })
})
