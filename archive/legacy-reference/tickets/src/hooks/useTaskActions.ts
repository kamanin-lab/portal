import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type TaskAction = 'approve' | 'request_changes' | 'put_on_hold' | 'resume' | 'cancel';

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

const ACTION_LABELS: Record<TaskAction, { success: string; error: string }> = {
  approve: { success: 'Aufgabe wurde freigegeben', error: 'Freigabe fehlgeschlagen' },
  request_changes: { success: 'Änderungen wurden angefordert', error: 'Änderungsanforderung fehlgeschlagen' },
  put_on_hold: { success: 'Aufgabe wurde pausiert', error: 'Pausieren fehlgeschlagen' },
  resume: { success: 'Aufgabe wurde fortgesetzt', error: 'Fortsetzen fehlgeschlagen' },
  cancel: { success: 'Aufgabe wurde abgebrochen', error: 'Abbrechen fehlgeschlagen' },
};

async function updateTaskStatus({ taskId, action, comment }: UpdateTaskStatusParams): Promise<UpdateTaskStatusResponse> {
  const { data, error } = await supabase.functions.invoke<UpdateTaskStatusResponse>('update-task-status', {
    body: { taskId, action, comment },
  });

  if (error) {
    console.error('Error updating task status:', error);
    throw new Error(error.message || 'Failed to update task status');
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Failed to update task status');
  }

  return data;
}

export function useTaskActions() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: updateTaskStatus,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clickup-tasks'] });
      
      const labels = ACTION_LABELS[variables.action];
      toast({
        title: 'Erfolg',
        description: labels?.success || data.message,
      });
    },
    onError: (error: Error, variables) => {
      const labels = ACTION_LABELS[variables.action];
      toast({
        title: labels?.error || 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const performAction = (taskId: string, action: TaskAction, comment?: string) => {
    return mutation.mutateAsync({ taskId, action, comment });
  };

  const approveTask = (taskId: string, comment?: string) => performAction(taskId, 'approve', comment);
  const requestChanges = (taskId: string, comment?: string) => performAction(taskId, 'request_changes', comment);
  const putOnHold = (taskId: string, comment?: string) => performAction(taskId, 'put_on_hold', comment);
  const resumeTask = (taskId: string, comment?: string) => performAction(taskId, 'resume', comment);
  const cancelTask = (taskId: string, comment?: string) => performAction(taskId, 'cancel', comment);

  return {
    approveTask,
    requestChanges,
    putOnHold,
    resumeTask,
    cancelTask,
    performAction,
    isLoading: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  };
}
