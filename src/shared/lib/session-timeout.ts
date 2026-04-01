// src/shared/lib/session-timeout.ts

export const SESSION_TIMEOUT_MS = 3 * 60 * 60 * 1000  // 3 hours
export const SESSION_WARNING_MS = 5 * 60 * 1000        // warn 5 minutes before

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
