import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCallback, useEffect, useRef } from 'react';
import { createLogger } from '@/lib/logger';
import { useAuthContext } from '@/contexts/AuthContext';

const log = createLogger('useClickUpTasks');

export interface ClickUpTask {
  id: string;
  clickup_id: string;
  name: string;
  description: string;
  status: string;
  status_color: string;
  priority: string | null;
  priority_color: string | null;
  due_date: string | null;
  time_estimate: number | null;
  created_at: string;
  updated_at: string;
  last_activity_at?: string;
  assignees: Array<{
    id: number;
    username: string;
    email: string;
    avatar: string | null;
  }>;
  tags: Array<{
    name: string;
    color: string;
    background: string;
  }>;
  url: string;
  list_id: string;
  list_name: string;
  created_by_name?: string | null;
  created_by_user_id?: string | null;
}

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

interface CachedTask {
  id: string;
  clickup_id: string;
  profile_id: string;
  name: string;
  description: string | null;
  status: string;
  status_color: string | null;
  priority: string | null;
  priority_color: string | null;
  due_date: string | null;
  clickup_url: string | null;
  list_id: string | null;
  list_name: string | null;
  raw_data: ClickUpTask | null;
  last_synced: string;
  created_at: string;
  is_visible: boolean;
  last_activity_at: string | null;
  created_by_name: string | null;
  created_by_user_id: string | null;
}

// Transform cached task to ClickUpTask format
function transformCachedTask(cached: CachedTask): ClickUpTask {
  // If we have raw_data, use it directly as it has full task info
  if (cached.raw_data) {
    return {
      ...cached.raw_data,
      status: cached.status,
      status_color: cached.status_color || cached.raw_data.status_color,
      last_activity_at: cached.last_activity_at || cached.raw_data.last_activity_at || undefined,
      created_by_name: cached.created_by_name || null,
      created_by_user_id: cached.created_by_user_id || null,
    };
  }
  
  // Fallback to cached fields
  return {
    id: cached.clickup_id,
    clickup_id: cached.clickup_id,
    name: cached.name,
    description: cached.description || '',
    status: cached.status,
    status_color: cached.status_color || '',
    priority: cached.priority,
    priority_color: cached.priority_color,
    due_date: cached.due_date,
    time_estimate: null,
    created_at: cached.created_at,
    updated_at: cached.last_synced,
    last_activity_at: cached.last_activity_at || undefined,
    assignees: [],
    tags: [],
    url: cached.clickup_url || '',
    list_id: cached.list_id || '',
    list_name: cached.list_name || '',
    created_by_name: cached.created_by_name || null,
    created_by_user_id: cached.created_by_user_id || null,
  };
}

// Fetch cached tasks from Supabase - only visible ones
async function fetchCachedTasks(): Promise<ClickUpTask[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('task_cache')
    .select('*')
    .eq('profile_id', user.id)
    .eq('is_visible', true)  // Only fetch visible tasks from cache
    .order('last_activity_at', { ascending: false });

  if (error) {
    log.error('Failed to fetch cached tasks', { error: error.message });
    return [];
  }

  return (data || []).map(transformCachedTask);
}

// Fetch fresh tasks from ClickUp API (with optional debug mode)
async function fetchClickUpTasks(debug = false): Promise<{ tasks: ClickUpTask[]; diagnostics?: DiagnosticsData }> {
  const { data, error } = await supabase.functions.invoke<FetchTasksResponse>('fetch-clickup-tasks', {
    body: debug ? { debug: true } : {},
  });

  if (error) {
    log.error('Failed to fetch ClickUp tasks', { error: error.message });
    throw new Error(error.message || 'Failed to fetch tasks');
  }

  if (debug && data?.diagnostics) {
    log.debug('ClickUp sync diagnostics', {
      totalTasks: data.diagnostics.total_tasks_from_lists,
      withVisibility: data.diagnostics.tasks_with_visibility_field,
      missingVisibility: data.diagnostics.tasks_missing_visibility_field,
      fallbackAttempted: data.diagnostics.fallback_fetches_attempted,
      fallbackSucceeded: data.diagnostics.fallback_fetches_succeeded,
      visibleAfterFilter: data.diagnostics.visible_after_filtering,
    });
  }

  return { tasks: data?.tasks || [], diagnostics: data?.diagnostics };
}

