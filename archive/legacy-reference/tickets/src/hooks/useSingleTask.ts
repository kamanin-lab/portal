import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ClickUpTask } from '@/hooks/useClickUpTasks';
import { createLogger } from '@/lib/logger';

const log = createLogger('useSingleTask');

interface FetchSingleTaskResponse {
  task: ClickUpTask | null;
  message?: string;
}

/**
 * Hook for fetching a single task by ID directly from ClickUp API.
 * Used when a task isn't in the local cache (e.g., from email links).
 */
export function useSingleTask() {
  const fetchSingleTask = useCallback(async (taskId: string): Promise<ClickUpTask | null> => {
    // Validate taskId format (alphanumeric only)
    if (!taskId || !/^[a-zA-Z0-9]+$/.test(taskId)) {
      log.error('Invalid task ID format');
      return null;
    }

    try {
      log.info('Fetching single task');
      
      const { data, error } = await supabase.functions.invoke<FetchSingleTaskResponse>(
        'fetch-single-task',
        { body: { taskId } }
      );

      if (error) {
        log.error('Failed to fetch single task', { error: error.message });
        return null;
      }

      if (!data?.task) {
        log.info('Task not found or no access', { message: data?.message });
        return null;
      }

      log.info('Successfully fetched task', { name: data.task.name });
      return data.task;
    } catch (err) {
      log.error('Failed to fetch single task', { error: (err as Error).message });
      return null;
    }
  }, []);

  return { fetchSingleTask };
}
