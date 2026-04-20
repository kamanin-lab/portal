import { describe, test, expect } from 'vitest';
import { transformCachedTask, transformCachedComment } from '../lib/transforms';
import type { CachedTask, CachedComment, ClickUpTask } from '../types/tasks';

// raw_data in production stores the ClickUp API response, where status is a nested object.
// The type says ClickUpTask (status: string), but in practice it may be an object.
// Cast to simulate real-world DB data while satisfying the type.
const rawDataFromClickUp = {
  id: 'cu-001',
  clickup_id: 'cu-001',
  name: 'Test Task',
  description: 'desc',
  status: 'in progress',          // would be a nested obj in reality; string here for type compat
  status_color: '#0000ff',
  priority: 'normal',
  priority_color: null,
  due_date: null,
  time_estimate: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  last_activity_at: undefined,
  assignees: [],
  tags: [],
  url: 'https://app.clickup.com/t/cu-001',
  list_id: 'list-1',
  list_name: 'Webprojekte',
  departments: [],
  credits: null,
  created_by_name: null,
  created_by_user_id: null,
} satisfies ClickUpTask;

const baseRow: CachedTask = {
  id: 'uuid-1',
  clickup_id: 'cu-001',
  profile_id: 'profile-1',
  name: 'Test Task',
  description: 'desc',
  status: 'client review',
  status_color: '#f59e0b',
  priority: 'high',
  priority_color: '#ef4444',
  clickup_url: 'https://app.clickup.com/t/cu-001',
  list_id: 'list-1',
  list_name: 'Webprojekte',
  raw_data: rawDataFromClickUp,
  last_synced: '2026-01-03T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  is_visible: true,
  last_activity_at: '2026-01-03T00:00:00Z',
  departments: [],
  credits: null,
  created_by_name: 'Tim',
  created_by_user_id: 'tm001',
  due_date: null,
};

describe('transformCachedTask', () => {
  test('top-level status overrides raw_data.status', () => {
    const result = transformCachedTask(baseRow);
    expect(result.status).toBe('client review');
  });

  test('top-level status_color overrides raw_data status_color', () => {
    const result = transformCachedTask(baseRow);
    expect(result.status_color).toBe('#f59e0b');
  });

  test('top-level priority overrides raw_data priority', () => {
    const result = transformCachedTask(baseRow);
    expect(result.priority).toBe('high');
  });

  test('top-level name used when raw_data has same name', () => {
    const result = transformCachedTask(baseRow);
    expect(result.name).toBe('Test Task');
  });

  test('works without raw_data (fallback path)', () => {
    const row: CachedTask = { ...baseRow, raw_data: null };
    const result = transformCachedTask(row);
    expect(result.status).toBe('client review');
    expect(result.clickup_id).toBe('cu-001');
  });

  test('id and clickup_id come from raw_data in the raw_data path', () => {
    const result = transformCachedTask(baseRow);
    expect(result.id).toBe('cu-001');
    expect(result.clickup_id).toBe('cu-001');
  });

  test('created_by fields come from top-level columns', () => {
    const result = transformCachedTask(baseRow);
    expect(result.created_by_name).toBe('Tim');
    expect(result.created_by_user_id).toBe('tm001');
  });
});

describe('transformCachedComment', () => {
  const baseComment: CachedComment = {
    id: 'cmt-uuid-1',
    clickup_comment_id: 'cmt-001',
    task_id: 'cu-001',
    profile_id: 'profile-1',
    comment_text: 'Raw text',
    display_text: 'Display text',
    author_id: 12345,
    author_name: 'Tim',
    author_email: 'tim@kamanin.at',
    author_avatar: null,
    clickup_created_at: '2026-01-01T10:00:00Z',
    last_synced: '2026-01-01T10:01:00Z',
    created_at: '2026-01-01T10:00:00Z',
    is_from_portal: false,
  };

  test('prefers display_text over comment_text', () => {
    const result = transformCachedComment(baseComment);
    expect(result.text).toBe('Display text');
  });

  test('falls back to comment_text when display_text is null', () => {
    const result = transformCachedComment({ ...baseComment, display_text: null });
    expect(result.text).toBe('Raw text');
  });

  test('maps author fields correctly', () => {
    const result = transformCachedComment(baseComment);
    expect(result.author.name).toBe('Tim');
    expect(result.author.email).toBe('tim@kamanin.at');
  });

  test('isFromPortal reflects is_from_portal', () => {
    expect(transformCachedComment(baseComment).isFromPortal).toBe(false);
    expect(transformCachedComment({ ...baseComment, is_from_portal: true }).isFromPortal).toBe(true);
  });
});
