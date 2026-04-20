import { describe, test, expect } from 'vitest'

/**
 * Tests for shouldCreateBell and BELL_EVENT_TO_PREF_KEY from
 * supabase/functions/_shared/notifications.ts
 *
 * These verify that the bell notification gate correctly respects
 * notification_preferences, legacy email_notifications fallback,
 * and fail-open behavior for unknown events.
 */
import { shouldCreateBell, BELL_EVENT_TO_PREF_KEY } from '../../supabase/functions/_shared/notifications'

describe('shouldCreateBell', () => {
  test('returns false when pref is explicitly false', () => {
    const profile = {
      notification_preferences: { task_review: false },
    }
    expect(shouldCreateBell(profile, 'task_review')).toBe(false)
  })

  test('returns true when pref is explicitly true', () => {
    const profile = {
      notification_preferences: { task_review: true },
    }
    expect(shouldCreateBell(profile, 'task_review')).toBe(true)
  })

  test('returns true when notification_preferences is null (legacy backward compat)', () => {
    const profile = {
      notification_preferences: null,
      email_notifications: true,
    }
    expect(shouldCreateBell(profile, 'task_review')).toBe(true)
  })

  test('returns true when bellEvent is not in mapping (fail-open)', () => {
    const profile = {
      notification_preferences: { task_review: false },
    }
    expect(shouldCreateBell(profile, 'unknown_event_xyz')).toBe(true)
  })

  test('falls back to legacy email_notifications=false when pref key missing from prefs object', () => {
    // prefs object exists but does NOT contain the key for this event
    const profile = {
      notification_preferences: { task_completed: true } as Record<string, boolean>,
      email_notifications: false,
    }
    expect(shouldCreateBell(profile, 'task_review')).toBe(false)
  })

  test('falls back to legacy email_notifications=true when pref key missing from prefs object', () => {
    const profile = {
      notification_preferences: { task_completed: true } as Record<string, boolean>,
      email_notifications: true,
    }
    expect(shouldCreateBell(profile, 'task_review')).toBe(true)
  })

  test('returns true when notification_preferences is null and email_notifications is undefined (no prefs at all)', () => {
    const profile = {
      notification_preferences: null,
    }
    // email_notifications defaults to !== false → true
    expect(shouldCreateBell(profile, 'task_review')).toBe(true)
  })

  test('maps peer_message bell event to peer_messages pref key', () => {
    const profile = {
      notification_preferences: { peer_messages: false },
    }
    expect(shouldCreateBell(profile, 'peer_message')).toBe(false)
  })

  test('maps step_ready bell event to project_task_ready pref key', () => {
    const profile = {
      notification_preferences: { project_task_ready: false },
    }
    expect(shouldCreateBell(profile, 'step_ready')).toBe(false)
  })

  test('maps project_reply bell event to project_messages pref key', () => {
    const profile = {
      notification_preferences: { project_messages: true },
    }
    expect(shouldCreateBell(profile, 'project_reply')).toBe(true)
  })
})

describe('BELL_EVENT_TO_PREF_KEY', () => {
  test('contains all expected mappings', () => {
    expect(BELL_EVENT_TO_PREF_KEY).toEqual({
      task_review: 'task_review',
      task_completed: 'task_completed',
      task_in_progress: 'task_review',
      credit_approval: 'task_review',
      team_question: 'team_comment',
      peer_message: 'peer_messages',
      new_recommendation: 'new_recommendation',
      step_ready: 'project_task_ready',
      step_completed: 'project_step_completed',
      step_in_progress: 'project_task_ready',
      chapter_completed: 'project_step_completed',
      project_step_status: 'project_task_ready',
      project_reply: 'project_messages',
      support_response: 'support_response',
    })
  })
})
