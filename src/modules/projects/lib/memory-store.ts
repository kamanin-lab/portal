import { supabase } from '@/shared/lib/supabase';
import type { Project } from '../types/project';
import type {
  MemoryContextKey,
  MemoryDraft,
  MemoryEntry,
  MemoryFilters,
  MemoryValidationResult,
} from '../types/memory';

const MEMORY_TABLE = 'project_memory_entries';
const CLIENT_VISIBLE_VISIBILITIES = new Set<MemoryEntry['visibility']>(['shared', 'client_visible']);

type MemoryAudience = 'client' | 'internal';

type MemoryRow = {
  id: string;
  client_id: string;
  project_id: string | null;
  scope: MemoryEntry['scope'];
  category: MemoryEntry['category'];
  title: string;
  body: string;
  visibility: MemoryEntry['visibility'];
  status: MemoryEntry['status'];
  source_type: MemoryEntry['source_type'];
  source_ref: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
};

let memoryTestAdapter: {
  listEntries: (context: MemoryContextKey) => Promise<MemoryEntry[]>;
  upsertEntry: (entry: MemoryEntry) => Promise<MemoryEntry>;
  archiveEntry: (entryId: string, actor: string) => Promise<MemoryEntry>;
  resolveContext?: (project: Project, preferredClientProfileId?: string | null) => Promise<MemoryContextKey | null>;
  reset: (entries: MemoryEntry[]) => void;
} | null = null;

function normalizeMemoryRow(row: MemoryRow): MemoryEntry {
  return {
    id: row.id,
    client_id: row.client_id,
    project_id: row.project_id,
    scope: row.scope,
    category: row.category,
    title: row.title,
    body: row.body,
    visibility: row.visibility,
    status: row.status,
    source_type: row.source_type,
    source_ref: row.source_ref,
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    reviewed_at: row.reviewed_at,
  };
}

export function getMemoryContextKey(project: Project, clientProfileId: string | null | undefined): MemoryContextKey {
  if (!clientProfileId?.trim()) {
    throw new Error('Stable backend client identity is required for project memory context');
  }

  return {
    clientId: clientProfileId,
    projectId: project.id,
  };
}

export async function resolveProjectMemoryContext(project: Project, preferredClientProfileId?: string | null): Promise<MemoryContextKey | null> {
  if (memoryTestAdapter?.resolveContext) {
    return memoryTestAdapter.resolveContext(project, preferredClientProfileId);
  }

  const { data: existingRows } = await supabase
    .from(MEMORY_TABLE)
    .select('client_id, created_at')
    .eq('project_id', project.id)
    .order('created_at', { ascending: true })
    .limit(1);

  const existingClientId = existingRows?.[0]?.client_id;
  if (existingClientId) {
    return getMemoryContextKey(project, existingClientId);
  }

  const { data: accessRows } = await supabase
    .from('project_access')
    .select('profile_id, created_at')
    .eq('project_config_id', project.id)
    .order('created_at', { ascending: true })
    .limit(1);

  const anchoredClientId = accessRows?.[0]?.profile_id ?? preferredClientProfileId ?? null;
  if (!anchoredClientId) return null;
  return getMemoryContextKey(project, anchoredClientId);
}

export function validateMemoryEntry(entry: MemoryEntry): MemoryValidationResult {
  const errors: string[] = [];

  if (!entry.client_id.trim()) errors.push('client_id is required');
  if (!entry.title.trim()) errors.push('title is required');
  if (!entry.body.trim()) errors.push('body is required');

  if (entry.scope === 'client' && entry.project_id !== null) {
    errors.push('client scope entries cannot include project_id');
  }

  if (entry.scope === 'project' && !entry.project_id) {
    errors.push('project scope entries require project_id');
  }

  return { valid: errors.length === 0, errors };
}

function matchesContext(entry: MemoryEntry, context: MemoryContextKey) {
  return entry.client_id === context.clientId
    && (entry.scope === 'client' || entry.project_id === context.projectId);
}

function applyAudienceFilter(entries: MemoryEntry[], audience: MemoryAudience) {
  if (audience === 'internal') return entries;
  return entries.filter(entry => CLIENT_VISIBLE_VISIBILITIES.has(entry.visibility));
}

function applyListFilters(entries: MemoryEntry[], filters: MemoryFilters = {}) {
  const status = filters.status ?? 'active';

  return entries
    .filter(entry => (filters.scope && filters.scope !== 'all' ? entry.scope === filters.scope : true))
    .filter(entry => (filters.visibility && filters.visibility !== 'all' ? entry.visibility === filters.visibility : true))
    .filter(entry => entry.status === status)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

async function listStoredEntries(context: MemoryContextKey): Promise<MemoryEntry[]> {
  if (memoryTestAdapter) {
    return (await memoryTestAdapter.listEntries(context)).filter(entry => matchesContext(entry, context));
  }

  const { data, error } = await supabase
    .from(MEMORY_TABLE)
    .select('*')
    .eq('client_id', context.clientId)
    .or(`scope.eq.client,and(scope.eq.project,project_id.eq.${context.projectId})`)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as MemoryRow[]).map(normalizeMemoryRow);
}

