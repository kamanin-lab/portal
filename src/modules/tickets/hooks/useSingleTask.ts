import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/lib/supabase';
import { createLogger } from '../lib/logger';
import type { ClickUpTask } from '../types/tasks';

const log = createLogger('useSingleTask');

interface FetchSingleTaskResponse {
  task: ClickUpTask | null;
  message?: string;
}

class SingleTaskNotFoundError extends Error {
  constructor(message = 'Task not found') {
    super(message);
    this.name = 'SingleTaskNotFoundError';
  }
}

async function fetchSingleTask(taskId: string): Promise<ClickUpTask> {
  if (!taskId || !/^[a-zA-Z0-9]+$/.test(taskId)) {
    throw new Error('Invalid task ID format');
  }

  const { data, error } = await supabase.functions.invoke<FetchSingleTaskResponse>(
    'fetch-single-task',
    { body: { taskId } }
  );

  if (error) {
    log.error('Failed to fetch single task', { error: error.message, taskId });
    throw new Error(error.message || 'Failed to fetch task');
  }

  if (!data?.task) {
    log.info('Task not found or no access', { taskId, message: data?.message });
    throw new SingleTaskNotFoundError(data?.message || 'Task not found');
  }

  log.info('Fetched task', { taskId, name: data.task.name });
  return data.task;
}

export function useSingleTask(taskId: string | null, enabled = true) {
  const query = useQuery({
    queryKey: ['single-task', taskId],
    queryFn: () => fetchSingleTask(taskId!),
    enabled: enabled && !!taskId,
    staleTime: 1000 * 60,
    retry: false,
  });

  return {
    ...query,
    task: query.data ?? null,
    isNotFound: query.error instanceof SingleTaskNotFoundError,
  };
}
