export type StepStatus = 'committed' | 'awaiting_input' | 'upcoming_locked';
export type ChapterStatus = 'completed' | 'current' | 'upcoming';
export type UpdateType = 'file' | 'status' | 'message';
export type FileType = 'pdf' | 'img' | 'jpg' | 'png' | 'svg' | 'doc';
export type TaskStatus = 'needs-attention' | 'in-progress';
export type MessageRole = 'team' | 'client';

export interface ProjectTask {
  id: string;
  title: string;
  status: TaskStatus;
  stepId: string;
}

export interface Update {
  text: string;
  time: string;
  type: UpdateType;
}

export interface FileItem {
  name: string;
  size: string;
  date: string;
  type: FileType;
  author: string;
}

export interface Message {
  author: string;
  role: MessageRole;
  text: string;
  time: string;
}

export interface Step {
  id: string;
  clickupTaskId: string;
  title: string;
  status: StepStatus;
  updatedAt: string | null;
  taskIds: string[];
  description: string;
  whyItMatters: string;
  whatBecomesFixed: string;
  files: FileItem[];
  messages: Message[];
  commentCount: number;
}

// Database row types (from Supabase cache tables)
export interface ProjectConfigRow {
  id: string;
  clickup_list_id: string;
  clickup_phase_field_id: string | null;
  name: string;
  type: string;
  client_name: string;
  client_initials: string;
  start_date: string | null;
  target_date: string | null;
  is_active: boolean;
}

export interface ChapterConfigRow {
  id: string;
  project_config_id: string;
  clickup_cf_option_id: string | null;
  title: string;
  sort_order: number;
  narrative: string;
  next_narrative: string;
  is_active: boolean;
}

export interface ProjectTaskCacheRow {
  id: string;
  clickup_id: string;
  project_config_id: string;
  chapter_config_id: string | null;
  name: string;
  description: string | null;
  status: string;
  status_color: string | null;
  due_date: string | null;
  assignees: Array<{ id: number; username: string; email: string; avatar: string | null }>;
  attachments: Array<{ name: string; url: string; size: number; type: string; date: string }>;
  raw_data: unknown;
  is_visible: boolean;
  last_synced: string;
  last_activity_at: string | null;
}

export interface StepEnrichmentRow {
  id: string;
  clickup_task_id: string;
  why_it_matters: string;
  what_becomes_fixed: string;
  sort_order: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  type: string;
  clientName: string;
  clientInitials: string;
  isActive: boolean;
}

export interface Chapter {
  id: string;
  title: string;
  order: number;
  narrative: string;
  nextNarrative: string;
  steps: Step[];
}

export interface TeamWorkingOn {
  task: string;
  eta: string;
  lastUpdate: string;
}

export interface TasksSummary {
  needsAttention: number;
  inProgress: number;
  total: number;
}

export interface Project {
  id: string;
  name: string;
  type: string;
  client: string;
  clientInitials: string;
  startDate: string;
  targetDate: string;
  tasksSummary: TasksSummary;
  tasks: ProjectTask[];
  updates: Update[];
  teamWorkingOn: TeamWorkingOn;
  chapters: Chapter[];
}

export interface StepWithChapter {
  step: Step;
  chapter: Chapter;
}
