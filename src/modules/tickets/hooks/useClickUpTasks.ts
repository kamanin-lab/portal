import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/lib/supabase';
import { useCallback, useEffect, useRef } from 'react';
import { createLogger } from '../lib/logger';
import { useAuth } from '@/shared/hooks/useAuth';
import { transformCachedTask } from '../lib/transforms';
import type { ClickUpTask, CachedTask } from '../types/tasks';

export type { ClickUpTask };

const log = createLogger('useClickUpTasks');

interface DiagnosticsData {
  total_tasks_from_lists: number;
  tasks_with_visibility_field: number;
  tasks_missing_visibility_field: number;
  fallback_fetches_attempted: number;
  fallback_fetches_succeeded: number;
  visible_after_filtering: number;
  sample_visibility_values: Array<{ taskId: string; value: unknown; source: string }>;
}

interface FetchTasksResponse {
  tasks: ClickUpTask[];
  message?: string;
  diagnostics?: DiagnosticsData;
}

async function fetchCachedTasks(): Promise<ClickUpTask[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Read from visible_task_cache view — RLS + department visibility applied server-side.
  // The view wraps task_cache with security_invoker=true (PG 15+), so profile_id
  // and is_visible filters are enforced by the underlying RLS policy.
  //
  // Defense-in-depth: add explicit .eq('profile_id', user.id) even though RLS
  // enforces the same boundary. This catches RLS misconfiguration early and
  // makes the data access intent clear in client code.
  const { data, error } = await supabase
    .from('visible_task_cache')
    .select('*')
    .eq('profile_id', user.id)
    .order('last_activity_at', { ascending: false });

  if (error) {
    log.error('Failed to fetch cached tasks', { error: error.message });
    return [];
  }

  return (data || []).map((row) => transformCachedTask(row as CachedTask));
}

async function fetchClickUpTasks(debug = false): Promise<{ tasks: ClickUpTask[]; diagnostics?: DiagnosticsData }> {
  const { data, error } = await supabase.functions.invoke<FetchTasksResponse>('fetch-clickup-tasks', {
    body: debug ? { debug: true } : {},
  });

  if (error) {
    log.error('Failed to fetch ClickUp tasks', { error: error.message });
    throw new Error(error.message || 'Failed to fetch tasks');
  }

  if (debug && data?.diagnostics) {
    log.debug('ClickUp sync diagnostics', { visible: data.diagnostics.visible_after_filtering });
  }

  return { tasks: data?.tasks || [], diagnostics: data?.diagnostics };
}

async function updateTaskCache(tasks: ClickUpTask[]): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const now = new Date().toISOString();
  log.info('Updating task cache', { count: tasks.length });

  if (tasks.length > 0) {
    const upsertData = tasks.map(task => ({
      clickup_id: task.id,
      profile_id: user.id,
      name: task.name,
      description: task.description,
      status: task.status,
      status_color: task.status_color,
      priority: task.priority,
      priority_color: task.priority_color,
      due_date: task.due_date,
      clickup_url: task.url,
      list_id: task.list_id,
      list_name: task.list_name,
      raw_data: task,
      last_synced: now,
      is_visible: true,
    }));

    const batchSize = 50;
    for (let i = 0; i < upsertData.length; i += batchSize) {
      const batch = upsertData.slice(i, i + batchSize);
      const { error } = await supabase
        .from('task_cache')
        .upsert(batch, { onConflict: 'clickup_id,profile_id', ignoreDuplicates: false })
        .select();
      if (error) log.error('Failed to upsert task cache batch', { error: error.message });
    }

    const currentIds = tasks.map(t => t.id);
    const { error: updateError } = await supabase
      .from('task_cache')
      .update({ is_visible: false, last_synced: now })
      .eq('profile_id', user.id)
      .eq('is_visible', true)
      .not('clickup_id', 'in', `(${currentIds.map(id => `"${id}"`).join(',')})`);
    if (updateError) log.error('Failed to mark stale tasks not visible', { error: updateError.message });
  } else {
    const { error } = await supabase
      .from('task_cache')
      .update({ is_visible: false, last_synced: now })
      .eq('profile_id', user.id)
      .eq('is_visible', true);
    if (error) log.error('Failed to mark all tasks not visible', { error: error.message });
  }
}

export function useClickUpTasks() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;

  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isRefreshingRef = useRef(false);
  const hasRefreshedRef = useRef(false);
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      isRefreshingRef.current = false;
      hasRefreshedRef.current = false;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    };
  }, []);

  // Realtime subscription — matches the working pattern from useProject.ts
  // Key differences vs previous broken version:
  // 1. No status callback on .subscribe() (matches working project pattern)
  // 2. No payload logging in the change handler (simpler, less overhead)
  // 3. Channel name uses unique prefix to avoid any collision
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`task-cache-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'task_cache',
        filter: `profile_id=eq.${userId}`,
      }, () => {
        if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
        realtimeDebounceRef.current = setTimeout(() => {
          queryClient.refetchQueries({ queryKey: ['clickup-tasks'] });
          queryClient.invalidateQueries({ queryKey: ['needs-attention-count'] });
        }, 300);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    };
  }, [userId, queryClient]);

  // Polling fallback — 30s interval ensures data stays fresh even if Realtime
  // channel fails (CHANNEL_ERROR on self-hosted Supabase). Matches architecture
  // spec: "Fallback to 30s polling via React Query staleTime"
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['clickup-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['needs-attention-count'] });
    }, 30000);
    return () => clearInterval(interval);
  }, [userId, queryClient]);

  const query = useQuery({
    queryKey: ['clickup-tasks'],
    queryFn: async () => {
      const cached = await fetchCachedTasks();
      if (cached.length > 0) {
        log.info('Returning cached tasks', { count: cached.length });
        return cached;
      }
      log.info('No cache — fetching fresh from ClickUp');
      const { tasks } = await fetchClickUpTasks(true);
      await updateTaskCache(tasks);
      return tasks;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes — Realtime handles live updates
    refetchOnWindowFocus: true,
  });

  const hasData = (query.data?.length ?? 0) > 0;

  // Background refresh — once per mount to catch up on missed changes
  useEffect(() => {
    if (!hasData || query.isError) return;
    if (hasRefreshedRef.current) return;

    hasRefreshedRef.current = true;
    isRefreshingRef.current = true;
    log.info('Starting background refresh');

    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    fetchClickUpTasks(false)
      .then(async ({ tasks }) => {
        if (controller.signal.aborted || !isMountedRef.current) return;
        await updateTaskCache(tasks);
        if (!controller.signal.aborted && isMountedRef.current) {
          queryClient.invalidateQueries({ queryKey: ['clickup-tasks'] });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        hasRefreshedRef.current = false;
        log.error('Background refresh failed', { error: error.message });
      })
      .finally(() => { isRefreshingRef.current = false; });
  }, [hasData, query.isError, queryClient]);

  const forceRefresh = useCallback(async (debug = true) => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    isRefreshingRef.current = true;
    hasRefreshedRef.current = false;
    try {
      const { tasks } = await fetchClickUpTasks(debug);
      if (!isMountedRef.current) return;
      await updateTaskCache(tasks);
      hasRefreshedRef.current = true;
      await queryClient.invalidateQueries({ queryKey: ['clickup-tasks'] });
    } catch (error) {
      log.error('Force refresh failed', { error: (error as Error).message });
      hasRefreshedRef.current = false;
      throw error;
    } finally {
      isRefreshingRef.current = false;
    }
  }, [queryClient]);

  return { ...query, forceRefresh };
}
