import { useCallback } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { useTaskComments, usePostComment } from './useTaskComments';
import { createLogger } from '../lib/logger';
import type { TaskComment, FileData } from '../types/tasks';

const log = createLogger('useSupportTaskChat');

export interface SupportTaskChatResult {
  comments: TaskComment[];
  isLoading: boolean;
  error: Error | null;
  sendMessage: (text: string, files?: FileData[]) => Promise<void>;
  isSending: boolean;
  refetch: () => void;
  userName: string;
  isConfigured: boolean;
  supportTaskId: string | null;
}

// Thin wrapper: support chat = comment thread for the user's support_task_id.
// Uses the identical pipeline as TaskDetail comments.
export function useSupportTaskChat(): SupportTaskChatResult {
  const { profile, user } = useAuth();
  const supportTaskId = profile?.support_task_id ?? null;

  const { data: comments = [], isLoading, error, refetch } = useTaskComments(supportTaskId);
  const { mutateAsync: postComment, isPending: isSending } = usePostComment();

  const sendMessage = useCallback(
    async (text: string, files: FileData[] = []) => {
      if (!supportTaskId) {
        log.error('Cannot send message: support_task_id not configured');
        throw new Error('Support not configured');
      }
      await postComment({ taskId: supportTaskId, comment: text, files });
    },
    [supportTaskId, postComment]
  );

  const userName = profile?.full_name ?? user?.email?.split('@')[0] ?? 'Sie';

  return {
    comments,
    isLoading: supportTaskId ? isLoading : false,
    error: error as Error | null,
    sendMessage,
    isSending,
    refetch,
    userName,
    isConfigured: !!supportTaskId,
    supportTaskId,
  };
}
