import { useState, useRef, useCallback } from 'react';
import { Upload, FolderPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/components/ui/button';
import { uploadClientFile } from '../hooks/useClientFiles';
import { CreateFolderInput } from './CreateFolderInput';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

interface ClientActionBarProps {
  currentSubPath: string;
  onSuccess: () => void;
}

export function ClientActionBar({ currentSubPath, onSuccess }: ClientActionBarProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [showFolderInput, setShowFolderInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be re-selected
    e.target.value = '';

    if (file.size > MAX_FILE_SIZE) {
      toast.error('Datei zu gross', {
        description: 'Maximale Dateigrösse: 50 MB',
      });
      return;
    }

    setIsUploading(true);
    try {
      await uploadClientFile(currentSubPath, file);
      toast.success('Datei hochgeladen');
      onSuccess();
    } catch (err) {
      toast.error('Upload fehlgeschlagen', {
        description: (err as Error).message || 'Bitte erneut versuchen.',
      });
    } finally {
      setIsUploading(false);
    }
  }, [currentSubPath, onSuccess]);

  return (
    <div className="mb-3">
      {/* Action buttons */}
      <div className="flex items-center gap-2 mb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleUploadClick}
          disabled={isUploading}
        >
          {isUploading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Upload size={14} />
          )}
          {isUploading ? 'Wird hochgeladen...' : 'Datei hochladen'}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFolderInput(true)}
          disabled={showFolderInput}
        >
          <FolderPlus size={14} />
          Neuer Ordner
        </Button>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelected}
        />
      </div>

      {/* Inline folder name input */}
      {showFolderInput && (
        <CreateFolderInput
          currentSubPath={currentSubPath}
          onSuccess={onSuccess}
          onClose={() => setShowFolderInput(false)}
        />
      )}
    </div>
  );
}
