import { Routes, Route } from 'react-router-dom';
import { useProject } from '../hooks/useProject';
import { OverviewPage } from '../components/overview/OverviewPage';

export function UebersichtPage() {
  const { project, isLoading } = useProject();

  if (isLoading || !project) return null;

  return (
    <Routes>
      <Route index element={<OverviewPage project={project} />} />
    </Routes>
  );
}
