import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createLogger } from '@/lib/logger';

const log = createLogger('useUnreadCounts');

export interface UnreadCounts {
  support: number;
  tasks: Record<string, number>;
}

interface ReadReceipt {
  context_type: string;
  last_read_at: string;
}

async function fetchUnreadCounts(userId: string): Promise<UnreadCounts> {
  // 1. Fetch profile to get support_task_id
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('support_task_id')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    log.error('Failed to fetch profile for support_task_id', { error: profileError.message });
  }

  const supportTaskId = profile?.support_task_id ?? null;

  // 2. Fetch read receipts
  const { data: receiptsData, error: receiptsError } = await supabase
    .from('read_receipts')
    .select('context_type, last_read_at')
    .eq('profile_id', userId);

  if (receiptsError) {
    log.error('Failed to fetch read receipts', { error: receiptsError.message });
    throw receiptsError;
  }

  const receiptsMap: Record<string, string> = {};
  receiptsData?.forEach((r: ReadReceipt) => {
    receiptsMap[r.context_type] = r.last_read_at;
  });

  // 3. Calculate support unread from comment_cache (NOT support_messages)
  let supportCount = 0;
  if (supportTaskId) {
    const supportLastRead = receiptsMap['support'] || null;
    let supportQuery = supabase
      .from('comment_cache')
      .select('id', { count: 'exact', head: true })
      .eq('task_id', supportTaskId)
      .eq('profile_id', userId)
      .eq('is_from_portal', false); // Team messages only

    if (supportLastRead) {
      supportQuery = supportQuery.gt('clickup_created_at', supportLastRead);
    }

    const { count, error: supportError } = await supportQuery;
    if (supportError) {
      log.error('Failed to fetch support unread count', { error: supportError.message });
    }
    supportCount = count || 0;
  }

  // 4. Fetch task comments unread counts (exclude support task from regular task counts)
  const { data: comments, error: commentsError } = await supabase
    .from('comment_cache')
    .select('task_id, clickup_created_at')
    .eq('profile_id', userId)
    .eq('is_from_portal', false);

  if (commentsError) {
    log.error('Failed to fetch task comments', { error: commentsError.message });
  }

  // Debug logging for diagnostics
  log.debug('Unread query results', {
    userId,
    supportTaskId,
    commentsCount: comments?.length ?? 0,
    receiptsCount: Object.keys(receiptsMap).length,
    sampleComment: comments?.[0],
    sampleReceipts: Object.entries(receiptsMap).slice(0, 3),
  });

  const taskCounts: Record<string, number> = {};

  comments?.forEach((comment: { task_id: string; clickup_created_at: string }) => {
    // Skip support task from regular task counts (handled separately)
    if (supportTaskId && comment.task_id === supportTaskId) {
      return;
    }

    const taskContext = `task:${comment.task_id}`;
    const lastRead = receiptsMap[taskContext];

    // If no read receipt or comment is newer than last read
    if (!lastRead || new Date(comment.clickup_created_at) > new Date(lastRead)) {
      taskCounts[comment.task_id] = (taskCounts[comment.task_id] || 0) + 1;
    }
  });

  log.debug('Calculated unread counts', {
    support: supportCount,
    taskCount: Object.keys(taskCounts).length,
    taskCounts,
  });

  return {
    support: supportCount,
    tasks: taskCounts,
  };
}

async function markContextAsRead(userId: string, contextType: string): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await supabase.from('read_receipts').upsert(
    {
      profile_id: userId,
      context_type: contextType,
      last_read_at: now,
    },
    { onConflict: 'profile_id,context_type' }
  );

  if (error) {
    log.error('Failed to mark as read', { error: error.message });
    throw error;
  }

  // Cross-sync: mark matching notifications as read
  try {
    if (contextType === 'support') {
      // Support notifications have title starting with "Message from"
      const { error: notifError } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('profile_id', userId)
        .eq('is_read', false)
        .like('title', 'Message from%');

      if (notifError) {
        log.error('Failed to cross-sync support notifications', { error: notifError.message });
      }
    } else if (contextType.startsWith('task:')) {
      const taskId = contextType.replace('task:', '');
      const { error: notifError } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('profile_id', userId)
        .eq('is_read', false)
        .eq('task_id', taskId);

      if (notifError) {
        log.error('Failed to cross-sync task notifications', { error: notifError.message });
      }
    }
  } catch (syncErr) {
    log.error('Notification cross-sync failed', { error: String(syncErr) });
  }

  log.debug('Marked as read with cross-sync', { contextType });
}

