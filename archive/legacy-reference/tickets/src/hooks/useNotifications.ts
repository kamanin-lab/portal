import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useRef } from 'react';
import { createLogger } from '@/lib/logger';

const log = createLogger('useNotifications');

export interface Notification {
  id: string;
  profile_id: string;
  type: 'team_reply' | 'status_change';
  title: string;
  message: string;
  task_id: string | null;
  comment_id: string | null;
  is_read: boolean;
  created_at: string;
}

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

  log.debug('Fetched notifications', { count: data?.length || 0 });
  return data as Notification[];
}

async function markAsRead(notificationIds: string[]): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .in('id', notificationIds);

  if (error) {
    log.error('Failed to mark notifications as read', { error: error.message });
    throw error;
  }
  
  log.debug('Marked notifications as read', { count: notificationIds.length });
}

async function markAllAsRead(profileId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('profile_id', profileId)
    .eq('is_read', false);

  if (error) {
    log.error('Failed to mark all notifications as read', { error: error.message });
    throw error;
  }
  
  log.debug('Marked all notifications as read');
}

export function useNotifications(profileId: string | undefined) {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const query = useQuery({
    queryKey: ['notifications', profileId],
    queryFn: () => fetchNotifications(profileId!),
    enabled: !!profileId,
    staleTime: 1000 * 60, // 1 minute
  });

  // Set up Supabase Realtime subscription for instant notifications
  useEffect(() => {
    if (!profileId) return;

    // Clean up existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`notifications-${profileId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `profile_id=eq.${profileId}`,
        },
        (payload) => {
          log.debug('Realtime: New notification received');
          
          // Add the new notification to the cache
          queryClient.setQueryData(
            ['notifications', profileId],
            (old: Notification[] | undefined) => {
              const newNotification = payload.new as Notification;
              if (!old) return [newNotification];
              
              // Check if already exists
              const exists = old.some((n) => n.id === newNotification.id);
              if (exists) return old;
              
              return [newNotification, ...old];
            }
          );
        }
      )
      .subscribe((status) => {
        log.debug('Notifications subscription status', { status });
      });

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', profileId] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllAsRead(profileId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', profileId] });
    },
  });

  const unreadCount = query.data?.filter((n) => !n.is_read).length ?? 0;

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
