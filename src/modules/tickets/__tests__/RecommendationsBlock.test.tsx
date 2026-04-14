/**
 * Wave 0 RED test stubs for RecommendationsBlock Später session-snooze behavior.
 *
 * These tests cover:
 *   UI-02 Später: "Später" button click calls onSnooze with task clickup_id;
 *                  onTaskClick is NOT fired (stopPropagation).
 *   UI-02 Später backward-compat: When onSnooze prop is absent, no "Später" button
 *                                  is rendered — existing consumers unaffected.
 *
 * Currently FAILING (RED) because:
 *   - RecommendationsBlock does not yet accept onSnooze prop
 *   - RecommendationCard does not yet render a "Später" button
 * Plan 03 Task 1 will make these GREEN.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RecommendationsBlock } from '../components/RecommendationsBlock'
import type { ClickUpTask } from '../types/tasks'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<ClickUpTask> = {}): ClickUpTask {
  return {
    id: overrides.clickup_id ?? 'rec-task-default',
    clickup_id: overrides.clickup_id ?? 'rec-task-default',
    name: 'Empfehlung: Standard',
    description: '',
    status: 'to do',
    status_color: '#000',
    priority: null,
    priority_color: null,
    due_date: null,
    time_estimate: null,
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T10:00:00.000Z',
    assignees: [],
    tags: [{ name: 'recommendation', color: '#FFD700', background: '#FFF8DC' }],
    url: '',
    list_id: 'list-1',
    list_name: 'Support',
    ...overrides,
  }
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderBlock(
  recommendations: ClickUpTask[],
  onTaskClick: (id: string) => void,
  onSnooze?: (id: string) => void,
  queryClient = createQueryClient(),
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RecommendationsBlock
          recommendations={recommendations}
          onTaskClick={onTaskClick}
          onSnooze={onSnooze}
        />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RecommendationsBlock — Später session-snooze', () => {
  it('UI-02 Später: clicking "Später" button calls onSnooze with clickup_id; onTaskClick not fired', () => {
    const task1 = makeTask({ clickup_id: 'rec-1', name: 'Empfehlung: SSL-Zertifikat' })
    const task2 = makeTask({ clickup_id: 'rec-2', name: 'Empfehlung: PHP Update' })
    const onTaskClick = vi.fn()
    const onSnooze = vi.fn()

    renderBlock([task1, task2], onTaskClick, onSnooze)

    // "Später" button should exist on each card when onSnooze is provided
    const spaeterButtons = screen.getAllByText('Später')
    expect(spaeterButtons.length).toBeGreaterThanOrEqual(1)

    // Click the first card's Später button
    fireEvent.click(spaeterButtons[0])

    // onSnooze called with task1's clickup_id
    expect(onSnooze).toHaveBeenCalledTimes(1)
    expect(onSnooze).toHaveBeenCalledWith('rec-1')

    // Card click (openTask) must NOT fire — stopPropagation prevents it
    expect(onTaskClick).not.toHaveBeenCalled()
  })

  it('UI-02 Später backward-compat: no "Später" button when onSnooze is not provided', () => {
    const task1 = makeTask({ clickup_id: 'rec-1', name: 'Empfehlung: SSL-Zertifikat' })
    const onTaskClick = vi.fn()

    // Render WITHOUT onSnooze — existing TicketsPage callers
    renderBlock([task1], onTaskClick)

    expect(screen.queryByText('Später')).not.toBeInTheDocument()
  })
})
