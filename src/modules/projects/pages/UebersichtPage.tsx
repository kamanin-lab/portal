import { Routes, Route } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import { OverviewPage } from '../components/overview/OverviewPage';
import { ContentContainer } from '@/shared/components/layout/ContentContainer';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { EmptyState } from '@/shared/components/common/EmptyState';

export function UebersichtPage() {
  const { project, isLoading } = useProject();

  if (isLoading) {
    return (
      <ContentContainer width="narrow" className="p-6 max-[768px]:p-4">
        <LoadingSkeleton lines={6} height="120px" />
      </ContentContainer>
    );
  }

  if (!project) {
    return (
      <ContentContainer width="narrow" className="p-6 max-[768px]:p-4">
        <EmptyState message="Projekt konnte nicht geladen werden." />
      </ContentContainer>
    );
  }

  return (
    <Routes>
      <Route index element={<OverviewPage project={project} />} />
    </Routes>
  );
}
