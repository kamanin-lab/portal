import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/lib/supabase';

export interface FileActivityRecord {
  id: string;
  event_type: 'file_uploaded' | 'folder_created';
  name: string;
  path: string | null;
  source: 'portal' | 'nextcloud_direct';
  actor_label: string | null;
  created_at: string;
}

export function useProjectFileActivity(projectConfigId: string | undefined) {
  return useQuery<FileActivityRecord[]>({
    queryKey: ['project-file-activity', projectConfigId],
    queryFn: async () => {
      if (!projectConfigId) return [];
      const { data, error } = await supabase
        .from('project_file_activity')
        .select('id, event_type, name, path, source, actor_label, created_at')
        .eq('project_config_id', projectConfigId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return [];
      return data ?? [];
    },
    enabled: !!projectConfigId,
    staleTime: 60_000,
  });
}

export function useSyncFileActivity(projectConfigId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!projectConfigId) return;
      try {
        await supabase.functions.invoke('nextcloud-files', {
          body: { action: 'sync_activity', project_config_id: projectConfigId },
        });
      } catch {
        // Silent — sync is best-effort
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-file-activity', projectConfigId] });
    },
  });
}
