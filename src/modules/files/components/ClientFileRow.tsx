import { Download, Loader2 } from 'lucide-react';
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { downloadClientFile } from '../hooks/useClientFiles';
import { FileTypeIcon } from '@/modules/projects/components/files/FileTypeIcon';
import type { NextcloudFile } from '@/modules/projects/types/project';

/** Format bytes into a human-readable string. */
export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

/** Format ISO date to DD.MM.YYYY */
export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

export function ClientFileRow({ file }: { file: NextcloudFile }) {
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
