import { useCallback } from 'react';
import { supabase } from '@/shared/lib/supabase';
import { createLogger } from '../lib/logger';
import type { ClickUpTask } from '../types/tasks';

const log = createLogger('useSingleTask');

interface FetchSingleTaskResponse {
  task: ClickUpTask | null;
  message?: string;
}

// Fetches a single task by ClickUp task ID via Edge Function.
// Used for deep-link access (e.g., links from email notifications).
export function useSingleTask() {
  const fetchSingleTask = useCallback(async (taskId: string): Promise<ClickUpTask | null> => {
    if (!taskId || !/^[a-zA-Z0-9]+$/.test(taskId)) {
      log.error('Invalid task ID format');
      return null;
    }

    try {
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

      log.info('Fetched task', { name: data.task.name });
      return data.task;
    } catch (err) {
      log.error('Failed to fetch single task', { error: (err as Error).message });
      return null;
    }
  }, []);

  return { fetchSingleTask };
}
