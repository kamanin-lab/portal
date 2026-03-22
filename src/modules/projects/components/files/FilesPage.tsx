import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import type { Project } from '../../types/project';
import { useNextcloudFiles } from '../../hooks/useNextcloudFiles';
import { ContentContainer } from '@/shared/components/layout/ContentContainer';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { FolderCard } from './FolderCard';
import { FileRow } from './FileRow';
import { FolderView } from './FolderView';

interface FilesPageProps {
  project: Project;
}

export function FilesPage({ project }: FilesPageProps) {
  const [pathSegments, setPathSegments] = useState<string[]>([]);

  function handleChapterClick(order: number, title: string) {
    const padded = String(order).padStart(2, '0');
    setPathSegments([`${padded}_${title}`]);
  }

  return (
    <ContentContainer width="narrow">
      <div className="p-[24px] max-[768px]:p-[16px]">
        <h1 className="text-[1.2rem] font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-[20px]">
          Dateien
        </h1>

        {pathSegments.length > 0 ? (
          <FolderView
            project={project}
            pathSegments={pathSegments}
            onNavigate={setPathSegments}
          />
        ) : (
          <FolderGrid
            chapters={project.chapters}
            projectId={project.id}
            onSelect={handleChapterClick}
          />
        )}
      </div>
    </ContentContainer>
  );
}

// ---------------------------------------------------------------------------
// FolderGrid — root view showing phase folders + optional root-level files
// ---------------------------------------------------------------------------

interface FolderGridProps {
  chapters: { id: string; title: string; order: number }[];
  projectId: string;
  onSelect: (order: number, title: string) => void;
}

function FolderGrid({ chapters, projectId, onSelect }: FolderGridProps) {
  const { files: rootFiles, notConfigured, isLoading, error } = useNextcloudFiles(projectId);

  if (notConfigured) {
    return (
      <EmptyState
        icon={<FolderOpen size={28} />}
        message="Dateien sind für dieses Projekt noch nicht konfiguriert."
      />
    );
  }

  return (
    <>
      {/* Phase folder cards — always visible regardless of Nextcloud status */}
      <div className="grid grid-cols-4 gap-[10px] mb-[20px] max-[768px]:grid-cols-2">
        {chapters.map((ch) => (
          <FolderCard
            key={ch.id}
            title={ch.title}
            order={ch.order}
            isSelected={false}
            onClick={() => onSelect(ch.order, ch.title)}
          />
        ))}
      </div>

      {/* Root-level files (if any) */}
      {error ? (
        <p className="text-[13px] text-[var(--text-tertiary)]">
          Dateien konnten nicht geladen werden.
        </p>
      ) : isLoading ? (
        <LoadingSkeleton lines={3} height="40px" />
      ) : rootFiles.filter((f) => f.type === 'file').length > 0 ? (
        <>
          <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] mb-[8px]">
            Allgemeine Dateien
          </h2>
          <div className="flex flex-col gap-[2px] mb-[16px]">
            {rootFiles
              .filter((f) => f.type === 'file')
              .map((f) => (
                <FileRow key={f.path} file={f} projectConfigId={projectId} />
              ))}
          </div>
        </>
      ) : null}
    </>
  );
}
