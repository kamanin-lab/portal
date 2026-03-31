import { useRef, useCallback, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Upload04Icon, Loading03Icon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import { useUploadFile, useUploadFileByPath } from '../../hooks/useNextcloudFiles';
import type { UploadItem } from '@/modules/files/components/UploadProgressBar';
import { UploadProgressBar } from '@/modules/files/components/UploadProgressBar';

interface FileUploadProps {
  projectConfigId: string;
  chapterSortOrder?: number;
  subPath?: string;
  disabled?: boolean;
}

export function FileUpload({ projectConfigId, chapterSortOrder, subPath, disabled }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const uploadByChapter = useUploadFile(projectConfigId, chapterSortOrder);
  const uploadByPath = useUploadFileByPath(projectConfigId, subPath ?? '');
  const upload = subPath !== undefined ? uploadByPath : uploadByChapter;

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;

      const newItems: UploadItem[] = files.map(f => ({
        id: crypto.randomUUID(),
        name: f.name,
        loaded: 0,
        total: f.size,
        status: 'uploading' as const,
      }));
      setUploadItems(prev => [...prev, ...newItems]);

      await Promise.allSettled(
        files.map((file, i) => {
          const id = newItems[i].id;
          return upload.mutateAsync({
            file,
            onProgress: ({ loaded, total }: { loaded: number; total: number }) => {
              setUploadItems(prev =>
                prev.map(item => item.id === id ? { ...item, loaded, total } : item)
              );
            },
          })
            .then(() => {
              setUploadItems(prev =>
                prev.map(item => item.id === id ? { ...item, status: 'done' as const, loaded: item.total } : item)
              );
            })
            .catch(() => {
              setUploadItems(prev =>
                prev.map(item => item.id === id ? { ...item, status: 'error' as const } : item)
              );
              toast.error(`Upload fehlgeschlagen: ${file.name}`);
            });
        })
      );

      setTimeout(() => {
        setUploadItems(prev => prev.filter(item => item.status !== 'done'));
      }, 2500);
    },
    [upload],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files?.length) handleFiles(Array.from(files));
      if (inputRef.current) inputRef.current.value = '';
    },
    [handleFiles],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = e.dataTransfer.files;
      if (files?.length) handleFiles(Array.from(files));
    },
    [handleFiles],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setIsDragOver(false), []);

  const isUploading = upload.isPending || uploadItems.some(i => i.status === 'uploading');

  return (
    <div>
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`
          flex items-center justify-center gap-2 px-4 py-3.5
          rounded-[var(--r-md)] border border-dashed transition-colors cursor-pointer
          ${isDragOver
            ? 'border-[var(--accent)] bg-[var(--accent)]/5'
            : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--surface-hover)]'
          }
          ${disabled ? 'opacity-50 pointer-events-none' : ''}
        `}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onInputChange}
          disabled={disabled}
        />
        {isUploading ? (
          <HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin text-[var(--text-tertiary)]" />
        ) : (
          <HugeiconsIcon icon={Upload04Icon} size={16} className="text-[var(--text-tertiary)]" />
        )}
        <span className="text-xs text-[var(--text-secondary)]">
          {isUploading ? 'Wird hochgeladen...' : 'Dateien hochladen oder hierhin ziehen'}
        </span>
      </div>
      {uploadItems.length > 0 && (
        <div className="mt-2 flex flex-col gap-0.5">
          {uploadItems.map(item => (
            <UploadProgressBar key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
