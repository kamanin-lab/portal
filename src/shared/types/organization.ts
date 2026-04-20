export interface DepartmentCacheEntry {
  id: string
  name: string
  color?: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  clickup_list_ids: string[]
  nextcloud_client_root: string | null
  support_task_id: string | null
  clickup_chat_channel_id: string | null
  clickup_department_field_id: string | null
  departments_cache: DepartmentCacheEntry[]
  created_at: string
  updated_at: string
}
