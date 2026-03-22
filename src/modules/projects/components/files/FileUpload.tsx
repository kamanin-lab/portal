import { useRef, useCallback, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useUploadFile } from '../../hooks/useNextcloudFiles';

interface FileUploadProps {
  projectConfigId: string;
  chapterSortOrder?: number;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export function FileUpload({ projectConfigId, chapterSortOrder, disabled }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const upload = useUploadFile(projectConfigId, chapterSortOrder);

  const handleFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        toast.error('Datei zu gross', { description: 'Maximal 50 MB pro Datei.' });
        return;
      }
      try {
        await upload.mutateAsync(file);
        toast.success('Datei hochgeladen', { description: file.name });
      } catch (err) {
        toast.error('Upload fehlgeschlagen', {
          description: (err as Error).message || 'Bitte erneut versuchen.',
        });
      }
    },
    [upload],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset input so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = '';
    },
    [handleFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setIsDragOver(false), []);

  const isUploading = upload.isPending;

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={`
        flex items-center justify-center gap-[8px] px-[16px] py-[14px]
        rounded-[var(--r-md)] border border-dashed transition-colors cursor-pointer
        ${isDragOver
          ? 'border-[var(--accent)] bg-[var(--accent)]/5'
          : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--surface-hover)]'
        }
        ${(disabled || isUploading) ? 'opacity-50 pointer-events-none' : ''}
      `}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={onInputChange}
        disabled={disabled || isUploading}
      />
      {isUploading ? (
        <Loader2 size={16} className="animate-spin text-[var(--text-tertiary)]" />
      ) : (
        <Upload size={16} className="text-[var(--text-tertiary)]" />
      )}
      <span className="text-[12px] text-[var(--text-secondary)]">
        {isUploading ? 'Wird hochgeladen...' : 'Datei hochladen oder hierhin ziehen'}
      </span>
    </div>
  );
}
