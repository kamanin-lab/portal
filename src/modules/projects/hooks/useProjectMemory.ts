import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/shared/hooks/useAuth';
import type { Project } from '../types/project';
import type { MemoryDraft } from '../types/memory';
import { isMemoryOperator } from '../lib/memory-access';
import {
  archiveMemoryEntry,
  getMemoryPreview,
  listMemoryEntries,
  resolveProjectMemoryContext,
  upsertMemoryEntry,
} from '../lib/memory-store';

interface UseProjectMemoryOptions {
  audience?: 'client' | 'internal';
  mode?: 'view' | 'manage';
}

export function useProjectMemory(project: Project, options: UseProjectMemoryOptions = {}) {
  const { audience = 'client', mode = 'view' } = options;
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const canManage = mode === 'manage' && isMemoryOperator(profile);
  const actor = user?.id ?? profile?.id ?? 'portal-client';

  const contextQuery = useQuery({
    queryKey: ['project-memory-context', project.id, user?.id ?? 'anon'],
    queryFn: () => resolveProjectMemoryContext(project, profile?.id ?? user?.id ?? null),
    enabled: !!project.id,
    staleTime: 1000 * 60 * 5,
  });

  const context = contextQuery.data ?? null;
  const queryKey = useMemo(() => ['project-memory', audience, context?.clientId ?? 'missing', context?.projectId ?? project.id], [audience, context?.clientId, context?.projectId, project.id]);

  const query = useQuery({
    queryKey,
    queryFn: () => listMemoryEntries(context!, {}, audience),
    enabled: !!context,
    staleTime: 1000 * 60,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ draft, entryId }: { draft: MemoryDraft; entryId?: string }) => {
      if (!context || !canManage) {
        throw new Error('Memory authoring is available only for explicitly allow-listed internal operators');
      }
      return upsertMemoryEntry(context, draft, actor, entryId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['project-memory', 'client'] });
      queryClient.invalidateQueries({ queryKey: ['project-memory', 'internal'] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (entryId: string) => {
      if (!context || !canManage) {
        throw new Error('Memory authoring is available only for explicitly allow-listed internal operators');
      }
      return archiveMemoryEntry(entryId, actor, context.projectId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['project-memory', 'client'] });
      queryClient.invalidateQueries({ queryKey: ['project-memory', 'internal'] });
    },
  });

  const entries = query.data ?? [];

  return {
    entries,
    previewEntries: getMemoryPreview(entries, 3, audience === 'internal' ? 'internal' : 'client'),
    isLoading: contextQuery.isLoading || query.isLoading,
    saveEntry: saveMutation.mutateAsync,
    archiveEntry: archiveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    isArchiving: archiveMutation.isPending,
    canManage,
    context,
  };
}
