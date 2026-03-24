import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/shared/lib/supabase';
import { useAuth } from '@/shared/hooks/useAuth';
import type { Project } from '../types/project';

export interface ProjectComment {
  id: string;
  taskId: string;
  stepTitle: string;
  chapterTitle: string;
  authorName: string;
  authorEmail: string;
  text: string;
  createdAt: string;
  isFromPortal: boolean;
}

/**
 * Build a lookup map from clickupTaskId -> { stepTitle, chapterTitle }
 */
function buildTaskContextMap(project: Project): Map<string, { stepTitle: string; chapterTitle: string }> {
  const map = new Map<string, { stepTitle: string; chapterTitle: string }>();
  for (const ch of project.chapters) {
    for (const step of ch.steps) {
      map.set(step.clickupTaskId, {
        stepTitle: step.title,
        chapterTitle: ch.title,
      });
    }
  }
  return map;
}

/**
 * Fetch ALL comments for ALL tasks in a project from comment_cache.
 */
async function fetchAllProjectComments(
  taskIds: string[],
  contextMap: Map<string, { stepTitle: string; chapterTitle: string }>,
): Promise<ProjectComment[]> {
  if (taskIds.length === 0) return [];

  const { data, error } = await supabase
    .from('comment_cache')
    .select('clickup_comment_id, task_id, display_text, comment_text, author_name, author_email, clickup_created_at, is_from_portal')
    .in('task_id', taskIds)
    .order('clickup_created_at', { ascending: false });

  if (error || !data) return [];

  return data.map((row) => {
    const ctx = contextMap.get(row.task_id);
    return {
      id: row.clickup_comment_id,
      taskId: row.task_id,
      stepTitle: ctx?.stepTitle ?? 'Unbekannt',
      chapterTitle: ctx?.chapterTitle ?? '',
      authorName: row.author_name ?? 'Unbekannt',
      authorEmail: row.author_email ?? '',
      text: row.display_text ?? row.comment_text ?? '',
      createdAt: row.clickup_created_at,
      isFromPortal: row.is_from_portal ?? false,
    };
  });
}

export function useProjectComments(project: Project | null) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const taskIds = project
    ? project.chapters.flatMap(ch => ch.steps.map(s => s.clickupTaskId))
    : [];
  const projectId = project?.id ?? '';
  const contextMap = project ? buildTaskContextMap(project) : new Map<string, { stepTitle: string; chapterTitle: string }>();

  const query = useQuery({
    queryKey: ['project-comments', projectId],
    queryFn: () => fetchAllProjectComments(taskIds, contextMap),
    enabled: !!projectId && taskIds.length > 0,
    staleTime: 1000 * 30,
  });

  // Realtime subscription on comment_cache for project task IDs
  useEffect(() => {
    if (!projectId || taskIds.length === 0 || !userId) return;

    // Polling for project comments every 15s.
    // comment_cache Realtime subscriptions cause "mismatch" errors on self-hosted
    // Supabase which poison the WebSocket and break other Realtime channels.
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['project-comments', projectId] });
    }, 15000);

    return () => {
      clearInterval(interval);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
    // taskIds serialized as projectId — changes when project data changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, userId, queryClient]);

  return query;
}
