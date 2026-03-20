import { useProject } from '../hooks/useProject';
import { FilesPage } from '../components/files/FilesPage';
import { ContentContainer } from '@/shared/components/layout/ContentContainer';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { EmptyState } from '@/shared/components/common/EmptyState';

export function DateienPage() {
  const { project, isLoading } = useProject();

  if (isLoading) {
    return (
      <ContentContainer width="narrow" className="p-6 max-[768px]:p-4">
        <LoadingSkeleton lines={6} height="56px" />
      </ContentContainer>
    );
  }

  if (!project) {
    return (
      <ContentContainer width="narrow" className="p-6 max-[768px]:p-4">
        <EmptyState message="Dateien konnten nicht geladen werden." />
      </ContentContainer>
    );
  }

  return <FilesPage project={project} />;
}
