import type { CachedTask, ClickUpTask, CachedComment, TaskComment } from '../types/tasks';

// CRITICAL: top-level task_cache columns ALWAYS override raw_data.
// Webhooks update top-level fields first; raw_data may lag behind.
// Never read status or status_color from raw_data — always use the top-level fields.
export function transformCachedTask(cached: CachedTask): ClickUpTask {
  if (cached.raw_data) {
    return {
      ...cached.raw_data,
      // Top-level task_cache columns ALWAYS override raw_data — architecture rule.
      // Webhooks update top-level fields; raw_data may be stale.
      id: cached.clickup_id,
      clickup_id: cached.clickup_id,
      name: cached.name,
      description: cached.description ?? cached.raw_data.description ?? '',
      status: cached.status,
      status_color: cached.status_color ?? cached.raw_data.status_color,
      priority: cached.priority ?? cached.raw_data.priority ?? null,
      priority_color: cached.priority_color ?? cached.raw_data.priority_color ?? null,
      due_date: cached.due_date ?? cached.raw_data.due_date ?? null,
      list_id: cached.list_id ?? cached.raw_data.list_id,
      list_name: cached.list_name ?? cached.raw_data.list_name,
      last_activity_at: cached.last_activity_at ?? cached.raw_data.last_activity_at ?? undefined,
      created_by_name: cached.created_by_name ?? null,
      created_by_user_id: cached.created_by_user_id ?? null,
    };
  }

  // Fallback: construct from top-level columns only
  return {
    id: cached.clickup_id,
    clickup_id: cached.clickup_id,
    name: cached.name,
    description: cached.description ?? '',
    status: cached.status,
    status_color: cached.status_color ?? '',
    priority: cached.priority,
    priority_color: cached.priority_color,
    due_date: cached.due_date,
    time_estimate: null,
    created_at: cached.created_at,
    updated_at: cached.last_synced,
    last_activity_at: cached.last_activity_at ?? undefined,
    assignees: [],
    tags: [],
    url: cached.clickup_url ?? '',
    list_id: cached.list_id ?? '',
    list_name: cached.list_name ?? '',
    created_by_name: cached.created_by_name ?? null,
    created_by_user_id: cached.created_by_user_id ?? null,
  };
}

// Transform a comment_cache row into a TaskComment.
// display_text (cleaned) takes precedence over raw comment_text.
export function transformCachedComment(cached: CachedComment): TaskComment {
  return {
    id: cached.clickup_comment_id,
    text: cached.display_text ?? cached.comment_text,
    author: {
      id: cached.author_id,
      name: cached.author_name,
      email: cached.author_email ?? '',
      avatar: cached.author_avatar,
    },
    created_at: cached.clickup_created_at,
    attachments: Array.isArray(cached.attachments) ? cached.attachments : [],
    isFromPortal: cached.is_from_portal ?? false,
  };
}
