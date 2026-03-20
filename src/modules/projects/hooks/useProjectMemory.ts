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
  const { user } = useAuth();
  const context = useMemo(() => getMemoryContextKey(project), [project]);
  const actor = user?.email ?? user?.id ?? 'portal-operator';
  const queryKey = ['project-memory', context.clientId, context.projectId];

  const query = useQuery({
    queryKey,
    queryFn: () => listMemoryEntries(context),
    staleTime: Infinity,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ draft, entryId }: { draft: MemoryDraft; entryId?: string }) =>
      upsertMemoryEntry(context, draft, actor, entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (entryId: string) => archiveMemoryEntry(entryId, actor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const entries = query.data ?? [];

  return {
    entries,
    previewEntries: getMemoryPreview(entries),
    isLoading: query.isLoading,
    saveEntry: saveMutation.mutateAsync,
    archiveEntry: archiveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    isArchiving: archiveMutation.isPending,
  };
}
