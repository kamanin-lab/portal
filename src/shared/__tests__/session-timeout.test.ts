import { describe, test, expect, beforeEach, vi } from 'vitest'
import {
  SESSION_TIMEOUT_MS,
  SESSION_WARNING_MS,
  EPHEMERAL_TIMEOUT_MS,
  PERSISTENT_TIMEOUT_MS,
  getEffectiveTimeout,
} from '../lib/session-timeout'
import { REMEMBER_ME_KEY } from '../lib/supabase'

// Mock supabase module so session-timeout can import isRemembered without
// trying to create a real Supabase client (import.meta.env vars are absent in test)
vi.mock('../lib/supabase', async () => {
  const REMEMBER_ME_KEY = 'portal-remember-me'
  return {
    REMEMBER_ME_KEY,
    isRemembered: () => {
      try {
        return localStorage.getItem(REMEMBER_ME_KEY) !== '0'
      } catch {
        return true
      }
    },
    supabase: {
      from: vi.fn(() => ({ select: vi.fn() })),
      channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
      auth: { getSession: vi.fn(), onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })) },
    },
  }
})

describe('session-timeout constants', () => {
  test('EPHEMERAL_TIMEOUT_MS is 3 hours', () => {
    expect(EPHEMERAL_TIMEOUT_MS).toBe(3 * 60 * 60 * 1000)
  })

  test('PERSISTENT_TIMEOUT_MS is 30 days', () => {
    expect(PERSISTENT_TIMEOUT_MS).toBe(30 * 24 * 60 * 60 * 1000)
  })

  test('SESSION_WARNING_MS is 5 minutes', () => {
    expect(SESSION_WARNING_MS).toBe(5 * 60 * 1000)
  })

  test('SESSION_TIMEOUT_MS is backward-compat alias for EPHEMERAL_TIMEOUT_MS', () => {
    expect(SESSION_TIMEOUT_MS).toBe(EPHEMERAL_TIMEOUT_MS)
  })
})

describe('getEffectiveTimeout', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('returns PERSISTENT when flag is absent (fail-safe)', () => {
    expect(getEffectiveTimeout()).toBe(PERSISTENT_TIMEOUT_MS)
  })

  test('returns PERSISTENT when flag is "1"', () => {
    localStorage.setItem(REMEMBER_ME_KEY, '1')
    expect(getEffectiveTimeout()).toBe(PERSISTENT_TIMEOUT_MS)
  })

  test('returns EPHEMERAL when flag is "0"', () => {
    localStorage.setItem(REMEMBER_ME_KEY, '0')
    expect(getEffectiveTimeout()).toBe(EPHEMERAL_TIMEOUT_MS)
  })
})
