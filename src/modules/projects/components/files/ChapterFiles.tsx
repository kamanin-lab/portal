import { ArrowLeft, FolderOpen } from 'lucide-react';
import type { Project, Chapter } from '../../types/project';
import { useNextcloudFiles } from '../../hooks/useNextcloudFiles';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { FileRow } from './FileRow';
import { FileUpload } from './FileUpload';

interface ChapterFilesProps {
  project: Project;
  chapter: Chapter;
  onBack: () => void;
}

export function ChapterFiles({ project, chapter, onBack }: ChapterFilesProps) {
  const { files, notConfigured, isLoading, error } = useNextcloudFiles(
    project.id,
    chapter.order,
  );

  const fileItems = files.filter((f) => f.type === 'file');

  return (
    <>
      {/* Back button + folder title */}
      <button
        onClick={onBack}
        className="flex items-center gap-[6px] text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-[16px]"
      >
        <ArrowLeft size={14} />
        Alle Ordner
      </button>

      <h2 className="text-[15px] font-semibold text-[var(--text-primary)] mb-[16px]">
        {chapter.title}
      </h2>

      {/* Upload area */}
      <div className="mb-[16px]">
        <FileUpload
          projectConfigId={project.id}
          chapterSortOrder={chapter.order}
          disabled={notConfigured}
        />
      </div>

      {/* File list */}
      {isLoading ? (
        <LoadingSkeleton lines={4} height="40px" />
      ) : error ? (
        <EmptyState message="Dateien konnten nicht geladen werden." />
      ) : notConfigured ? (
        <EmptyState
          icon={<FolderOpen size={28} />}
          message="Dateien sind für dieses Projekt noch nicht konfiguriert."
        />
      ) : fileItems.length === 0 ? (
        <EmptyState message="Noch keine Dateien in diesem Ordner." />
      ) : (
        <div className="flex flex-col gap-[2px]">
          {fileItems.map((f) => (
            <FileRow key={f.path} file={f} projectConfigId={project.id} />
          ))}
        </div>
      )}
    </>
  );
}
