import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/shared/lib/supabase';
import { useAuth } from '@/shared/hooks/useAuth';
import { transformToProject } from '../lib/transforms-project';
import type {
  Project,
  ProjectConfigRow,
  ChapterConfigRow,
  ProjectTaskCacheRow,
  StepEnrichmentRow,
  QuickActionConfigRow,
} from '../types/project';

// Resolve user's first project when no projectId is provided
async function resolveDefaultProjectId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('project_access')
    .select('project_config_id')
    .eq('profile_id', user.id)
    .limit(1)
    .single();

  return data?.project_config_id ?? null;
}

async function fetchProjectData(projectId: string): Promise<Project | null> {
  // 1. Project config
  const { data: config, error: configErr } = await supabase
    .from('project_config')
    .select('*')
    .eq('id', projectId)
    .single();

  if (configErr || !config) return null;

  // 2. Chapters
  const { data: chapters } = await supabase
    .from('chapter_config')
    .select('*')
    .eq('project_config_id', projectId)
    .eq('is_active', true)
    .order('sort_order');

  // 3. Tasks
  const { data: tasks } = await supabase
    .from('project_task_cache')
    .select('*')
    .eq('project_config_id', projectId)
    .eq('is_visible', true);

  // 4. Enrichments for these tasks
  const taskIds = (tasks || []).map((t: ProjectTaskCacheRow) => t.clickup_id);
  let enrichments: StepEnrichmentRow[] = [];
  if (taskIds.length > 0) {
    const { data } = await supabase
      .from('step_enrichment')
      .select('*')
      .in('clickup_task_id', taskIds);
    enrichments = (data || []) as StepEnrichmentRow[];
  }

  // 5. Comment counts per task
  const commentCounts: Record<string, number> = {};
  if (taskIds.length > 0) {
    const { data: comments } = await supabase
      .from('comment_cache')
      .select('task_id')
      .in('task_id', taskIds);
    for (const c of comments || []) {
      commentCounts[c.task_id] = (commentCounts[c.task_id] || 0) + 1;
    }
  }

  // 6. Quick actions config
  const { data: quickActions } = await supabase
    .from('project_quick_actions')
    .select('*')
    .eq('project_config_id', projectId)
    .eq('is_enabled', true)
    .order('sort_order');

  return transformToProject(
    config as ProjectConfigRow,
    (chapters || []) as ChapterConfigRow[],
    (tasks || []) as ProjectTaskCacheRow[],
    enrichments,
    commentCounts,
    (quickActions || []) as QuickActionConfigRow[],
  );
}

export function useProject(explicitProjectId?: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRefreshedRef = useRef(false);
  const [resolvedId, setResolvedId] = useState<string | null>(explicitProjectId ?? null);

  // Resolve default project ID when none provided
  useEffect(() => {
    if (explicitProjectId) {
      setResolvedId(explicitProjectId);
      return;
    }
    if (!user) return;
    resolveDefaultProjectId().then(id => { if (id) setResolvedId(id); });
  }, [explicitProjectId, user]);

  const projectId = resolvedId ?? '';

  // Realtime subscription — debounced 300ms
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`project-tasks-${projectId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'project_task_cache',
        filter: `project_config_id=eq.${projectId}`,
      }, () => {
        if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
        realtimeDebounceRef.current = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['project', projectId] });
        }, 300);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    };
  }, [projectId, queryClient]);

  const query = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => fetchProjectData(projectId),
    enabled: !!projectId && !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes — Realtime handles live updates
    refetchOnWindowFocus: true,
  });

  // Background refresh — once per mount to catch up on missed changes
  useEffect(() => {
    if (!query.data || query.isError || !user || !projectId) return;
    if (hasRefreshedRef.current) return;
    hasRefreshedRef.current = true;

    supabase.functions
      .invoke('fetch-project-tasks', { body: { projectId } })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      })
      .catch((err: Error) => {
        hasRefreshedRef.current = false;
        console.warn('[Project] Background refresh failed:', err.message);
      });
  }, [query.data, query.isError, user, projectId, queryClient]);

  return {
    project: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
