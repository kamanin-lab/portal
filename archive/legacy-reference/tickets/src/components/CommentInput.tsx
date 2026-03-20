import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, Paperclip, X, FileIcon, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FileData {
  name: string;
  type: string;
  size: number;
  base64: string;
}

interface CommentInputProps {
  onSubmit: (comment: string, files: FileData[]) => Promise<void>;
  isSubmitting: boolean;
  maxLength?: number;
  placeholder?: string;
  compact?: boolean;
}

// Allowed file types and size limits
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;

function isImageType(type: string): boolean {
  return type.startsWith('image/');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CommentInput({
  onSubmit,
  isSubmitting,
  maxLength = 10000,
  placeholder = 'Kommentar schreiben...',
  compact = false,
}: CommentInputProps) {
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState<FileData[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const activeReadersRef = useRef<Set<FileReader>>(new Set());
  
  useEffect(() => {
    return () => {
      activeReadersRef.current.forEach((reader) => {
        if (reader.readyState === FileReader.LOADING) {
          reader.abort();
        }
      });
      activeReadersRef.current.clear();
    };
  }, []);

  const handleFileSelect = useCallback(async (selectedFiles: FileList | File[]) => {
    setError(null);
    const newFiles: FileData[] = [];
    const fileArray = Array.from(selectedFiles);

    if (files.length + fileArray.length > MAX_FILES) {
      setError(`Maximal ${MAX_FILES} Dateien erlaubt`);
      return;
    }

    for (const file of fileArray) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`Dateityp nicht unterstützt: ${file.name}`);
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        setError(`Datei zu groß (max. 10 MB): ${file.name}`);
        continue;
      }

      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          activeReadersRef.current.add(reader);
          reader.onload = () => {
            activeReadersRef.current.delete(reader);
            const result = reader.result as string;
            const base64Data = result.split(',')[1];
            resolve(base64Data);
          };
          reader.onerror = () => {
            activeReadersRef.current.delete(reader);
            reject(reader.error);
          };
          reader.onabort = () => {
            activeReadersRef.current.delete(reader);
            reject(new Error('File read aborted'));
          };
          reader.readAsDataURL(file);
        });

        newFiles.push({
          name: file.name,
          type: file.type,
          size: file.size,
          base64,
        });
      } catch (err) {
        if (err instanceof Error && err.message === 'File read aborted') {
          return;
        }
        setError(`Fehler beim Lesen der Datei: ${file.name}`);
      }
    }

    setFiles((prev) => [...prev, ...newFiles]);
  }, [files.length]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  }, [handleFileSelect]);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setError(null);
  }, []);

  const handleSubmit = async () => {
    if (!comment.trim() && files.length === 0) return;
    
    try {
      await onSubmit(comment.trim(), files);
      setComment('');
      setFiles([]);
      setError(null);
    } catch {
      // Error handled by parent
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'relative rounded-md border transition-colors',
          dragActive ? 'border-primary bg-primary/5' : 'border-input',
          isSubmitting && 'opacity-50'
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <Textarea
          placeholder={placeholder}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={handleKeyDown}
          className={cn(
            'border-0 focus-visible:ring-0 focus-visible:ring-offset-0 resize-none',
            compact ? 'min-h-[60px]' : 'min-h-[80px]'
          )}
          maxLength={maxLength}
          disabled={isSubmitting}
        />
        
        {dragActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/10 rounded-md pointer-events-none">
            <p className="text-sm font-medium text-primary">Dateien hier ablegen</p>
          </div>
        )}
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <div
              key={index}
              className="relative group flex items-center gap-2 bg-muted rounded-md px-2 py-1.5 text-xs"
            >
              {isImageType(file.type) ? (
                <img
                  src={`data:${file.type};base64,${file.base64}`}
                  alt={file.name}
                  className="h-8 w-8 object-cover rounded"
                />
              ) : (
                <FileIcon className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="flex flex-col min-w-0 max-w-[120px]">
                <span className="truncate font-medium">{file.name}</span>
                <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
              </div>
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="ml-1 p-0.5 rounded-full hover:bg-destructive/20 transition-colors"
                disabled={isSubmitting}
              >
                <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      <div className="flex justify-between items-center min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_TYPES.join(',')}
            onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
            className="hidden"
            disabled={isSubmitting || files.length >= MAX_FILES}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSubmitting || files.length >= MAX_FILES}
            className="h-8 px-2"
          >
            <Paperclip className="h-4 w-4" />
            <span className="sr-only">Datei anhängen</span>
          </Button>
          <span className="text-xs text-muted-foreground">
            {comment.length}/{maxLength.toLocaleString()}
          </span>
        </div>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={(!comment.trim() && files.length === 0) || isSubmitting}
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Senden
        </Button>
      </div>
    </div>
  );
}
