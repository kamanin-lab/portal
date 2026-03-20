export const MEMORY_SCOPES = ['client', 'project'] as const;
export const MEMORY_CATEGORIES = [
  'profile',
  'communication',
  'technical_constraint',
  'delivery_constraint',
  'decision',
  'risk',
  'commercial_context',
] as const;
export const MEMORY_VISIBILITIES = ['internal', 'shared', 'client_visible'] as const;
export const MEMORY_STATUSES = ['active', 'archived'] as const;
export const MEMORY_SOURCE_TYPES = ['manual'] as const;

export type MemoryScope = typeof MEMORY_SCOPES[number];
export type MemoryCategory = typeof MEMORY_CATEGORIES[number];
export type MemoryVisibility = typeof MEMORY_VISIBILITIES[number];
export type MemoryStatus = typeof MEMORY_STATUSES[number];
export type MemorySourceType = typeof MEMORY_SOURCE_TYPES[number];

export interface MemoryEntry {
  id: string;
  client_id: string;
  project_id: string | null;
  scope: MemoryScope;
  category: MemoryCategory;
  title: string;
  body: string;
  visibility: MemoryVisibility;
  status: MemoryStatus;
  source_type: MemorySourceType;
  source_ref: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
}

export interface MemoryDraft {
  scope: MemoryScope;
  category: MemoryCategory;
  title: string;
  body: string;
  visibility?: MemoryVisibility;
  source_ref?: string | null;
}

export interface MemoryContextKey {
  clientId: string;
  projectId: string;
}

export interface MemoryFilters {
  status?: MemoryStatus;
  scope?: MemoryScope | 'all';
  visibility?: MemoryVisibility | 'all';
}

export interface MemoryValidationResult {
  valid: boolean;
  errors: string[];
}
