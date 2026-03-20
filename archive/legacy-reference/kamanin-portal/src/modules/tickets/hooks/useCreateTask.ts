import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/lib/supabase';
import { toast } from 'sonner';
import { useAuth } from '@/shared/hooks/useAuth';
import { dict } from '../lib/dictionary';
import type { ClickUpTask, CreateTaskInput, FileData } from '../types/tasks';

const PRIORITY_MAP: Record<number, string> = {
  1: 'urgent',
  2: 'high',
  3: 'normal',
  4: 'low',
};

async function fileToBase64(file: File): Promise<FileData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve({ name: file.name, data: result.split(',')[1], type: file.type || 'application/octet-stream' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface CreateTaskResponse {
  success: boolean;
  task: { id: string; name: string; url: string; attachments: string[] };
  warning?: string;
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const firstName = (profile?.full_name ?? '').trim().split(' ').filter(Boolean)[0] ?? null;

  return useMutation({
    mutationFn: async (input: CreateTaskInput): Promise<CreateTaskResponse> => {
      const files = await Promise.all(input.files.map(fileToBase64));
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('create-clickup-task', {
        body: { name: input.name, description: input.description, priority: input.priority, files },
      });

      if (error) throw new Error(error.message || 'Failed to create task');
      if (!data.success) throw new Error(data.error || 'Failed to create task');
      return data;
    },

    onMutate: async (input: CreateTaskInput) => {
      await queryClient.cancelQueries({ queryKey: ['clickup-tasks'] });
      const previous = queryClient.getQueryData<ClickUpTask[]>(['clickup-tasks']);

      const tempId = `temp-${crypto.randomUUID()}`;
      const now = new Date().toISOString();

      const optimistic: ClickUpTask = {
        id: tempId, clickup_id: tempId,
        name: input.name, description: input.description ?? '',
        status: 'open', status_color: '',
        priority: PRIORITY_MAP[input.priority] ?? 'normal', priority_color: null,
        due_date: null, time_estimate: null,
        created_at: now, updated_at: now,
        assignees: [], tags: [],
        url: '', list_id: '', list_name: '',
        _optimistic: true,
        created_by_name: firstName,
        created_by_user_id: user?.id ?? null,
        pending_attachments: input.files.length > 0
          ? input.files.map(f => ({ name: f.name, size: f.size }))
          : undefined,
      };

      queryClient.setQueryData<ClickUpTask[]>(['clickup-tasks'], old => [optimistic, ...(old ?? [])]);
      return { previous, tempId };
    },

    onSuccess: (data, _input, context) => {
      if (context?.tempId) {
        queryClient.setQueryData<ClickUpTask[]>(['clickup-tasks'], old =>
          old?.map(t => t.id === context.tempId
            ? { ...t, id: data.task.id, clickup_id: data.task.id, url: data.task.url, _optimistic: undefined, pending_attachments: undefined }
            : t
          )
        );
      }
      const desc = data.warning
        ? `${dict.toasts.taskCreated} ${data.warning}`
        : `Anfrage „${data.task.name}" erfolgreich gesendet.`;
      toast.success(dict.toasts.taskCreated, { description: desc });
    },

    onError: (error: Error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(['clickup-tasks'], context.previous);
      toast.error(dict.toasts.taskCreateError, { description: error.message });
    },
  });
}

export type { CreateTaskInput };
