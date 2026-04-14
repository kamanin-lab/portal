import { describe, test, expect } from 'vitest'
import { mapClickUpStatus, STATUS_LABELS, PRIORITY_LABELS, ACTION_LABELS } from '../lib/status-dictionary'

describe('STATUS_LABELS', () => {
  test('exports labels for all known portal statuses', () => {
    const expected = ['needs_attention', 'awaiting_approval', 'ready', 'open', 'in_progress',
      'approved', 'done', 'on_hold', 'cancelled', 'all']
    expected.forEach(key => {
      expect(STATUS_LABELS[key]).toBeTruthy()
    })
  })
})

describe('PRIORITY_LABELS', () => {
  test('exports labels for all priority levels', () => {
    expect(PRIORITY_LABELS.urgent).toBeTruthy()
    expect(PRIORITY_LABELS.high).toBeTruthy()
    expect(PRIORITY_LABELS.normal).toBeTruthy()
    expect(PRIORITY_LABELS.low).toBeTruthy()
  })
})

describe('ACTION_LABELS', () => {
  test('exports approve and requestChanges labels', () => {
    expect(ACTION_LABELS.approve).toBeTruthy()
    expect(ACTION_LABELS.requestChanges).toBeTruthy()
  })
})

describe('mapClickUpStatus', () => {
  test.each([
    ['to do',            'open'],
    ['in progress',      'in_progress'],
    ['internal review',  'in_progress'],
    ['rework',           'in_progress'],
    ['client review',    'needs_attention'],
    ['awaiting approval','awaiting_approval'],
    ['ready',            'ready'],
    ['approved',         'approved'],
    ['complete',         'done'],
    ['done',             'done'],
    ['closed',           'done'],
    ['on hold',          'on_hold'],
    ['canceled',         'cancelled'],
    ['cancelled',        'cancelled'],
  ])('maps "%s" → "%s"', (input, expected) => {
    expect(mapClickUpStatus(input)).toBe(expected)
  })

  test('is case-insensitive', () => {
    expect(mapClickUpStatus('TO DO')).toBe('open')
    expect(mapClickUpStatus('In Progress')).toBe('in_progress')
    expect(mapClickUpStatus('CLIENT REVIEW')).toBe('needs_attention')
  })

  test('trims whitespace before matching', () => {
    expect(mapClickUpStatus('  to do  ')).toBe('open')
  })

  test('returns "open" for unknown statuses', () => {
    expect(mapClickUpStatus('some weird status')).toBe('open')
    expect(mapClickUpStatus('')).toBe('open')
  })
})
