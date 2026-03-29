import { Routes, Route } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import { OverviewPage } from '../components/overview/OverviewPage';
import { ContentContainer } from '@/shared/components/layout/ContentContainer';
import { PhaseTimelineSkeleton } from '../components/overview/PhaseTimelineSkeleton';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { EmptyState } from '@/shared/components/common/EmptyState';

export function UebersichtPage() {
  const { project, isLoading } = useProject();

  if (isLoading) {
    return (
      <ContentContainer width="narrow" className="p-6 max-[768px]:p-4">
        <PhaseTimelineSkeleton />
        <div className="space-y-3 mt-4">
          <Skeleton className="h-4 w-3/4 rounded" />
          <Skeleton className="h-4 w-1/2 rounded" />
        </div>
        <div className="mt-6 space-y-2">
          <Skeleton className="h-8 w-48 rounded" />
          <Skeleton className="h-24 rounded-[var(--r-md)]" />
        </div>
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
