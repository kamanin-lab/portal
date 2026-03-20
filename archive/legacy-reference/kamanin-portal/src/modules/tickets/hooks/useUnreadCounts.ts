import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/lib/supabase';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createLogger } from '../lib/logger';
import type { UnreadCounts } from '../types/tasks';

export type { UnreadCounts };

const log = createLogger('useUnreadCounts');

interface ReadReceipt {
  context_type: string;
  last_read_at: string;
}

async function fetchUnreadCounts(userId: string): Promise<UnreadCounts> {
  // 1. Get support_task_id from profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('support_task_id')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) log.error('Failed to fetch profile', { error: profileError.message });

  const supportTaskId = profile?.support_task_id ?? null;

  // 2. Read receipts
  const { data: receiptsData, error: receiptsError } = await supabase
    .from('read_receipts')
    .select('context_type, last_read_at')
    .eq('profile_id', userId);

  if (receiptsError) throw receiptsError;

  const receiptsMap: Record<string, string> = {};
  receiptsData?.forEach((r: ReadReceipt) => { receiptsMap[r.context_type] = r.last_read_at; });

  // 3. Support unread (team messages only)
  let supportCount = 0;
  if (supportTaskId) {
    let q = supabase
      .from('comment_cache')
      .select('id', { count: 'exact', head: true })
      .eq('task_id', supportTaskId)
      .eq('profile_id', userId)
      .eq('is_from_portal', false);

    const supportLastRead = receiptsMap['support'] ?? null;
    if (supportLastRead) q = q.gt('clickup_created_at', supportLastRead);

    const { count, error } = await q;
    if (error) log.error('Failed to fetch support unread', { error: error.message });
    supportCount = count ?? 0;
  }

  // 4. Per-task unread counts
  const { data: comments, error: commentsError } = await supabase
    .from('comment_cache')
    .select('task_id, clickup_created_at')
    .eq('profile_id', userId)
    .eq('is_from_portal', false);

  if (commentsError) log.error('Failed to fetch task comments', { error: commentsError.message });

  const taskCounts: Record<string, number> = {};
  comments?.forEach((c: { task_id: string; clickup_created_at: string }) => {
    if (supportTaskId && c.task_id === supportTaskId) return;
    const lastRead = receiptsMap[`task:${c.task_id}`];
    if (!lastRead || new Date(c.clickup_created_at) > new Date(lastRead)) {
      taskCounts[c.task_id] = (taskCounts[c.task_id] ?? 0) + 1;
    }
  });

  return { support: supportCount, tasks: taskCounts };
}

async function markContextAsRead(userId: string, contextType: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('read_receipts').upsert(
    { profile_id: userId, context_type: contextType, last_read_at: now },
    { onConflict: 'profile_id,context_type' }
  );
  if (error) throw error;

  // Cross-sync: mark matching notifications as read
  try {
    if (contextType === 'support') {
      await supabase.from('notifications').update({ is_read: true })
        .eq('profile_id', userId).eq('is_read', false).like('title', 'Message from%');
    } else if (contextType.startsWith('task:')) {
      const taskId = contextType.replace('task:', '');
      await supabase.from('notifications').update({ is_read: true })
        .eq('profile_id', userId).eq('is_read', false).eq('task_id', taskId);
    }
  } catch (err) {
    log.error('Notification cross-sync failed', { error: String(err) });
  }
}

