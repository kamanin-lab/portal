import { useProject } from '../hooks/useProject';
import { FilesPage } from '../components/files/FilesPage';

export function DateienPage() {
  const { project, isLoading } = useProject();
  if (isLoading || !project) return null;
  return <FilesPage project={project} />;
}
