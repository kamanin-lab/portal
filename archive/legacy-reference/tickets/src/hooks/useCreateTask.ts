import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { ClickUpTask } from '@/hooks/useClickUpTasks';
import { useAuthContext } from '@/contexts/AuthContext';

interface FileData {
  name: string;
  data: string;
  type: string;
}

interface CreateTaskInput {
  name: string;
  description?: string;
  priority: 1 | 2 | 3 | 4;
  files: File[];
}

interface CreateTaskResponse {
  success: boolean;
  task: {
    id: string;
    name: string;
    url: string;
    attachments: string[];
  };
  warning?: string;
}

const PRIORITY_MAP: Record<number, string> = {
  1: 'urgent',
  2: 'high',
  3: 'normal',
  4: 'low',
};

// Convert File to base64
async function fileToBase64(file: File): Promise<FileData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({
        name: file.name,
        data: base64,
        type: file.type || 'application/octet-stream',
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuthContext();
  const firstName = (profile?.full_name || '').trim().split(' ').filter(Boolean)[0] || null;

  return useMutation({
    mutationFn: async (input: CreateTaskInput): Promise<CreateTaskResponse> => {
      const files: FileData[] = await Promise.all(
        input.files.map(fileToBase64)
      );

      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('You must be logged in to create a task');
      }

      const { data, error } = await supabase.functions.invoke('create-clickup-task', {
        body: {
          name: input.name,
          description: input.description,
          priority: input.priority,
          files,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to create task');
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to create task');
      }

      return data;
    },

    onMutate: async (input: CreateTaskInput) => {
      // Cancel in-flight task queries
      await queryClient.cancelQueries({ queryKey: ['clickup-tasks'] });

      // Snapshot current cache
      const previous = queryClient.getQueryData<ClickUpTask[]>(['clickup-tasks']);

      // Build optimistic ClickUpTask
      const tempId = `temp-${crypto.randomUUID()}`;
      const now = new Date().toISOString();

      const optimisticTask: ClickUpTask & { _optimistic: true; pending_attachments?: Array<{ name: string; size: number }> } = {
        id: tempId,
        clickup_id: tempId,
        name: input.name,
        description: input.description || '',
        status: 'open',
        status_color: '',
        priority: PRIORITY_MAP[input.priority] || 'normal',
        priority_color: null,
        due_date: null,
        time_estimate: null,
        created_at: now,
        updated_at: now,
        assignees: [],
        tags: [],
        url: '',
        list_id: '',
        list_name: '',
        _optimistic: true,
        created_by_name: firstName,
        created_by_user_id: user?.id || null,
        pending_attachments: input.files.length > 0
          ? input.files.map(f => ({ name: f.name, size: f.size }))
          : undefined,
      };

      // Prepend optimistic task to cache
      queryClient.setQueryData<ClickUpTask[]>(['clickup-tasks'], (old) => [
        optimisticTask as ClickUpTask,
        ...(old || []),
      ]);

      return { previous, tempId };
    },

    onSuccess: (data, _input, context) => {
      // Replace optimistic entry in-place with real task data
      if (context?.tempId) {
        queryClient.setQueryData<ClickUpTask[]>(['clickup-tasks'], (old) => {
          if (!old) return old;
          return old.map(task =>
            task.id === context.tempId
              ? {
                  ...task,
                  id: data.task.id,
                  clickup_id: data.task.id,
                  url: data.task.url,
                  _optimistic: undefined,
                  pending_attachments: undefined,
                } as ClickUpTask
              : task
          );
        });
      }

      toast({
        title: "Aufgabe erfolgreich erstellt!",
        description: data.warning 
          ? `Aufgabe „${data.task.name}" erstellt. ${data.warning}`
          : `Aufgabe „${data.task.name}" wurde erfolgreich erstellt.`,
      });
    },

    onError: (error: Error, _input, context) => {
      // Roll back to snapshot
      if (context?.previous) {
        queryClient.setQueryData(['clickup-tasks'], context.previous);
      }
      toast({
        title: "Aufgabe konnte nicht erstellt werden",
        description: error.message,
        variant: "destructive",
      });
    },

    onSettled: () => {
      // No invalidation here — rely on Realtime subscription to update
      // when the webhook syncs the task into task_cache
    },
  });
}

export type { CreateTaskInput };
