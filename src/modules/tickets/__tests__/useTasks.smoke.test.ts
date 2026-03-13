import { describe, test, expect, vi } from 'vitest';

// Smoke test: verify the hook module exports the expected API surface.
// We do NOT render the hook (Supabase/auth deps are not mocked).
// This guards against accidental API breakage during refactoring.

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn(), channel: vi.fn() })),
    channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
    removeChannel: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: null, profile: null, isLoading: false })),
}));

describe('useClickUpTasks exports', () => {
  test('exports useClickUpTasks as a function', async () => {
    const mod = await import('../hooks/useClickUpTasks');
    expect(typeof mod.useClickUpTasks).toBe('function');
  });
});

describe('useTaskComments exports', () => {
  test('exports useTaskComments and usePostComment as functions', async () => {
    const mod = await import('../hooks/useTaskComments');
    expect(typeof mod.useTaskComments).toBe('function');
    expect(typeof mod.usePostComment).toBe('function');
  });
});

describe('useTaskActions exports', () => {
  test('exports useTaskActions as a function', async () => {
    const mod = await import('../hooks/useTaskActions');
    expect(typeof mod.useTaskActions).toBe('function');
  });
});

describe('useCreateTask exports', () => {
  test('exports useCreateTask as a function', async () => {
    const mod = await import('../hooks/useCreateTask');
    expect(typeof mod.useCreateTask).toBe('function');
  });
});

describe('useSupportTaskChat exports', () => {
  test('exports useSupportTaskChat as a function', async () => {
    const mod = await import('../hooks/useSupportTaskChat');
    expect(typeof mod.useSupportTaskChat).toBe('function');
  });
});

describe('useNotifications exports', () => {
  test('exports useNotifications as a function', async () => {
    const mod = await import('../hooks/useNotifications');
    expect(typeof mod.useNotifications).toBe('function');
  });
});

describe('useUnreadCounts exports', () => {
  test('exports useUnreadCounts as a function', async () => {
    const mod = await import('../hooks/useUnreadCounts');
    expect(typeof mod.useUnreadCounts).toBe('function');
  });
});

describe('useSingleTask exports', () => {
  test('exports useSingleTask as a function', async () => {
    const mod = await import('../hooks/useSingleTask');
    expect(typeof mod.useSingleTask).toBe('function');
  });
});
