// Task and user types for the client portal

export type TaskStatus = 
  | 'open' 
  | 'in_progress' 
  | 'needs_attention' 
  | 'approved' 
  | 'done'
  | 'on_hold'
  | 'cancelled';

export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  timeEstimate: number | null;
  clickupUrl: string;
  listId: string;
  listName: string;
  lastSynced: string;
  createdAt: string;
  lastActivityAt?: string;
  createdByName?: string | null;
  createdByUserId?: string | null;
  _optimistic?: boolean;
  pendingAttachments?: Array<{ name: string; size: number }>;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  companyName: string;
  clickupListIds: string[];
  emailNotifications: boolean;
  avatarUrl?: string;
}

export interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}