export async function listMemoryEntries(
  context: MemoryContextKey,
  filters: MemoryFilters = {},
  audience: MemoryAudience = 'internal',
): Promise<MemoryEntry[]> {
  const entries = await listStoredEntries(context);
  return applyListFilters(applyAudienceFilter(entries, audience), filters);
}

export function getMemoryPreview(entries: MemoryEntry[], limit = 3, audience: MemoryAudience = 'client') {
  return applyAudienceFilter(entries, audience)
    .sort((a, b) => {
      const visibilityRank = { client_visible: 0, shared: 1, internal: 2 } as const;
      const categoryRank = { decision: 0, risk: 1 } as Record<string, number>;
      return (visibilityRank[a.visibility] - visibilityRank[b.visibility])
        || ((categoryRank[a.category] ?? 5) - (categoryRank[b.category] ?? 5));
    })
    .slice(0, limit);
}

export async function upsertMemoryEntry(context: MemoryContextKey, draft: MemoryDraft, actor: string, existingId?: string): Promise<MemoryEntry> {
  const currentEntries = await listStoredEntries(context);
  const current = existingId ? currentEntries.find(entry => entry.id === existingId) : undefined;
  const now = new Date().toISOString();

  const nextEntry: MemoryEntry = {
    id: current?.id ?? crypto.randomUUID(),
    client_id: context.clientId,
    project_id: draft.scope === 'project' ? context.projectId : null,
    scope: draft.scope,
    category: draft.category,
    title: draft.title.trim(),
    body: draft.body.trim(),
    visibility: draft.visibility ?? current?.visibility ?? 'internal',
    status: current?.status ?? 'active',
    source_type: 'manual',
    source_ref: draft.source_ref ?? current?.source_ref ?? null,
    created_by: current?.created_by ?? actor,
    updated_by: actor,
    created_at: current?.created_at ?? now,
    updated_at: now,
    reviewed_at: current?.reviewed_at ?? null,
  };

  const validation = validateMemoryEntry(nextEntry);
  if (!validation.valid) {
    throw new Error(validation.errors.join(', '));
  }

  if (memoryTestAdapter) {
    return memoryTestAdapter.upsertEntry(nextEntry);
  }

  const { data, error } = await supabase.functions.invoke('manage-project-memory', {
    body: {
      action: 'upsert',
      projectId: context.projectId,
      entryId: existingId,
      draft,
    },
  });

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to save memory entry');
  }

  return normalizeMemoryRow(data as MemoryRow);
}

export async function archiveMemoryEntry(entryId: string, actor: string, projectId?: string): Promise<MemoryEntry> {
  if (memoryTestAdapter) {
    return memoryTestAdapter.archiveEntry(entryId, actor);
  }

  const { data, error } = await supabase.functions.invoke('manage-project-memory', {
    body: {
      action: 'archive',
      entryId,
      projectId,
    },
  });

  if (error || !data) {
    throw new Error(error?.message ?? 'Memory entry not found');
  }

  return normalizeMemoryRow(data as MemoryRow);
}

export function resetMemoryStore(entries: MemoryEntry[] = []) {
  if (memoryTestAdapter) {
    memoryTestAdapter.reset(entries);
  }
}

export function installMemoryTestAdapter(initialEntries: MemoryEntry[] = []) {
  let store = [...initialEntries];

  memoryTestAdapter = {
    async listEntries() {
      return store;
    },
    async upsertEntry(entry) {
      const existingIndex = store.findIndex(item => item.id === entry.id);
      if (existingIndex >= 0) {
        store[existingIndex] = entry;
      } else {
        store = [entry, ...store];
      }
      return entry;
    },
    async archiveEntry(entryId, actor) {
      const current = store.find(entry => entry.id === entryId);
      if (!current) throw new Error('Memory entry not found');
      const nextEntry = {
        ...current,
        status: 'archived' as const,
        updated_by: actor,
        updated_at: new Date().toISOString(),
      };
      store = store.map(entry => (entry.id === entryId ? nextEntry : entry));
      return nextEntry;
    },
    async resolveContext(project, preferredClientProfileId) {
      const anchoredClientId = store.find(entry => entry.project_id === project.id)?.client_id ?? preferredClientProfileId ?? 'profile-1';
      return getMemoryContextKey(project, anchoredClientId);
    },
    reset(entries) {
      store = [...entries];
    },
  };
}

export function uninstallMemoryTestAdapter() {
  memoryTestAdapter = null;
}