export function useUnreadCounts(userId: string | undefined) {
  const queryClient = useQueryClient();
  const supportChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const commentsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const receiptsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const invalidationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [supportTaskId, setSupportTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase.from('profiles').select('support_task_id').eq('id', userId).maybeSingle()
      .then(({ data }) => setSupportTaskId(data?.support_task_id ?? null));
  }, [userId]);

  const query = useQuery({
    queryKey: ['unread-counts', userId],
    queryFn: () => fetchUnreadCounts(userId!),
    enabled: !!userId,
    staleTime: 1000 * 60,
  });

  useEffect(() => {
    if (!userId) return;

    [supportChannelRef, commentsChannelRef, receiptsChannelRef].forEach(ref => {
      if (ref.current) { supabase.removeChannel(ref.current); ref.current = null; }
    });

    if (supportTaskId) {
      supportChannelRef.current = supabase
        .channel(`unread-support-task-${supportTaskId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comment_cache', filter: `task_id=eq.${supportTaskId}` },
          (payload) => {
            const c = payload.new as { is_from_portal: boolean };
            if (!c.is_from_portal) {
              queryClient.setQueryData(['unread-counts', userId], (old: UnreadCounts | undefined) =>
                old ? { ...old, support: old.support + 1 } : { support: 1, tasks: {} }
              );
            }
          })
        .subscribe((status, error) => {
          if (status === 'SUBSCRIBED') setConnectionStatus('connected');
          else if (status === 'CHANNEL_ERROR') {
            log.error('Support realtime error', { error: error?.message });
            setConnectionStatus('error');
          }
        });
    }

    commentsChannelRef.current = supabase
      .channel(`unread-comments-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comment_cache', filter: `profile_id=eq.${userId}` },
        (payload) => {
          const c = payload.new as { task_id: string; is_from_portal: boolean };
          if (supportTaskId && c.task_id === supportTaskId) return;
          if (!c.is_from_portal) {
            queryClient.setQueryData(['unread-counts', userId], (old: UnreadCounts | undefined) =>
              old
                ? { ...old, tasks: { ...old.tasks, [c.task_id]: (old.tasks[c.task_id] ?? 0) + 1 } }
                : { support: 0, tasks: { [c.task_id]: 1 } }
            );
          }
        })
      .subscribe((status, error) => {
        if (status === 'SUBSCRIBED') setConnectionStatus('connected');
        else if (status === 'CHANNEL_ERROR') {
          log.error('Comments realtime error', { error: error?.message });
          setConnectionStatus('error');
        }
      });

    receiptsChannelRef.current = supabase
      .channel(`unread-receipts-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'read_receipts', filter: `profile_id=eq.${userId}` },
        () => {
          if (invalidationTimeoutRef.current) clearTimeout(invalidationTimeoutRef.current);
          invalidationTimeoutRef.current = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['unread-counts', userId] });
          }, 300);
        })
      .subscribe();

    return () => {
      [supportChannelRef, commentsChannelRef, receiptsChannelRef].forEach(ref => {
        if (ref.current) { supabase.removeChannel(ref.current); ref.current = null; }
      });
      if (invalidationTimeoutRef.current) clearTimeout(invalidationTimeoutRef.current);
    };
  }, [userId, supportTaskId, queryClient]);

  // Fallback polling when realtime fails
  useEffect(() => {
    if (connectionStatus === 'error' && userId) {
      const interval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ['unread-counts', userId] });
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [connectionStatus, userId, queryClient]);

  // Refresh on tab focus
  useEffect(() => {
    if (!userId) return;
    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        queryClient.invalidateQueries({ queryKey: ['unread-counts', userId] });
      }
    };
    document.addEventListener('visibilitychange', handleVisible);
    return () => document.removeEventListener('visibilitychange', handleVisible);
  }, [userId, queryClient]);

  const markReadMutation = useMutation({
    mutationFn: (contextType: string) => markContextAsRead(userId!, contextType),
    onMutate: async (contextType) => {
      await queryClient.cancelQueries({ queryKey: ['unread-counts', userId] });
      const previousData = queryClient.getQueryData<UnreadCounts>(['unread-counts', userId]);
      queryClient.setQueryData(['unread-counts', userId], (old: UnreadCounts | undefined) => {
        if (!old) return { support: 0, tasks: {} };
        if (contextType === 'support') return { ...old, support: 0 };
        if (contextType.startsWith('task:')) {
          const taskId = contextType.replace('task:', '');
          const newTasks = { ...old.tasks };
          delete newTasks[taskId];
          return { ...old, tasks: newTasks };
        }
        return old;
      });
      return { previousData };
    },
    onError: (_err, _ctx, context) => {
      if (context?.previousData) queryClient.setQueryData(['unread-counts', userId], context.previousData);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['unread-counts', userId] });
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
    },
  });

  const counts = query.data ?? { support: 0, tasks: {} };

  return {
    supportUnread: counts.support,
    taskUnread: counts.tasks,
    isLoading: query.isLoading,
    markAsRead: useCallback((ctx: string) => markReadMutation.mutate(ctx), [markReadMutation]),
    refresh: useCallback(() => queryClient.invalidateQueries({ queryKey: ['unread-counts', userId] }), [queryClient, userId]),
  };
}
