import { describe, expect, test } from 'vitest'
import { filterTasks, matchesTaskSearch } from '../components/TaskList'
import type { ClickUpTask } from '../types/tasks'

function makeTask(overrides: Partial<ClickUpTask>): ClickUpTask {
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

describe('matchesTaskSearch', () => {
  test('matches by task name, description, and list name', () => {
    const byName = makeTask({ name: 'Checkout broken' })
    const byDescription = makeTask({ description: 'Customer cannot upload invoice' })
    const byList = makeTask({ list_name: 'Support Board' })

    expect(matchesTaskSearch(byName, 'checkout')).toBe(true)
    expect(matchesTaskSearch(byDescription, 'invoice')).toBe(true)
    expect(matchesTaskSearch(byList, 'support')).toBe(true)
  })

  test('ignores blank optional fields safely', () => {
    const task = makeTask({ name: 'Website task', description: '', list_name: '' })

    expect(matchesTaskSearch(task, 'website')).toBe(true)
    expect(matchesTaskSearch(task, 'missing')).toBe(false)
  })
})

describe('filterTasks search behavior', () => {
  test('keeps existing filters while expanding text search fields', () => {
    const tasks = [
      makeTask({ clickup_id: 'a', name: 'Alpha', description: 'Needs invoice upload', status: 'open' }),
      makeTask({ clickup_id: 'b', name: 'Beta', list_name: 'Support Board', status: 'open' }),
      makeTask({ clickup_id: 'c', name: 'Gamma', description: 'Invoice mentioned here too', status: 'complete' }),
    ]

    const result = filterTasks(tasks, 'open', 'invoice')

    expect(result.map(task => task.clickup_id)).toEqual(['a'])
  })
})
