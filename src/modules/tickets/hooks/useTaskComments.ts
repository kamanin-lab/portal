import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/lib/supabase';
import { toast } from 'sonner';
import { useEffect, useCallback, useRef } from 'react';
import { createLogger } from '../lib/logger';
import { transformCachedComment } from '../lib/transforms';
import { dict } from '../lib/dictionary';
import type { TaskComment, CachedComment, FileData } from '../types/tasks';

export type { TaskComment };

const log = createLogger('useTaskComments');

interface FetchCommentsResponse {
  comments: TaskComment[];
  error?: string;
}

interface PostCommentResponse {
  success: boolean;
  commentId?: string;
  message?: string;
  error?: string;
}

async function fetchCachedComments(taskId: string): Promise<TaskComment[]> {
  const { data, error } = await supabase
    .from('comment_cache')
    .select('*')
    .eq('task_id', taskId)
    .order('clickup_created_at', { ascending: false });

  if (error) {
    log.error('Failed to fetch cached comments', { error: error.message });
    return [];
  }

  return (data as CachedComment[]).map(transformCachedComment);
}

async function fetchFreshComments(taskId: string): Promise<TaskComment[]> {
  const { data, error } = await supabase.functions.invoke<FetchCommentsResponse>(
    'fetch-task-comments',
    { body: { taskId } }
  );

  if (error) {
    log.error('Failed to fetch fresh comments', { error: error.message });
    throw new Error(error.message || 'Failed to fetch comments');
  }

  return data?.comments || [];
}

async function postTaskComment(
  taskId: string,
  comment: string,
  files?: FileData[]
): Promise<PostCommentResponse> {
  const { data, error } = await supabase.functions.invoke<PostCommentResponse>(
    'post-task-comment',
    { body: { taskId, comment, files } }
  );

  if (error) {
    log.error('Failed to post comment', { error: error.message });
    throw new Error(error.message || 'Failed to post comment');
  }

  if (data?.error) throw new Error(data.error);
  return data!;
}

export function useTaskComments(taskId: string | null) {
  const queryClient = useQueryClient();
  const backgroundRefreshRef = useRef(false);
  const taskIdRef = useRef<string | null>(taskId);

  useEffect(() => { taskIdRef.current = taskId; }, [taskId]);

  const query = useQuery({
    queryKey: ['task-comments', taskId],
    queryFn: async () => {
      const currentId = taskIdRef.current;
      if (!currentId) return [];

      const cached = await fetchCachedComments(currentId);
      if (taskIdRef.current !== currentId) return [];
      if (cached.length > 0) {
        log.debug('Returning cached comments', { count: cached.length });
        return cached;
      }

      const fresh = await fetchFreshComments(currentId);
      if (taskIdRef.current !== currentId) return [];
      return fresh;
    },
    enabled: !!taskId,
    staleTime: 1000 * 30,
  });

  const triggerBackgroundRefresh = useCallback(async () => {
    const currentId = taskIdRef.current;
    if (!currentId || backgroundRefreshRef.current) return;
    backgroundRefreshRef.current = true;
    try {
      const fresh = await fetchFreshComments(currentId);
      if (taskIdRef.current === currentId) {
        queryClient.setQueryData(['task-comments', currentId], fresh);
      }
    } catch {
      log.debug('Background refresh failed, using cached data');
    } finally {
      backgroundRefreshRef.current = false;
    }
  }, [queryClient]);

  // Background refresh when cache is loaded
  useEffect(() => {
    if (query.data && query.data.length > 0 && !query.isFetching) {
      const timer = setTimeout(() => triggerBackgroundRefresh(), 100);
      return () => clearTimeout(timer);
    }
  }, [taskId, query.data?.length, query.isFetching, triggerBackgroundRefresh]);

  // 30-second polling while task is open
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!taskId) return;
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(() => {
      if (!backgroundRefreshRef.current) triggerBackgroundRefresh();
    }, 30000);
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
  }, [taskId, triggerBackgroundRefresh]);

  // Realtime subscription for instant new comments
  useEffect(() => {
    if (!taskId) return;
    // Polling for comments every 10s.
    // comment_cache Realtime subscriptions cause "mismatch" errors on self-hosted
    // Supabase which poison the WebSocket and break task_cache Realtime.
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] });
    }, 10000);
    return () => clearInterval(interval);
  }, [taskId, queryClient]);

  return {
    ...query,
    refetch: async () => {
      const currentId = taskIdRef.current;
      if (!currentId) return;
      try {
        const fresh = await fetchFreshComments(currentId);
        if (taskIdRef.current === currentId) {
          queryClient.setQueryData(['task-comments', currentId], fresh);
        }
      } catch {
        query.refetch();
      }
    },
  };
}

export function usePostComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, comment, files }: { taskId: string; comment: string; files?: FileData[] }) =>
      postTaskComment(taskId, comment, files),
    onSuccess: (_, variables) => {
      const hasFiles = variables.files && variables.files.length > 0;
      toast.success(dict.toasts.commentSent, {
        description: hasFiles ? dict.toasts.commentWithFileDesc : dict.toasts.commentSentDesc,
      });
      queryClient.invalidateQueries({ queryKey: ['task-comments', variables.taskId] });
    },
    onError: (error: Error) => {
      log.error('Failed to post comment', { error: error.message });
      toast.error(dict.toasts.commentError, { description: error.message });
    },
  });
}
