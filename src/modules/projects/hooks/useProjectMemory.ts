import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/shared/hooks/useAuth';
import type { Project } from '../types/project';
import type { MemoryDraft } from '../types/memory';
import {
  archiveMemoryEntry,
  getMemoryContextKey,
  getMemoryPreview,
  listMemoryEntries,
  upsertMemoryEntry,
} from '../lib/memory-store';

export function useProjectMemory(project: Project) {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const clientIdentity = profile?.id ?? user?.id ?? null;
  const context = useMemo(
    () => (clientIdentity ? getMemoryContextKey(project, clientIdentity) : null),
    [project, clientIdentity],
  );
  const actor = user?.id ?? profile?.id ?? 'portal-client';
  const queryKey = ['project-memory', context?.clientId, context?.projectId];
  const canManage = false;

  const query = useQuery({
    queryKey,
    queryFn: () => listMemoryEntries(context!, {}, 'client'),
    enabled: !!context,
    staleTime: 1000 * 60,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ draft, entryId }: { draft: MemoryDraft; entryId?: string }) => {
      if (!context || !canManage) {
        throw new Error('Memory authoring is not available on client-facing surfaces in this batch');
      }
      return upsertMemoryEntry(context, draft, actor, entryId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (entryId: string) => {
      if (!canManage) {
        throw new Error('Memory authoring is not available on client-facing surfaces in this batch');
      }
      return archiveMemoryEntry(entryId, actor);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const entries = query.data ?? [];

  return {
    entries,
    previewEntries: getMemoryPreview(entries, 3, 'client'),
    isLoading: query.isLoading,
    saveEntry: saveMutation.mutateAsync,
    archiveEntry: archiveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    isArchiving: archiveMutation.isPending,
    canManage,
  };
}
