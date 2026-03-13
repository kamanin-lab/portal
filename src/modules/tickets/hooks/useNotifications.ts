import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/lib/supabase';
import { useEffect, useRef } from 'react';
import { createLogger } from '../lib/logger';
import type { Notification } from '../types/tasks';

export type { Notification };

const log = createLogger('useNotifications');

async function fetchNotifications(profileId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    log.error('Failed to fetch notifications', { error: error.message });
    throw error;
  }

  return data as Notification[];
}

async function markAsRead(notificationIds: string[]): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .in('id', notificationIds);
  if (error) throw error;
}

async function markAllAsRead(profileId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('profile_id', profileId)
    .eq('is_read', false);
  if (error) throw error;
}

export function useNotifications(profileId: string | undefined) {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const query = useQuery({
    queryKey: ['notifications', profileId],
    queryFn: () => fetchNotifications(profileId!),
    enabled: !!profileId,
    staleTime: 1000 * 60,
  });

  // Realtime — instant notification delivery
  useEffect(() => {
    if (!profileId) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const channel = supabase
      .channel(`notifications-${profileId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `profile_id=eq.${profileId}`,
      }, (payload) => {
        log.debug('Realtime: new notification');
        queryClient.setQueryData(['notifications', profileId], (old: Notification[] | undefined) => {
          const n = payload.new as Notification;
          if (!old) return [n];
          if (old.some(x => x.id === n.id)) return old;
          return [n, ...old];
        });
      })
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [profileId, queryClient]);

  const markReadMutation = useMutation({
    mutationFn: markAsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', profileId] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllAsRead(profileId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', profileId] }),
  });

  const unreadCount = query.data?.filter(n => !n.is_read).length ?? 0;

  return {
    notifications: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    unreadCount,
    markAsRead: markReadMutation.mutate,
    markAllAsRead: markAllReadMutation.mutate,
    isMarkingRead: markReadMutation.isPending || markAllReadMutation.isPending,
  };
}
