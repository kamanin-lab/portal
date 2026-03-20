import type { Project } from '../types/project';
import type {
  MemoryContextKey,
  MemoryDraft,
  MemoryEntry,
  MemoryFilters,
  MemoryValidationResult,
} from '../types/memory';

const STORAGE_KEY = 'portal.project-memory.v1';

const SEED_ENTRIES: MemoryEntry[] = [
  {
    id: 'seed-client-communication',
    client_id: 'client-mbm-mb',
    project_id: null,
    scope: 'client',
    category: 'communication',
    title: 'Kommunikation in Deutsch, Ton sachlich und direkt',
    body: 'Für Abstimmungen funktionieren kurze, klare Zusammenfassungen am besten. Formale Kommunikation sollte auf Deutsch bleiben, insbesondere bei Freigaben und Status-Updates.',
    visibility: 'shared',
    status: 'active',
    source_type: 'manual',
    source_ref: null,
    created_by: 'system-seed',
    updated_by: 'system-seed',
    created_at: '2026-03-20T10:00:00.000Z',
    updated_at: '2026-03-20T10:00:00.000Z',
    reviewed_at: null,
  },
  {
    id: 'seed-project-decision',
    client_id: 'client-mbm-mb',
    project_id: 'project-1',
    scope: 'project',
    category: 'decision',
    title: 'Navigation zuerst vereinfachen, dann Design vertiefen',
    body: 'Im Relaunch soll die Seitenstruktur vor visuellen Feinheiten festgezogen werden. Das reduziert Schleifen im Design und klärt Freigaben früher.',
    visibility: 'internal',
    status: 'active',
    source_type: 'manual',
    source_ref: null,
    created_by: 'system-seed',
    updated_by: 'system-seed',
    created_at: '2026-03-20T10:15:00.000Z',
    updated_at: '2026-03-20T10:15:00.000Z',
    reviewed_at: null,
  },
  {
    id: 'seed-project-risk',
    client_id: 'client-mbm-mb',
    project_id: 'project-1',
    scope: 'project',
    category: 'risk',
    title: 'Freigaben bündeln, sonst zieht sich die Strukturphase',
    body: 'Einzelne Rückmeldungen über mehrere Tage verteilen die Entscheiderunde unnötig. Für diese Phase besser Sammelfeedback statt kleinteiliger Iterationen einplanen.',
    visibility: 'shared',
    status: 'active',
    source_type: 'manual',
    source_ref: null,
    created_by: 'system-seed',
    updated_by: 'system-seed',
    created_at: '2026-03-20T10:30:00.000Z',
    updated_at: '2026-03-20T10:30:00.000Z',
    reviewed_at: null,
  },
];

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'client';
}

export function deriveClientId(project: Project) {
  return `client-${slugify(project.client)}-${slugify(project.clientInitials)}`;
}

export function getMemoryContextKey(project: Project): MemoryContextKey {
  return {
    clientId: deriveClientId(project),
    projectId: project.id,
  };
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readStoredEntries(): MemoryEntry[] {
  if (!canUseStorage()) return SEED_ENTRIES;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_ENTRIES));
    return SEED_ENTRIES;
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : SEED_ENTRIES;
  } catch {
    return SEED_ENTRIES;
  }
}

function writeStoredEntries(entries: MemoryEntry[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
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

export function listMemoryEntries(context: MemoryContextKey, filters: MemoryFilters = {}): MemoryEntry[] {
  const status = filters.status ?? 'active';
  return readStoredEntries()
    .filter(entry => entry.client_id === context.clientId)
    .filter(entry => {
      if (entry.scope === 'client') return true;
      return entry.project_id === context.projectId;
    })
    .filter(entry => (filters.scope && filters.scope !== 'all' ? entry.scope === filters.scope : true))
    .filter(entry => (filters.visibility && filters.visibility !== 'all' ? entry.visibility === filters.visibility : true))
    .filter(entry => entry.status === status)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

export function getMemoryPreview(entries: MemoryEntry[], limit = 3) {
  return [...entries]
    .sort((a, b) => {
      const visibilityRank = { client_visible: 0, shared: 1, internal: 2 } as const;
      const categoryRank = { decision: 0, risk: 1 } as Record<string, number>;
      return (visibilityRank[a.visibility] - visibilityRank[b.visibility])
        || ((categoryRank[a.category] ?? 5) - (categoryRank[b.category] ?? 5));
    })
    .slice(0, limit);
}

export function upsertMemoryEntry(context: MemoryContextKey, draft: MemoryDraft, actor: string, existingId?: string): MemoryEntry {
  const entries = readStoredEntries();
  const now = new Date().toISOString();
  const current = existingId ? entries.find(entry => entry.id === existingId) : undefined;

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

  const nextEntries = current
    ? entries.map(entry => (entry.id === current.id ? nextEntry : entry))
    : [nextEntry, ...entries];

  writeStoredEntries(nextEntries);
  return nextEntry;
}

export function archiveMemoryEntry(entryId: string, actor: string): MemoryEntry {
  const entries = readStoredEntries();
  const current = entries.find(entry => entry.id === entryId);
  if (!current) throw new Error('Memory entry not found');

  const nextEntry: MemoryEntry = {
    ...current,
    status: 'archived',
    updated_by: actor,
    updated_at: new Date().toISOString(),
  };

  writeStoredEntries(entries.map(entry => (entry.id === entryId ? nextEntry : entry)));
  return nextEntry;
}

export function resetMemoryStore(entries: MemoryEntry[] = SEED_ENTRIES) {
  writeStoredEntries(entries);
}
