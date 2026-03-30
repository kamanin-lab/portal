export interface NotificationPreferences {
  task_review: boolean
  task_completed: boolean
  team_comment: boolean
  support_response: boolean
  reminders: boolean
  new_recommendation: boolean
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  task_review: true,
  task_completed: true,
  team_comment: true,
  support_response: true,
  reminders: true,
  new_recommendation: true,
}

export interface Profile {
  id: string
  email: string
  full_name: string | null
  company_name: string | null
  clickup_list_ids: string[] | null
  email_notifications: boolean
  notification_preferences: NotificationPreferences | null
  avatar_url: string | null
  support_task_id: string | null
  clickup_chat_channel_id: string | null
}
