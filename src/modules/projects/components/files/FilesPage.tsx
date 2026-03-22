import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import type { Project, Chapter } from '../../types/project';
import { useNextcloudFiles } from '../../hooks/useNextcloudFiles';
import { ContentContainer } from '@/shared/components/layout/ContentContainer';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { FolderCard } from './FolderCard';
import { FileRow } from './FileRow';
import { ChapterFiles } from './ChapterFiles';

interface FilesPageProps {
  project: Project;
}

export function FilesPage({ project }: FilesPageProps) {
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);

  return (
    <ContentContainer width="narrow">
      <div className="p-[24px] max-[768px]:p-[16px]">
        <h1 className="text-[1.2rem] font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-[20px]">
          Dateien
        </h1>

        {selectedChapter ? (
          <ChapterFiles
            project={project}
            chapter={selectedChapter}
            onBack={() => setSelectedChapter(null)}
          />
        ) : (
          <FolderGrid
            chapters={project.chapters}
            projectId={project.id}
            onSelect={setSelectedChapter}
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
  chapters: Chapter[];
  projectId: string;
  onSelect: (ch: Chapter) => void;
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

  if (error) {
    return <EmptyState message="Dateien konnten nicht geladen werden. Bitte erneut versuchen." />;
  }

  return (
    <>
      {/* Phase folder cards */}
      <div className="grid grid-cols-4 gap-[10px] mb-[20px] max-[768px]:grid-cols-2">
        {chapters.map((ch) => (
          <FolderCard
            key={ch.id}
            title={ch.title}
            order={ch.order}
            isSelected={false}
            onClick={() => onSelect(ch)}
          />
        ))}
      </div>

      {/* Root-level files (if any) */}
      {isLoading ? (
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
