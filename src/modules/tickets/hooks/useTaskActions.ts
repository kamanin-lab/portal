import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/lib/supabase';
import { toast } from 'sonner';
import { dict } from '../lib/dictionary';
import type { TaskAction } from '../types/tasks';

export type { TaskAction };

interface UpdateTaskStatusParams {
  taskId: string;
  action: TaskAction;
  comment?: string;
}

interface UpdateTaskStatusResponse {
  success: boolean;
  newStatus: string;
  message: string;
  error?: string;
}

const ACTION_TOASTS: Record<TaskAction, { success: string; error: string }> = {
  approve:          { success: dict.toasts.approveSuccess,        error: dict.toasts.approveError },
  request_changes:  { success: dict.toasts.requestChangesSuccess, error: dict.toasts.requestChangesError },
  put_on_hold:      { success: dict.toasts.holdSuccess,           error: dict.toasts.holdError },
  resume:           { success: dict.toasts.resumeSuccess,         error: dict.toasts.resumeError },
  cancel:           { success: dict.toasts.cancelSuccess,         error: dict.toasts.cancelError },
};

async function updateTaskStatus({ taskId, action, comment }: UpdateTaskStatusParams): Promise<UpdateTaskStatusResponse> {
  const { data, error } = await supabase.functions.invoke<UpdateTaskStatusResponse>('update-task-status', {
    body: { taskId, action, comment },
  });

  if (error) throw new Error(error.message || 'Failed to update task status');
  if (!data?.success) throw new Error(data?.error || 'Failed to update task status');
  return data;
}

interface UseTaskActionsOptions {
  onSuccess?: () => void;
  toastLabels?: Partial<Record<TaskAction, { success: string; error: string }>>;
}

export function useTaskActions(options?: UseTaskActionsOptions) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: updateTaskStatus,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clickup-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['needs-attention-count'] });
      options?.onSuccess?.();
      const labels = options?.toastLabels?.[variables.action] ?? ACTION_TOASTS[variables.action];
      toast.success(labels?.success ?? data.message);
    },
    onError: (error: Error, variables) => {
      const labels = options?.toastLabels?.[variables.action] ?? ACTION_TOASTS[variables.action];
      toast.error(labels?.error ?? dict.toasts.connectionError, { description: error.message });
    },
  });

  const performAction = (taskId: string, action: TaskAction, comment?: string) =>
    mutation.mutateAsync({ taskId, action, comment });

  return {
    approveTask:     (taskId: string, comment?: string) => performAction(taskId, 'approve', comment),
    requestChanges:  (taskId: string, comment?: string) => performAction(taskId, 'request_changes', comment),
    putOnHold:       (taskId: string, comment?: string) => performAction(taskId, 'put_on_hold', comment),
    resumeTask:      (taskId: string, comment?: string) => performAction(taskId, 'resume', comment),
    cancelTask:      (taskId: string, comment?: string) => performAction(taskId, 'cancel', comment),
    performAction,
    isLoading: mutation.isPending,
    isError:   mutation.isError,
    error:     mutation.error,
  };
}
