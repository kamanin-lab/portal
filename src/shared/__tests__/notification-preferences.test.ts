import { describe, test, expect } from 'vitest'
import type { NotificationPreferences } from '@/shared/types/common'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/shared/types/common'

describe('NotificationPreferences', () => {
  test('DEFAULT_NOTIFICATION_PREFERENCES includes peer_messages defaulting to true', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.peer_messages).toBe(true)
  })

  test('peer_messages key is assignable in NotificationPreferences interface', () => {
    const prefs: NotificationPreferences = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      peer_messages: false,
    }
    expect(prefs.peer_messages).toBe(false)
  })
})
