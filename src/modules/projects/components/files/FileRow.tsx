import { HugeiconsIcon } from '@hugeicons/react';
import { Download04Icon, Loading03Icon, Delete02Icon } from '@hugeicons/core-free-icons';
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { FileTypeIcon } from './FileTypeIcon';
import { downloadFile } from '../../hooks/useNextcloudFiles';
import type { NextcloudFile } from '../../types/project';

interface FileRowProps {
  file: NextcloudFile;
  projectConfigId: string;
  onDelete?: () => void;
}

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

export function FileRow({ file, projectConfigId, onDelete }: FileRowProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleClick = useCallback(async () => {
    if (file.type === 'folder') return; // folders are navigated, not downloaded
    setIsDownloading(true);
    try {
      await downloadFile(projectConfigId, file.path);
    } catch (err) {
      toast.error('Download fehlgeschlagen', {
        description: (err as Error).message || 'Bitte erneut versuchen.',
      });
    } finally {
      setIsDownloading(false);
    }
  }, [file, projectConfigId]);

  return (
    <div
      onClick={handleClick}
      className="group flex items-center gap-2.5 px-2.5 py-2.5 rounded-[var(--r-sm)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
    >
      <FileTypeIcon mimeType={file.mimeType} name={file.name} />
      <span className="flex-1 text-body font-medium text-[var(--text-primary)] truncate">
        {file.name}
      </span>
      <span className="text-xxs text-[var(--text-tertiary)] whitespace-nowrap hidden md:block">
        {formatSize(file.size)}
      </span>
      <span className="text-xxs text-[var(--text-tertiary)] whitespace-nowrap hidden md:block">
        {formatDate(file.lastModified)}
      </span>
      <div className="flex items-center gap-1 flex-shrink-0">
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-[var(--text-tertiary)] hover:text-red-500"
          >
            <HugeiconsIcon icon={Delete02Icon} size={14} />
          </button>
        )}
        <div className="w-[24px] flex items-center justify-center">
          {isDownloading
            ? <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin text-[var(--text-tertiary)]" />
            : <HugeiconsIcon icon={Download04Icon} size={14} className="text-[var(--text-tertiary)]" />
          }
        </div>
      </div>
    </div>
  );
}
