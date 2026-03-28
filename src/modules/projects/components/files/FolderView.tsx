import { HugeiconsIcon } from '@hugeicons/react';
import { Folder01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import type { Project } from '../../types/project';
import { useNextcloudFilesByPath, useCreateFolder } from '../../hooks/useNextcloudFiles';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { FileRow } from './FileRow';
import { FileUpload } from './FileUpload';
import { CreateFolderInput } from './CreateFolderInput';

interface FolderViewProps {
  project: Project;
  pathSegments: string[];
  onNavigate: (newSegments: string[]) => void;
}

export function FolderView({ project, pathSegments, onNavigate }: FolderViewProps) {
  const subPath = pathSegments.join('/');
  const { files, isLoading, error } = useNextcloudFilesByPath(project.id, subPath);
  const createFolder = useCreateFolder(project.id);

  const folders = files.filter((f) => f.type === 'folder');
  const fileItems = files.filter((f) => f.type === 'file');

  async function handleCreateFolder(name: string) {
    try {
      const folderPath = subPath ? `${subPath}/${name}` : name;
      await createFolder.mutateAsync(folderPath);
      toast.success('Ordner erstellt', { description: name });
    } catch (err) {
      toast.error('Ordner konnte nicht erstellt werden', {
        description: (err as Error).message,
      });
    }
  }

  return (
    <>
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-body mb-4 flex-wrap">
        <button
          onClick={() => onNavigate([])}
          className="text-[var(--accent)] hover:underline transition-colors"
        >
          Dateien
        </button>
        {pathSegments.map((seg, idx) => (
          <span key={idx} className="flex items-center gap-1">
            <HugeiconsIcon icon={ArrowRight01Icon} size={12} className="text-[var(--text-tertiary)]" />
            {idx === pathSegments.length - 1 ? (
              <span className="text-[var(--text-primary)] font-medium">{seg}</span>
            ) : (
              <button
                onClick={() => onNavigate(pathSegments.slice(0, idx + 1))}
                className="text-[var(--accent)] hover:underline transition-colors"
              >
                {seg}
              </button>
            )}
          </span>
        ))}
      </nav>

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton lines={4} height="40px" />
      ) : error ? (
        <EmptyState message="Dateien konnten nicht geladen werden." />
      ) : (
        <>
          {/* Subfolders */}
          {folders.length > 0 && (
            <div className="flex flex-col gap-0.5 mb-3">
              {folders.map((f) => (
                <button
                  key={f.path}
                  onClick={() => onNavigate([...pathSegments, f.name])}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-[var(--r-sm)] hover:bg-[var(--surface-hover)] transition-colors text-left"
                >
                  <HugeiconsIcon icon={Folder01Icon} size={16} className="text-[var(--accent)] flex-shrink-0" />
                  <span className="text-body font-medium text-[var(--text-primary)]">{f.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Files */}
          {fileItems.length > 0 && (
            <div className="flex flex-col gap-0.5 mb-3">
              {fileItems.map((f) => (
                <FileRow key={f.path} file={f} projectConfigId={project.id} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {folders.length === 0 && fileItems.length === 0 && (
            <EmptyState message="Dieser Ordner ist leer." />
          )}

          {/* Create folder */}
          <CreateFolderInput
            onSubmit={handleCreateFolder}
            isLoading={createFolder.isPending}
          />

          {/* Upload */}
          <div className="mt-3">
            <FileUpload projectConfigId={project.id} subPath={subPath} />
          </div>
        </>
      )}
    </>
  );
}
