import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { Project } from '../types/project';
import {
  archiveMemoryEntry,
  getMemoryContextKey,
  getMemoryPreview,
  resolveProjectMemoryContext,
  installMemoryTestAdapter,
  listMemoryEntries,
  resetMemoryStore,
  uninstallMemoryTestAdapter,
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
  updates: [],
  teamWorkingOn: { task: '', eta: '', lastUpdate: '' },
  chapters: [],
};

beforeEach(() => {
  installMemoryTestAdapter([]);
  resetMemoryStore([]);
});

describe('memory-store', () => {
  test('uses stable backend profile identity for client memory context', () => {
    expect(getMemoryContextKey(project, 'profile-1')).toEqual({
      clientId: 'profile-1',
      projectId: 'project-1',
    });
  });

  test('resolves project memory context to a shared anchored profile instead of current viewer identity', async () => {
    await upsertMemoryEntry(getMemoryContextKey(project, 'anchored-profile'), {
      scope: 'project',
      category: 'decision',
      title: 'Shared anchor',
      body: 'Body',
    }, 'tester');

    await expect(resolveProjectMemoryContext(project, 'different-viewer-profile')).resolves.toEqual({
      clientId: 'anchored-profile',
      projectId: 'project-1',
    });
  });

  test('validates scope invariants', () => {
    const invalidProjectEntry: MemoryEntry = {
      id: '1',
      client_id: 'profile-1',
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

  test('creates, lists, and archives project and client entries', async () => {
    const context = getMemoryContextKey(project, 'profile-1');

    await upsertMemoryEntry(context, {
      scope: 'project',
      category: 'decision',
      title: 'Project rule',
      body: 'Project memory body',
    }, 'tester');

    await upsertMemoryEntry(context, {
      scope: 'client',
      category: 'communication',
      title: 'Client rule',
      body: 'Client memory body',
      visibility: 'shared',
    }, 'tester');

    const activeEntries = await listMemoryEntries(context);
    expect(activeEntries).toHaveLength(2);
    expect(activeEntries.some(entry => entry.scope === 'client' && entry.project_id === null)).toBe(true);
    expect(activeEntries.some(entry => entry.scope === 'project' && entry.project_id === 'project-1')).toBe(true);

    await archiveMemoryEntry(activeEntries[0].id, 'tester');

    expect(await listMemoryEntries(context)).toHaveLength(1);
    expect(await listMemoryEntries(context, { status: 'archived' })).toHaveLength(1);
  });

  test('client-facing reads exclude internal entries in list and preview paths', async () => {
    const context = getMemoryContextKey(project, 'profile-1');

    await upsertMemoryEntry(context, { scope: 'project', category: 'risk', title: 'Internal risk', body: 'Body', visibility: 'internal' }, 'tester');
    await upsertMemoryEntry(context, { scope: 'project', category: 'decision', title: 'Visible decision', body: 'Body', visibility: 'client_visible' }, 'tester');
    await upsertMemoryEntry(context, { scope: 'client', category: 'communication', title: 'Shared preference', body: 'Body', visibility: 'shared' }, 'tester');

    const clientEntries = await listMemoryEntries(context, {}, 'client');
    expect(clientEntries.map(entry => entry.title)).toEqual(['Shared preference', 'Visible decision']);
    expect(clientEntries.some(entry => entry.visibility === 'internal')).toBe(false);

    expect(getMemoryPreview(clientEntries).map(entry => entry.title)).toEqual([
      'Visible decision',
      'Shared preference',
    ]);
  });

  test('internal reads still return internal entries for non-client surfaces', async () => {
    const context = getMemoryContextKey(project, 'profile-1');

    await upsertMemoryEntry(context, { scope: 'project', category: 'risk', title: 'Internal risk', body: 'Body', visibility: 'internal' }, 'tester');
    await upsertMemoryEntry(context, { scope: 'project', category: 'decision', title: 'Visible decision', body: 'Body', visibility: 'client_visible' }, 'tester');

    const internalEntries = await listMemoryEntries(context, {}, 'internal');
    expect(internalEntries).toHaveLength(2);
    expect(getMemoryPreview(internalEntries, 3, 'client').map(entry => entry.title)).toEqual(['Visible decision']);
  });
});

afterEach(() => {
  uninstallMemoryTestAdapter();
});