// Update the cache with fresh tasks
async function updateTaskCache(tasks: ClickUpTask[]): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    log.error('Cannot update cache: no authenticated user');
    return;
  }

  const now = new Date().toISOString();
  log.info('Updating task cache', { count: tasks.length });
  
  // If we have tasks, upsert them as visible
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
      is_visible: true,  // Tasks from API are already filtered by visibility
    }));

    // Upsert in batches of 50 to avoid hitting limits
    const batchSize = 50;
    for (let i = 0; i < upsertData.length; i += batchSize) {
      const batch = upsertData.slice(i, i + batchSize);
      const { error, data } = await supabase
        .from('task_cache')
        .upsert(batch, { 
          onConflict: 'clickup_id,profile_id',
          ignoreDuplicates: false 
        })
        .select();

      if (error) {
        log.error('Failed to upsert task cache batch', { error: error.message });
      } else {
        log.debug('Upserted task batch', { batchSize: batch.length, returned: data?.length || 0 });
      }
    }

    // Mark tasks not in the current visible list as not visible
    const currentClickupIds = tasks.map((t) => t.id);
    
    const { error: updateError, count } = await supabase
      .from('task_cache')
      .update({ is_visible: false, last_synced: now })
      .eq('profile_id', user.id)
      .eq('is_visible', true)
      .not('clickup_id', 'in', `(${currentClickupIds.map(id => `"${id}"`).join(',')})`);

    if (updateError) {
      log.error('Failed to mark stale tasks as not visible', { error: updateError.message });
    } else {
      log.debug('Marked stale tasks as not visible', { count: count ?? 0 });
    }
  } else {
    // No tasks returned - mark all as not visible
    log.info('No visible tasks returned, marking all cached as not visible');
    const { error, count } = await supabase
      .from('task_cache')
      .update({ is_visible: false, last_synced: now })
      .eq('profile_id', user.id)
      .eq('is_visible', true);

    if (error) {
      log.error('Failed to mark all tasks as not visible', { error: error.message });
    } else {
      log.debug('Marked all tasks as not visible', { count: count ?? 0 });
    }
  }
}

