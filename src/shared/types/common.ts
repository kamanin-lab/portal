export interface Profile {
  id: string
  email: string
  full_name: string | null
  company_name: string | null
  clickup_list_ids: string[] | null
  email_notifications: boolean
  avatar_url: string | null
  support_task_id: string | null
  clickup_chat_channel_id: string | null
}
