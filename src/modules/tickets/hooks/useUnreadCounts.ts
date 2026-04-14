import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/lib/supabase';
import { useEffect, useCallback } from 'react';
import type { UnreadCounts } from '../types/tasks';

export type { UnreadCounts };


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

  if (profileError) console.warn('Failed to fetch profile', { error: profileError.message });

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
    if (error) console.warn('Failed to fetch support unread', { error: error.message });
    supportCount = count ?? 0;
  }

  // 4. Per-task unread counts + needsReply detection
  const { data: allComments, error: commentsError } = await supabase
    .from('comment_cache')
    .select('task_id, clickup_created_at, is_from_portal')
    .eq('profile_id', userId);

  if (commentsError) console.warn('Failed to fetch task comments', { error: commentsError.message });

  const taskCounts: Record<string, number> = {};
  const lastTeamAt: Record<string, string> = {};
  const lastClientAt: Record<string, string> = {};

  allComments?.forEach((c: { task_id: string; clickup_created_at: string; is_from_portal: boolean | null }) => {
    if (supportTaskId && c.task_id === supportTaskId) return;
    const isTeam = c.is_from_portal === false;
    if (isTeam) {
      // Track unread count for team comments
      const lastRead = receiptsMap[`task:${c.task_id}`];
      if (!lastRead || new Date(c.clickup_created_at) > new Date(lastRead)) {
        taskCounts[c.task_id] = (taskCounts[c.task_id] ?? 0) + 1;
      }
      // Track latest team comment timestamp
      if (!lastTeamAt[c.task_id] || c.clickup_created_at > lastTeamAt[c.task_id]) {
        lastTeamAt[c.task_id] = c.clickup_created_at;
      }
    } else {
      // Track latest client comment timestamp (is_from_portal === true)
      if (!lastClientAt[c.task_id] || c.clickup_created_at > lastClientAt[c.task_id]) {
        lastClientAt[c.task_id] = c.clickup_created_at;
      }
    }
  });

  // needsReply: task has a team comment newer than the last client reply
  const needsReply: Record<string, boolean> = {};
  Object.keys(lastTeamAt).forEach(taskId => {
    needsReply[taskId] = lastTeamAt[taskId] > (lastClientAt[taskId] ?? '0');
  });

  return { support: supportCount, tasks: taskCounts, needsReply };
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
    console.warn('Notification cross-sync failed', { error: String(err) });
  }
}

export function useUnreadCounts(userId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['unread-counts', userId],
    queryFn: () => fetchUnreadCounts(userId!),
    enabled: !!userId,
    staleTime: 1000 * 15, // 15 seconds — polling-based, no Realtime
  });

  // Polling every 15 seconds for unread counts.
  // Realtime subscriptions on comment_cache cause "mismatch" errors on self-hosted
  // Supabase which poison the entire WebSocket connection and break task_cache Realtime.
  // Polling is reliable and 15s is acceptable UX for badge counts.
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['unread-counts', userId] });
    }, 15000);
    return () => clearInterval(interval);
  }, [userId, queryClient]);

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
        if (!old) return { support: 0, tasks: {}, needsReply: {} };
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

  const counts = query.data ?? { support: 0, tasks: {}, needsReply: {} };

  return {
    supportUnread: counts.support,
    taskUnread: counts.tasks,
    needsReply: counts.needsReply,
    isLoading: query.isLoading,
    markAsRead: useCallback((ctx: string) => markReadMutation.mutate(ctx), [markReadMutation]),
    refresh: useCallback(() => queryClient.invalidateQueries({ queryKey: ['unread-counts', userId] }), [queryClient, userId]),
  };
}
