import { describe, test, expect } from 'vitest'
import { SESSION_TIMEOUT_MS, SESSION_WARNING_MS } from '../lib/session-timeout'

describe('session-timeout constants', () => {
  test('SESSION_TIMEOUT_MS is 3 hours', () => {
    expect(SESSION_TIMEOUT_MS).toBe(3 * 60 * 60 * 1000)
  })

  test('SESSION_WARNING_MS is 5 minutes', () => {
    expect(SESSION_WARNING_MS).toBe(5 * 60 * 1000)
  })
})
