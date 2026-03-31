import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/lib/supabase';

export interface FileActivityRecord {
  id: string;
  event_type: 'file_uploaded' | 'folder_created';
  name: string;
  path: string | null;
  created_at: string;
}

export function useProjectFileActivity(projectConfigId: string | undefined) {
  return useQuery<FileActivityRecord[]>({
    queryKey: ['project-file-activity', projectConfigId],
    queryFn: async () => {
      if (!projectConfigId) return [];
      const { data, error } = await supabase
        .from('project_file_activity')
        .select('id, event_type, name, path, created_at')
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
