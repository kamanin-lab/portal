import { useState, useRef, useCallback } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Upload04Icon, FolderAddIcon, Loading03Icon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import { Button } from '@/shared/components/ui/button';
import { uploadClientFile } from '../hooks/useClientFiles';
import { CreateFolderInput } from './CreateFolderInput';
import { supabase } from '@/shared/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

interface ClientActionBarProps {
  currentSubPath: string;
  onSuccess: () => void;
}

export function ClientActionBar({ currentSubPath, onSuccess }: ClientActionBarProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [showFolderInput, setShowFolderInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

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
      // Log file activity (silent — never blocks UI)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          await supabase.from('client_file_activity').insert({
            profile_id: session.user.id,
            event_type: 'file_uploaded' as const,
            name: file.name,
            path: currentSubPath ? `${currentSubPath}/${file.name}` : file.name,
            source: 'portal' as const,
          });
          queryClient.invalidateQueries({ queryKey: ['client-file-activity'] });
        }
      } catch {
        // Silent — activity logging must never block uploads
      }
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
            <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />
          ) : (
            <HugeiconsIcon icon={Upload04Icon} size={14} />
          )}
          {isUploading ? 'Wird hochgeladen...' : 'Datei hochladen'}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFolderInput(true)}
          disabled={showFolderInput}
        >
          <HugeiconsIcon icon={FolderAddIcon} size={14} />
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
