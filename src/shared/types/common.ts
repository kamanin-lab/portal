export interface NotificationPreferences {
  task_review: boolean
  task_completed: boolean
  team_comment: boolean
  support_response: boolean
  reminders: boolean
  new_recommendation: boolean
  unread_digest: boolean
  project_task_ready: boolean
  project_step_completed: boolean
  project_messages: boolean
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  task_review: true,
  task_completed: true,
  team_comment: true,
  support_response: true,
  reminders: true,
  new_recommendation: true,
  unread_digest: true,
  project_task_ready: true,
  project_step_completed: true,
  project_messages: true,
}

export interface Profile {
  id: string
  email: string
  full_name: string | null
  company_name: string | null
  email_notifications: boolean
  notification_preferences: NotificationPreferences | null
  avatar_url: string | null
}
