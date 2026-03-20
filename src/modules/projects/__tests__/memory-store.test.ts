import { beforeEach, describe, expect, test } from 'vitest';
import type { Project } from '../types/project';
import {
  archiveMemoryEntry,
  deriveClientId,
  getMemoryContextKey,
  getMemoryPreview,
  listMemoryEntries,
  resetMemoryStore,
  upsertMemoryEntry,
  validateMemoryEntry,
} from '../lib/memory-store';
import type { MemoryEntry } from '../types/memory';

const project: Project = {
  id: 'project-1',
  name: 'Portal Relaunch',
  type: 'Website',
  client: 'MBM',
  clientInitials: 'MB',
  startDate: '2026-03-01',
  targetDate: '2026-06-01',
  clickupListId: 'list-1',
  clickupPhaseFieldId: null,
  tasksSummary: { needsAttention: 0, inProgress: 0, total: 0 },
  tasks: [],
  updates: [],
  teamWorkingOn: { task: '', eta: '', lastUpdate: '' },
  chapters: [],
};

beforeEach(() => {
  window.localStorage.clear();
  resetMemoryStore([]);
});

describe('memory-store', () => {
  test('derives a deterministic client id from project identity', () => {
    expect(deriveClientId(project)).toBe('client-mbm-mb');
  });

  test('validates scope invariants', () => {
    const invalidProjectEntry: MemoryEntry = {
      id: '1',
      client_id: 'client-1',
      project_id: null,
      scope: 'project',
      category: 'decision',
      title: 'Missing project',
      body: 'Body',
      visibility: 'internal',
      status: 'active',
      source_type: 'manual',
      source_ref: null,
      created_by: 'tester',
      updated_by: 'tester',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      reviewed_at: null,
    };

    expect(validateMemoryEntry(invalidProjectEntry).valid).toBe(false);
  });

  test('creates, lists, and archives project and client entries', () => {
    const context = getMemoryContextKey(project);

    upsertMemoryEntry(context, {
      scope: 'project',
      category: 'decision',
      title: 'Project rule',
      body: 'Project memory body',
    }, 'tester');

    upsertMemoryEntry(context, {
      scope: 'client',
      category: 'communication',
      title: 'Client rule',
      body: 'Client memory body',
      visibility: 'shared',
    }, 'tester');

    const activeEntries = listMemoryEntries(context);
    expect(activeEntries).toHaveLength(2);
    expect(activeEntries.some(entry => entry.scope === 'client' && entry.project_id === null)).toBe(true);
    expect(activeEntries.some(entry => entry.scope === 'project' && entry.project_id === 'project-1')).toBe(true);

    archiveMemoryEntry(activeEntries[0].id, 'tester');

    expect(listMemoryEntries(context)).toHaveLength(1);
    expect(listMemoryEntries(context, { status: 'archived' })).toHaveLength(1);
  });

  test('builds preview entries with client-safe/shared context first', () => {
    const context = getMemoryContextKey(project);

    const entries = [
      upsertMemoryEntry(context, { scope: 'project', category: 'risk', title: 'Internal risk', body: 'Body', visibility: 'internal' }, 'tester'),
      upsertMemoryEntry(context, { scope: 'project', category: 'decision', title: 'Visible decision', body: 'Body', visibility: 'client_visible' }, 'tester'),
      upsertMemoryEntry(context, { scope: 'client', category: 'communication', title: 'Shared preference', body: 'Body', visibility: 'shared' }, 'tester'),
    ];

    expect(getMemoryPreview(entries).map(entry => entry.title)).toEqual([
      'Visible decision',
      'Shared preference',
      'Internal risk',
    ]);
  });
});
