// Core task and comment types for the Tickets module.
// These types mirror the shape of data stored in task_cache and comment_cache.

export type TaskStatus =
  | 'open'
  | 'in_progress'
  | 'needs_attention'
  | 'awaiting_approval'
  | 'ready'
  | 'approved'
  | 'done'
  | 'on_hold'
  | 'cancelled';

export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';

// Shape of a task as returned by useClickUpTasks (transformed from task_cache row)
export interface ClickUpTask {
  id: string;
  clickup_id: string;
  name: string;
  description: string;
  status: string;
  status_color: string;
  priority: string | null;
  priority_color: string | null;
  due_date: string | null;
  time_estimate: number | null;
  created_at: string;
  updated_at: string;
  last_activity_at?: string;
  assignees: Array<{
    id: number;
    username: string;
    email: string;
    avatar: string | null;
  }>;
  tags: Array<{
    name: string;
    color: string;
    background: string;
  }>;
  url: string;
  list_id: string;
  list_name: string;
  credits?: number | null;
  created_by_name?: string | null;
  created_by_user_id?: string | null;
  _optimistic?: boolean;
  pending_attachments?: Array<{ name: string; size: number }>;
}

// Raw row from task_cache table
export interface CachedTask {
  id: string;
  clickup_id: string;
  profile_id: string;
  name: string;
  description: string | null;
  status: string;
  status_color: string | null;
  priority: string | null;
  priority_color: string | null;
  due_date: string | null;
  clickup_url: string | null;
  list_id: string | null;
  list_name: string | null;
  raw_data: ClickUpTask | null;
  last_synced: string;
  created_at: string;
  is_visible: boolean;
  last_activity_at: string | null;
  credits: number | null;
  created_by_name: string | null;
  created_by_user_id: string | null;
}

// Attachment on a comment
export interface CommentAttachment {
  id: string;
  title: string;
  url: string;
  type?: string;
  size?: number;
}

// Transformed comment (from comment_cache row)
export interface TaskComment {
  id: string;
  text: string;
  author: {
    id: number;
    name: string;
    email: string;
    avatar: string | null;
  };
  created_at: string;
  attachments?: CommentAttachment[];
  isFromPortal?: boolean;
}

// Raw row from comment_cache table
export interface CachedComment {
  id: string;
  clickup_comment_id: string;
  task_id: string;
  profile_id: string;
  comment_text: string;
  display_text: string | null;
  author_id: number;
  author_name: string;
  author_email: string | null;
  author_avatar: string | null;
  clickup_created_at: string;
  last_synced: string;
  created_at: string;
  is_from_portal: boolean | null;
  attachments?: CommentAttachment[];
}

// File attachment when posting a comment (base64-encoded)
export interface FileData {
  name: string;
  base64: string;
  type: string;
  size: number;
}

// Input for creating a new ticket/task
export interface CreateTaskInput {
  name: string;
  description?: string;
  priority: 1 | 2 | 3 | 4;
  files: File[];
  listId?: string;
  phaseFieldId?: string;
  phaseOptionId?: string;
}

// Task actions available to the client
export type TaskAction = 'approve' | 'request_changes' | 'put_on_hold' | 'resume' | 'cancel' | 'approve_credits' | 'accept_recommendation' | 'decline_recommendation';

// Notification from the notifications table
export interface Notification {
  id: string;
  profile_id: string;
  type: 'team_reply' | 'status_change' | 'step_ready' | 'project_reply' | 'project_update';
  title: string;
  message: string;
  task_id: string | null;
  comment_id: string | null;
  is_read: boolean;
  created_at: string;
}

// Unread counts (support chat + per-task)
export interface UnreadCounts {
  support: number;
  tasks: Record<string, number>;
}
