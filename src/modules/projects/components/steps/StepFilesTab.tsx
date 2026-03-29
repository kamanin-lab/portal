import type { Step } from '../../types/project';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { FileTypeIcon } from '../files/FileTypeIcon';
import { useNextcloudFilesByPath, downloadFile } from '../../hooks/useNextcloudFiles';
import { slugify } from '../../lib/slugify';

interface StepFilesTabProps {
  step: Step;
  projectConfigId: string;
  chapterFolder: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return iso;
  }
}

export function StepFilesTab({ step, projectConfigId, chapterFolder }: StepFilesTabProps) {
  const subPath = `${chapterFolder}/${slugify(step.title)}`;
  const { files, isLoading } = useNextcloudFilesByPath(projectConfigId, subPath);

  if (isLoading) {
    return <Skeleton className="h-24 rounded-[var(--r-md)]" />;
  }

  const fileEntries = files.filter(f => f.type === 'file');

  if (fileEntries.length === 0) {
    return <EmptyState message="Noch keine Dateien für diesen Schritt." />;
  }

  return (
    <div className="flex flex-col gap-1">
      {fileEntries.map((f) => (
        <div
          key={f.path}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-[var(--r-sm)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
          onClick={() => downloadFile(projectConfigId, f.path)}
        >
          <FileTypeIcon mimeType={f.mimeType} name={f.name} />
          <div className="flex-1 min-w-0">
            <div className="text-body font-medium text-[var(--text-primary)] truncate">{f.name}</div>
            <div className="text-xxs text-[var(--text-tertiary)]">
              {formatBytes(f.size)} &middot; {formatDate(f.lastModified)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
