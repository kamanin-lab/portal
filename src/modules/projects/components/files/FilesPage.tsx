import type { Project } from '../../types/project';
import { ContentContainer } from '@/shared/components/layout/ContentContainer';
import { FileBrowser } from './FileBrowser';

interface FilesPageProps {
  project: Project;
}

export function FilesPage({ project }: FilesPageProps) {
  return (
    <ContentContainer width="narrow">
      <div className="p-6 max-[768px]:p-4">
        <h1 className="text-xl font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-5">
          Dateien
        </h1>
        <FileBrowser project={project} />
      </div>
    </ContentContainer>
  );
}
