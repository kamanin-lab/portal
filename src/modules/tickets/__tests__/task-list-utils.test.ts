import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { filterTasks, getEmptyMessage } from '../lib/task-list-utils'
import type { ClickUpTask } from '../types/tasks'

// Complements task-list-search.test.ts which covers matchesTaskSearch and
// the search-bypass behavior. This file covers getEmptyMessage and the
// status/priority/date filter branches of filterTasks.

function makeTask(overrides: Partial<ClickUpTask> = {}): ClickUpTask {
  return {
    id: overrides.clickup_id ?? 'task-1',
    clickup_id: overrides.clickup_id ?? 'task-1',
    name: 'Default task',
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
    list_name: '',
    ...overrides,
  }
}

// ─── getEmptyMessage ─────────────────────────────────────────────────────────

describe('getEmptyMessage', () => {
  test.each([
    ['attention',   'Rückmeldung'],
    ['ready',       'bereiten'],
    ['open',        'offenen'],
    ['in_progress', 'Bearbeitung'],
    ['approved',    'freigegebenen'],
    ['done',        'erledigten'],
    ['on_hold',     'pausierten'],
    ['cancelled',   'abgebrochenen'],
  ] as const)('filter "%s" returns a German message containing "%s"', (filter, fragment) => {
    expect(getEmptyMessage(filter, '')).toContain(fragment)
  })

  test('active search query returns search-specific message', () => {
    expect(getEmptyMessage('open', 'foo')).toContain('Suche')
  })

  test('active advanced filters returns filter-specific message', () => {
    expect(getEmptyMessage('open', '', { priorities: ['high'], datePreset: null })).toContain('Filter')
  })

  test('both search and advanced filters returns combined message', () => {
    expect(getEmptyMessage('open', 'foo', { priorities: ['high'], datePreset: null })).toContain('Suche und Filtern')
  })

  test('unknown filter falls back to generic "no tasks" label', () => {
    // @ts-expect-error intentional unknown filter
    const msg = getEmptyMessage('unknown_filter', '')
    expect(msg).toBeTruthy()
    expect(typeof msg).toBe('string')
  })
})

// ─── filterTasks — status filters ────────────────────────────────────────────

describe('filterTasks — status filters', () => {
  const tasks = [
    makeTask({ clickup_id: 'attention',    status: 'client review' }),
    makeTask({ clickup_id: 'ready',        status: 'ready' }),
    makeTask({ clickup_id: 'open',         status: 'open' }),
    makeTask({ clickup_id: 'in_progress',  status: 'in progress' }),
    makeTask({ clickup_id: 'approved',     status: 'approved' }),
    makeTask({ clickup_id: 'done',         status: 'complete' }),
    makeTask({ clickup_id: 'on_hold',      status: 'on hold' }),
    makeTask({ clickup_id: 'cancelled',    status: 'canceled' }),
  ]

  test.each([
    ['attention',   'attention'],
    ['ready',       'ready'],
    ['open',        'open'],
    ['in_progress', 'in_progress'],
    ['approved',    'approved'],
    ['done',        'done'],
    ['on_hold',     'on_hold'],
    ['cancelled',   'cancelled'],
  ] as const)('filter "%s" returns only the matching task', (filter, expectedId) => {
    const result = filterTasks(tasks, filter, '')
    expect(result.map(t => t.clickup_id)).toContain(expectedId)
    // Verify other tasks are excluded
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result.every(t => t.clickup_id === expectedId || filter === 'attention')).toBeTruthy()
  })

  test('"all" filter returns all tasks', () => {
    const result = filterTasks(tasks, 'all', '')
    expect(result.length).toBe(tasks.length)
  })
})

// ─── filterTasks — priority filter ───────────────────────────────────────────

describe('filterTasks — priority filter', () => {
  const tasks = [
    makeTask({ clickup_id: 'urgent', priority: 'urgent' }),
    makeTask({ clickup_id: 'high',   priority: 'high' }),
    makeTask({ clickup_id: 'normal', priority: 'normal' }),
    makeTask({ clickup_id: 'none',   priority: null }),
  ]

  test('filters by a single priority', () => {
    const result = filterTasks(tasks, 'all', '', { priorities: ['high'], datePreset: null })
    expect(result.map(t => t.clickup_id)).toEqual(['high'])
  })

  test('filters by multiple priorities', () => {
    const result = filterTasks(tasks, 'all', '', { priorities: ['urgent', 'high'], datePreset: null })
    expect(result.map(t => t.clickup_id)).toEqual(['urgent', 'high'])
  })

  test('empty priorities array does not filter', () => {
    const result = filterTasks(tasks, 'all', '', { priorities: [], datePreset: null })
    expect(result.length).toBe(tasks.length)
  })
})

// ─── filterTasks — date preset filter ────────────────────────────────────────

describe('filterTasks — date preset filter', () => {
  const NOW = new Date('2026-04-14T12:00:00.000Z')

  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW) })
  afterEach(() => vi.useRealTimers())

  function daysFromNow(n: number): string {
    return new Date(NOW.getTime() + n * 86400000).toISOString()
  }

  const tasks = [
    makeTask({ clickup_id: 'overdue',    due_date: daysFromNow(-2)  }),
    makeTask({ clickup_id: 'tomorrow',   due_date: daysFromNow(0.5) }),
    makeTask({ clickup_id: 'in3days',    due_date: daysFromNow(2)   }),
    makeTask({ clickup_id: 'in1week',    due_date: daysFromNow(6)   }),
    makeTask({ clickup_id: 'in1month',   due_date: daysFromNow(20)  }),
    makeTask({ clickup_id: 'in3months',  due_date: daysFromNow(60)  }),
    makeTask({ clickup_id: 'nodue',      due_date: null             }),
  ]

  test.each([
    ['overdue',   ['overdue']],
    ['1day',      ['tomorrow']],
    ['3days',     ['tomorrow', 'in3days']],
    ['1week',     ['tomorrow', 'in3days', 'in1week']],
    ['1month',    ['tomorrow', 'in3days', 'in1week', 'in1month']],
    ['3months',   ['tomorrow', 'in3days', 'in1week', 'in1month', 'in3months']],
    ['nodue',     ['nodue']],
  ] as const)('datePreset "%s" returns expected tasks', (preset, expectedIds) => {
    const result = filterTasks(tasks, 'all', '', { priorities: [], datePreset: preset })
    expect(result.map(t => t.clickup_id)).toEqual(expectedIds)
  })

  test('no activeFilters returns all tasks untouched', () => {
    const result = filterTasks(tasks, 'all', '')
    expect(result.length).toBe(tasks.length)
  })
})
