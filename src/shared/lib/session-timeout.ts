// src/shared/lib/session-timeout.ts

import { isRemembered } from './supabase'

export const EPHEMERAL_TIMEOUT_MS = 3 * 60 * 60 * 1000       // 3h — shared/unchecked
export const PERSISTENT_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000 // 30d — remembered
export const SESSION_WARNING_MS = 5 * 60 * 1000               // 5min warning

// Backward-compat alias — existing imports still work until migrated
export const SESSION_TIMEOUT_MS = EPHEMERAL_TIMEOUT_MS

export function getEffectiveTimeout(): number {
  return isRemembered() ? PERSISTENT_TIMEOUT_MS : EPHEMERAL_TIMEOUT_MS
}

let lastActivityAt = Date.now()

function recordActivity() {
  lastActivityAt = Date.now()
}

export function getIdleMs(): number {
  return Date.now() - lastActivityAt
}

export function startActivityTracking(): () => void {
  const events = ['mousemove', 'keydown', 'touchstart', 'click', 'scroll'] as const
  events.forEach(e => window.addEventListener(e, recordActivity, { passive: true }))
  return () => events.forEach(e => window.removeEventListener(e, recordActivity))
}