export function useClickUpTasks() {
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  const userId = user?.id;
  
  // Ref for tracking if component is mounted (for cancellation)
  const isMountedRef = useRef(true);
  // Ref for AbortController to cancel background refresh
  const abortControllerRef = useRef<AbortController | null>(null);
  // Ref to track if background refresh is in progress
  const isRefreshingRef = useRef(false);
  // Ref to track if background refresh already completed in this session
  const hasRefreshedRef = useRef(false);
  // Ref for debounced invalidation timer
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      isRefreshingRef.current = false;
      hasRefreshedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (realtimeDebounceRef.current) {
        clearTimeout(realtimeDebounceRef.current);
      }
    };
  }, []);

  // Realtime subscription to task_cache for near-instant status updates
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`task-cache-updates-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'task_cache',
          filter: `profile_id=eq.${userId}`,
        },
        () => {
          if (realtimeDebounceRef.current) {
            clearTimeout(realtimeDebounceRef.current);
          }
          realtimeDebounceRef.current = setTimeout(() => {
            log.info('Realtime task_cache update — invalidating query');
            queryClient.invalidateQueries({ queryKey: ['clickup-tasks'] });
          }, 300);
        }
      )
      .subscribe((status) => {
        log.debug('task_cache realtime subscription status', { status });
      });

    return () => {
      supabase.removeChannel(channel);
      if (realtimeDebounceRef.current) {
        clearTimeout(realtimeDebounceRef.current);
      }
    };
  }, [userId, queryClient]);

  // Main query - PURE function, only reads from task_cache
  const query = useQuery({
    queryKey: ['clickup-tasks'],
    queryFn: async () => {
      // First, try to get cached visible tasks
      const cachedTasks = await fetchCachedTasks();
      
      if (cachedTasks.length > 0) {
        log.info('Returning cached tasks', { count: cachedTasks.length });
        return cachedTasks;
      }

      // No cache - fetch fresh data (blocking, first load only)
      log.info('No cached tasks, fetching fresh from ClickUp with diagnostics');
      const { tasks: freshTasks } = await fetchClickUpTasks(true);
      
      // Cache the fresh data
      await updateTaskCache(freshTasks);
      
      return freshTasks;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false, // Disable auto-refetch, we control it manually
  });

  // Stable dependencies for background refresh effect
  const dataLen = query.data?.length ?? 0;
  const dataUpdatedAt = query.dataUpdatedAt;

  // Background refresh effect - runs ONCE when we have cached data
  useEffect(() => {
    // Skip if:
    // - No data yet (still loading)
    // - Already refreshing
    // - Already refreshed in this session
    // - Query is in error state
    if (dataLen === 0) return;
    if (isRefreshingRef.current) return;
    if (hasRefreshedRef.current) return;
    if (query.isError) return;
    
    // Mark as refreshed BEFORE starting (prevent re-entry even if updateTaskCache fails)
    hasRefreshedRef.current = true;
    isRefreshingRef.current = true;
    
    log.info('Starting background refresh');
    
    // Cancel any existing background refresh
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    fetchClickUpTasks(false)
      .then(async ({ tasks: freshTasks }) => {
        // Check if aborted or component unmounted
        if (controller.signal.aborted || !isMountedRef.current) {
          log.debug('Background refresh cancelled');
          return;
        }
        
        log.info('Background refresh complete', { count: freshTasks.length });
        await updateTaskCache(freshTasks);
        
        // Invalidate to refetch from task_cache with correct ORDER BY
        if (!controller.signal.aborted && isMountedRef.current) {
          queryClient.invalidateQueries({ queryKey: ['clickup-tasks'] });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          log.debug('Background refresh aborted');
          return;
        }
        log.error('Background refresh failed', { error: error.message });
        // Allow retry on next opportunity if refresh failed
        hasRefreshedRef.current = false;
      })
      .finally(() => {
        isRefreshingRef.current = false;
      });
  }, [dataLen, dataUpdatedAt, query.isError, queryClient]);

  // Force refresh function (with debug mode for troubleshooting)
  const forceRefresh = useCallback(async (debug = true) => {
    // Cancel any existing background refresh
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Reset flags to allow refresh
    isRefreshingRef.current = true;
    hasRefreshedRef.current = false;
    
    try {
      log.info('Force refresh triggered', { debug });
      const { tasks: freshTasks } = await fetchClickUpTasks(debug);
      
      // Check if still mounted
      if (!isMountedRef.current) {
        log.debug('Force refresh completed but component unmounted');
        return;
      }
      
      await updateTaskCache(freshTasks);
      
      // Mark as completed
      hasRefreshedRef.current = true;
      
      // Invalidate to refetch from task_cache with correct ORDER BY
      await queryClient.invalidateQueries({ queryKey: ['clickup-tasks'] });
      log.info('Force refresh complete', { count: freshTasks.length });
    } catch (error) {
      log.error('Force refresh failed', { error: (error as Error).message });
      // Allow retry if force refresh failed
      hasRefreshedRef.current = false;
      throw error;
    } finally {
      isRefreshingRef.current = false;
    }
  }, [queryClient]);

  return {
    ...query,
    forceRefresh,
  };
}