export function useUnreadCounts(userId: string | undefined) {
  const queryClient = useQueryClient();
  const supportChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const commentsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const receiptsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const invalidationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>(
    'connecting'
  );

  // Store support_task_id for realtime subscription
  const [supportTaskId, setSupportTaskId] = useState<string | null>(null);

  // Fetch support_task_id on mount
  useEffect(() => {
    if (!userId) return;

    supabase
      .from('profiles')
      .select('support_task_id')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        setSupportTaskId(data?.support_task_id ?? null);
      });
  }, [userId]);

  const query = useQuery({
    queryKey: ['unread-counts', userId],
    queryFn: () => fetchUnreadCounts(userId!),
    enabled: !!userId,
    staleTime: 1000 * 60, // 1 minute
  });

  // Set up Supabase Realtime subscriptions for instant updates
  useEffect(() => {
    if (!userId) return;

    // Clean up existing channels
    if (supportChannelRef.current) {
      supabase.removeChannel(supportChannelRef.current);
      supportChannelRef.current = null;
    }
    if (commentsChannelRef.current) {
      supabase.removeChannel(commentsChannelRef.current);
    }
    if (receiptsChannelRef.current) {
      supabase.removeChannel(receiptsChannelRef.current);
    }

    // Subscribe to support task comments (if support_task_id exists)
    // Uses comment_cache instead of support_messages
    if (supportTaskId) {
      const supportChannel = supabase
        .channel(`unread-support-task-${supportTaskId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'comment_cache',
            filter: `task_id=eq.${supportTaskId}`,
          },
          (payload) => {
            const newComment = payload.new as { is_from_portal: boolean };
            // Only increment if it's from team (not portal)
            if (!newComment.is_from_portal) {
              log.debug('Realtime: New support comment, incrementing count');
              queryClient.setQueryData(['unread-counts', userId], (old: UnreadCounts | undefined) => {
                if (!old) return { support: 1, tasks: {} };
                return {
                  ...old,
                  support: old.support + 1,
                };
              });
            }
          }
        )
        .subscribe((status, error) => {
          log.debug('Support unread subscription status', { status });
          if (status === 'SUBSCRIBED') {
            setConnectionStatus('connected');
          } else if (status === 'CHANNEL_ERROR') {
            log.error('Support realtime subscription error', { error: error?.message });
            setConnectionStatus('error');
            queryClient.invalidateQueries({ queryKey: ['unread-counts', userId] });
          }
        });

      supportChannelRef.current = supportChannel;
    }

    // Subscribe to task comments (general - not filtered by support task)
    const commentsChannel = supabase
      .channel(`unread-comments-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comment_cache',
          filter: `profile_id=eq.${userId}`,
        },
        (payload) => {
          const newComment = payload.new as { task_id: string; is_from_portal: boolean };

          // Skip if this is the support task (handled by support channel)
          if (supportTaskId && newComment.task_id === supportTaskId) {
            return;
          }

          // Only increment if it's from team (not portal)
          if (!newComment.is_from_portal) {
            log.debug('Realtime: New task comment, incrementing count');
            queryClient.setQueryData(['unread-counts', userId], (old: UnreadCounts | undefined) => {
              if (!old) return { support: 0, tasks: { [newComment.task_id]: 1 } };
              return {
                ...old,
                tasks: {
                  ...old.tasks,
                  [newComment.task_id]: (old.tasks[newComment.task_id] || 0) + 1,
                },
              };
            });
          }
        }
      )
      .subscribe((status, error) => {
        log.debug('Comments unread subscription status', { status });
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected');
        } else if (status === 'CHANNEL_ERROR') {
          log.error('Comments realtime subscription error', { error: error?.message });
          setConnectionStatus('error');
          queryClient.invalidateQueries({ queryKey: ['unread-counts', userId] });
        }
      });

    commentsChannelRef.current = commentsChannel;

    // Subscribe to read receipts for cross-tab/session sync
    const receiptsChannel = supabase
      .channel(`unread-receipts-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'read_receipts',
          filter: `profile_id=eq.${userId}`,
        },
        (payload) => {
          const receipt = payload.new as { context_type: string };
          log.debug('Realtime: Read receipt changed', {
            event: payload.eventType,
            context: receipt?.context_type,
          });

          // Debounce invalidation to prevent rapid-fire during open/close
          if (invalidationTimeoutRef.current) {
            clearTimeout(invalidationTimeoutRef.current);
          }
          invalidationTimeoutRef.current = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['unread-counts', userId] });
          }, 300);
        }
      )
      .subscribe((status, error) => {
        log.debug('Read receipts subscription status', { status });
        if (status === 'CHANNEL_ERROR') {
          log.error('Read receipts realtime subscription error', { error: error?.message });
        }
      });

    receiptsChannelRef.current = receiptsChannel;

    return () => {
      if (supportChannelRef.current) {
        supabase.removeChannel(supportChannelRef.current);
        supportChannelRef.current = null;
      }
      if (commentsChannelRef.current) {
        supabase.removeChannel(commentsChannelRef.current);
        commentsChannelRef.current = null;
      }
      if (receiptsChannelRef.current) {
        supabase.removeChannel(receiptsChannelRef.current);
        receiptsChannelRef.current = null;
      }
      if (invalidationTimeoutRef.current) {
        clearTimeout(invalidationTimeoutRef.current);
      }
    };
  }, [userId, supportTaskId, queryClient]);

  // Fallback polling when realtime fails
  useEffect(() => {
    if (connectionStatus === 'error' && userId) {
      log.warn('Realtime failed, enabling fallback polling');
      const interval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ['unread-counts', userId] });
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [connectionStatus, userId, queryClient]);

  // Refetch on tab visibility change
  useEffect(() => {
    if (!userId) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        log.debug('Tab became visible, refreshing unread counts');
        queryClient.invalidateQueries({ queryKey: ['unread-counts', userId] });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [userId, queryClient]);

  const markReadMutation = useMutation({
    mutationFn: (contextType: string) => markContextAsRead(userId!, contextType),
    onMutate: async (contextType: string) => {
      // Optimistically update the cache
      await queryClient.cancelQueries({ queryKey: ['unread-counts', userId] });

      const previousData = queryClient.getQueryData<UnreadCounts>(['unread-counts', userId]);

      queryClient.setQueryData(['unread-counts', userId], (old: UnreadCounts | undefined) => {
        if (!old) return { support: 0, tasks: {} };

        if (contextType === 'support') {
          return { ...old, support: 0 };
        } else if (contextType.startsWith('task:')) {
          const taskId = contextType.replace('task:', '');
          const newTasks = { ...old.tasks };
          delete newTasks[taskId];
          return { ...old, tasks: newTasks };
        }
        return old;
      });

      return { previousData };
    },
    onError: (_err, _contextType, context) => {
      // Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(['unread-counts', userId], context.previousData);
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['unread-counts', userId] });
      // Cross-sync: refresh notification bell
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
    },
  });

  const counts = query.data ?? { support: 0, tasks: {} };

  const markAsRead = useCallback(
    (contextType: string) => markReadMutation.mutate(contextType),
    [markReadMutation]
  );

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['unread-counts', userId] }),
    [queryClient, userId]
  );

  return {
    supportUnread: counts.support,
    taskUnread: counts.tasks,
    isLoading: query.isLoading,
    markAsRead,
    refresh,
  };
}
