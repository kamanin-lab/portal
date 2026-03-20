import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useEffect, useCallback, useRef } from 'react';
import type { FileData } from '@/components/CommentInput';
import { createLogger } from '@/lib/logger';

const log = createLogger('useTaskComments');

export interface CommentAttachment {
  id: string;
  title: string;
  url: string;
  type?: string;
  size?: number;
}

export interface TaskComment {
  id: string;
  text: string;
  author: {
    id: number;
    name: string;
    email: string;
    avatar: string | null;
  };
  created_at: string;
  attachments?: CommentAttachment[];
  isFromPortal?: boolean;
}

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

interface CachedComment {
  id: string;
  clickup_comment_id: string;
  task_id: string;
  profile_id: string;
  comment_text: string;
  display_text: string | null;
  author_id: number;
  author_name: string;
  author_email: string | null;
  author_avatar: string | null;
  clickup_created_at: string;
  last_synced: string;
  created_at: string;
  is_from_portal: boolean | null;
  attachments?: CommentAttachment[];
}

// Transform cached comment to TaskComment format
function transformCachedComment(cached: CachedComment): TaskComment {
  return {
    id: cached.clickup_comment_id,
    // Use display_text (clean text) if available, fallback to comment_text
    text: cached.display_text || cached.comment_text,
    author: {
      id: cached.author_id,
      name: cached.author_name, // Already first name only
      email: cached.author_email || '',
      avatar: cached.author_avatar,
    },
    created_at: cached.clickup_created_at,
    attachments: Array.isArray(cached.attachments) ? cached.attachments : [],
    isFromPortal: cached.is_from_portal ?? false,
  };
}

// Fetch comments from local cache
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

// Fetch fresh comments from ClickUp via edge function
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

  if (data?.error) {
    throw new Error(data.error);
  }

  return data!;
}

export function useTaskComments(taskId: string | null) {
  const queryClient = useQueryClient();
  const backgroundRefreshRef = useRef<boolean>(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  
  // Ref to capture the latest taskId for stale closure prevention
  const taskIdRef = useRef<string | null>(taskId);
  
  // Keep ref in sync with prop
  useEffect(() => {
    taskIdRef.current = taskId;
  }, [taskId]);

  // Main query - fetches from cache first
  const query = useQuery({
    queryKey: ['task-comments', taskId],
    queryFn: async () => {
      const currentTaskId = taskIdRef.current;
      if (!currentTaskId) return [];
      
      // First, get cached comments for instant display
      const cachedComments = await fetchCachedComments(currentTaskId);
      
      // Check if taskId changed during async operation
      if (taskIdRef.current !== currentTaskId) {
        return []; // Stale - return empty and let new query handle it
      }
      
      // Return cached data immediately if we have it
      // Background refresh will update later
      if (cachedComments.length > 0) {
        log.debug('Returning cached comments', { count: cachedComments.length });
        return cachedComments;
      }
      
      // No cache - fetch from ClickUp directly
      // The edge function will populate the cache
      const freshComments = await fetchFreshComments(currentTaskId);
      
      // Check again if taskId changed
      if (taskIdRef.current !== currentTaskId) {
        return [];
      }
      
      log.debug('Fetched fresh comments', { count: freshComments.length });
      return freshComments;
    },
    enabled: !!taskId,
    staleTime: 1000 * 30, // 30 seconds
  });

  // Background refresh function
  const triggerBackgroundRefresh = useCallback(async () => {
    const currentTaskId = taskIdRef.current;
    if (!currentTaskId || backgroundRefreshRef.current) return;
    
    backgroundRefreshRef.current = true;
    
    try {
      // Fetch fresh comments from ClickUp (this also updates the cache)
      const freshComments = await fetchFreshComments(currentTaskId);
      
      // Only update cache if taskId hasn't changed
      if (taskIdRef.current === currentTaskId) {
        queryClient.setQueryData(['task-comments', currentTaskId], freshComments);
        log.debug('Background refresh complete', { count: freshComments.length });
      }
    } catch (error) {
      // Silent fail for background refresh - we already have cached data
      log.debug('Background refresh failed, using cached data');
    } finally {
      backgroundRefreshRef.current = false;
    }
  }, [queryClient]);

  // Trigger background refresh when we have cached data
  useEffect(() => {
    if (query.data && query.data.length > 0 && !query.isFetching) {
      // Small delay to let the UI render with cached data first
      const timer = setTimeout(() => {
        triggerBackgroundRefresh();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [taskId, query.data?.length, query.isFetching, triggerBackgroundRefresh]);

  // Poll interval ref for proper cleanup
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Poll for new ClickUp replies every 30 seconds while task is open
  useEffect(() => {
    if (!taskId) return;
    
    // Clear any existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    
    pollIntervalRef.current = setInterval(() => {
      if (!backgroundRefreshRef.current) {
        log.debug('Polling for new comments');
        triggerBackgroundRefresh();
      }
    }, 30000);
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [taskId, triggerBackgroundRefresh]);

  // Set up Supabase Realtime subscription for instant updates
  useEffect(() => {
    if (!taskId) return;

    // Clean up existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // Subscribe to new comments for this task
    const channel = supabase
      .channel(`task-comments-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comment_cache',
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          log.debug('Realtime: New comment received');
          
          // Transform and add the new comment to the cache
          const newCachedComment = payload.new as CachedComment;
          const newComment = transformCachedComment(newCachedComment);
          
          // Update query data with new comment at the top
          queryClient.setQueryData(['task-comments', taskId], (old: TaskComment[] | undefined) => {
            if (!old) return [newComment];
            
            // Check if comment already exists (avoid duplicates)
            const exists = old.some((c) => c.id === newComment.id);
            if (exists) return old;
            
            return [newComment, ...old];
          });
        }
      )
      .subscribe((status) => {
        log.debug('Realtime subscription status', { status });
      });

    channelRef.current = channel;

    // Cleanup on unmount or taskId change
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [taskId, queryClient]);

  return {
    ...query,
    refetch: async () => {
      // Manual refetch always goes to ClickUp
      const currentTaskId = taskIdRef.current;
      if (currentTaskId) {
        try {
          const freshComments = await fetchFreshComments(currentTaskId);
          // Only update if taskId hasn't changed
          if (taskIdRef.current === currentTaskId) {
            queryClient.setQueryData(['task-comments', currentTaskId], freshComments);
          }
        } catch (error) {
          // If fetch fails, just use cached data
          query.refetch();
        }
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
      log.info('Comment posted successfully', { hasFiles });
      toast({
        title: "Kommentar gesendet",
        description: hasFiles 
          ? "Ihr Kommentar und die Anhänge wurden an das Team gesendet."
          : "Ihr Kommentar wurde an das Team gesendet.",
      });
      // Invalidate to trigger a fresh fetch (which updates cache too)
      queryClient.invalidateQueries({ queryKey: ['task-comments', variables.taskId] });
    },
    onError: (error: Error) => {
      log.error('Failed to post comment', { error: error.message });
      toast({
        variant: "destructive",
        title: "Kommentar konnte nicht gesendet werden",
        description: error.message || "Bitte versuchen Sie es erneut.",
      });
    },
  });
}
