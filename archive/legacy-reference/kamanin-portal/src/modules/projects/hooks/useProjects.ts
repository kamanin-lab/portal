import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/shared/lib/supabase';
import { useAuth } from '@/shared/hooks/useAuth';
import type { ProjectSummary } from '../types/project';

async function fetchProjects(): Promise<ProjectSummary[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Get project IDs this user has access to
  const { data: access } = await supabase
    .from('project_access')
    .select('project_config_id')
    .eq('profile_id', user.id);

  if (!access || access.length === 0) return [];

  const projectIds = access.map(a => a.project_config_id);

  const { data: configs } = await supabase
    .from('project_config')
    .select('id, name, type, client_name, client_initials, is_active')
    .in('id', projectIds)
    .eq('is_active', true);

  return (configs || []).map(c => ({
    id: c.id,
    name: c.name,
    type: c.type,
    clientName: c.client_name,
    clientInitials: c.client_initials,
    isActive: c.is_active,
  }));
}

export function useProjects() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
    enabled: !!user,
    staleTime: 1000 * 60 * 15,
    refetchOnWindowFocus: false,
  });

  return {
    projects: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
