import { useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTaskComments, usePostComment, TaskComment } from '@/hooks/useTaskComments';
import type { FileData } from '@/components/CommentInput';
import { createLogger } from '@/lib/logger';

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

/**
 * Thin wrapper around useTaskComments + usePostComment for support chat.
 * Support chat is simply the task comments view for the user's support_task_id.
 * Uses the exact same pipeline as TaskDetailSheet.
 */
export function useSupportTaskChat(): SupportTaskChatResult {
  const { profile, user } = useAuth();
  const supportTaskId = profile?.support_task_id ?? null;

  // Only call useTaskComments when supportTaskId exists
  const {
    data: comments = [],
    isLoading,
    error,
    refetch,
  } = useTaskComments(supportTaskId);

  const { mutateAsync: postComment, isPending: isSending } = usePostComment();

  const sendMessage = useCallback(
    async (text: string, files: FileData[] = []) => {
      if (!supportTaskId) {
        log.error('Cannot send message: support not configured');
        throw new Error('Support not configured');
      }
      await postComment({ taskId: supportTaskId, comment: text, files });
    },
    [supportTaskId, postComment]
  );

  const userName = profile?.full_name || user?.email?.split('@')[0] || 'You';

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
