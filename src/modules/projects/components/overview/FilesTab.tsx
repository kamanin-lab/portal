import { EmptyState } from '@/shared/components/common/EmptyState';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { FileTypeIcon } from '../files/FileTypeIcon';
import { useNextcloudFiles, downloadFile } from '../../hooks/useNextcloudFiles';

interface FilesTabProps {
  projectConfigId: string;
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

export function FilesTab({ projectConfigId }: FilesTabProps) {
  const { files, isLoading } = useNextcloudFiles(projectConfigId);

  if (isLoading) {
    return <Skeleton className="h-32 rounded-[var(--r-md)]" />;
  }

  const recentFiles = files
    .filter(f => f.type === 'file')
    .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
    .slice(0, 8);

  if (recentFiles.length === 0) {
    return <EmptyState message="Noch keine Dateien." />;
  }

  return (
    <div className="flex flex-col">
      {recentFiles.map((f) => (
        <div
          key={f.path}
          className="flex items-center gap-2.5 px-1.5 py-2 rounded-[var(--r-sm)] cursor-pointer transition-colors duration-[120ms] hover:bg-[var(--surface-hover)]"
          onClick={() => downloadFile(projectConfigId, f.path)}
        >
          <FileTypeIcon mimeType={f.mimeType} name={f.name} />
          <span className="text-body text-[var(--text-primary)] font-medium flex-1 truncate">{f.name}</span>
          <span className="text-2xs text-[var(--text-tertiary)] whitespace-nowrap">
            {formatBytes(f.size)} &middot; {formatDate(f.lastModified)}
          </span>
        </div>
      ))}
    </div>
  );
}
