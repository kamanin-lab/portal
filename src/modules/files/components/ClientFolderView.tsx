import { Folder, ChevronRight, Download, Loader2 } from 'lucide-react';
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useClientFiles, downloadClientFile } from '../hooks/useClientFiles';
import { FileTypeIcon } from '@/modules/projects/components/files/FileTypeIcon';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import type { NextcloudFile } from '@/modules/projects/types/project';

interface ClientFolderViewProps {
  pathSegments: string[];
  onNavigate: (newSegments: string[]) => void;
}

// ---------------------------------------------------------------------------
// ClientFileRow — renders file info with download via client root
// ---------------------------------------------------------------------------

/** Format bytes into a human-readable string. */
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

/** Format ISO date to DD.MM.YYYY */
function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

function ClientFileRow({ file }: { file: NextcloudFile }) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleClick = useCallback(async () => {
    if (file.type === 'folder') return;
    setIsDownloading(true);
    try {
      await downloadClientFile(file.path);
    } catch (err) {
      toast.error('Download fehlgeschlagen', {
        description: (err as Error).message || 'Bitte erneut versuchen.',
      });
    } finally {
      setIsDownloading(false);
    }
  }, [file]);

  return (
    <div
      onClick={handleClick}
      className="flex items-center gap-[10px] px-[10px] py-[10px] rounded-[var(--r-sm)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
    >
      <FileTypeIcon mimeType={file.mimeType} name={file.name} />
      <span className="flex-1 text-[13px] font-medium text-[var(--text-primary)] truncate">
        {file.name}
      </span>
      <span className="text-[11px] text-[var(--text-tertiary)] whitespace-nowrap hidden md:block">
        {formatSize(file.size)}
      </span>
      <span className="text-[11px] text-[var(--text-tertiary)] whitespace-nowrap hidden md:block">
        {formatDate(file.lastModified)}
      </span>
      <div className="w-[24px] flex items-center justify-center flex-shrink-0">
        {isDownloading ? (
          <Loader2 size={14} className="animate-spin text-[var(--text-tertiary)]" />
        ) : (
          <Download size={14} className="text-[var(--text-tertiary)]" />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClientFolderView
// ---------------------------------------------------------------------------

export function ClientFolderView({ pathSegments, onNavigate }: ClientFolderViewProps) {
  const subPath = pathSegments.join('/');
  const { files, isLoading, error } = useClientFiles(subPath);

  const folders = files.filter((f) => f.type === 'folder');
  const fileItems = files.filter((f) => f.type === 'file');

  return (
    <>
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-[4px] text-[13px] mb-[16px] flex-wrap">
        <button
          onClick={() => onNavigate([])}
          className="text-[var(--accent)] hover:underline transition-colors"
        >
          Dateien
        </button>
        {pathSegments.map((seg, idx) => (
          <span key={idx} className="flex items-center gap-[4px]">
            <ChevronRight size={12} className="text-[var(--text-tertiary)]" />
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
            <div className="flex flex-col gap-[2px] mb-[12px]">
              {folders.map((f) => (
                <button
                  key={f.path}
                  onClick={() => onNavigate([...pathSegments, f.name])}
                  className="flex items-center gap-[10px] px-[12px] py-[10px] rounded-[var(--r-sm)] hover:bg-[var(--surface-hover)] transition-colors text-left"
                >
                  <Folder size={16} className="text-[var(--accent)] flex-shrink-0" />
                  <span className="text-[13px] font-medium text-[var(--text-primary)]">
                    {f.name}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Files — uses ClientFileRow with download-client-file action */}
          {fileItems.length > 0 && (
            <div className="flex flex-col gap-[2px] mb-[12px]">
              {fileItems.map((f) => (
                <ClientFileRow key={f.path} file={f} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {folders.length === 0 && fileItems.length === 0 && (
            <EmptyState message="Dieser Ordner ist leer." />
          )}
        </>
      )}
    </>
  );
}
