import { useState, useRef, useCallback } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Upload04Icon, FolderAddIcon, Loading03Icon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import { Button } from '@/shared/components/ui/button';
import { uploadClientFile } from '../hooks/useClientFiles';
import { CreateFolderInput } from './CreateFolderInput';
import { UploadProgressBar, type UploadItem } from './UploadProgressBar';
import { supabase } from '@/shared/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

interface ClientActionBarProps {
  currentSubPath: string;
  onSuccess: () => void;
}

export function ClientActionBar({ currentSubPath, onSuccess }: ClientActionBarProps) {
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const isUploading = uploadItems.some(item => item.status === 'uploading');

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = '';

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
        return uploadClientFile(currentSubPath, file, ({ loaded, total }) => {
          setUploadItems(prev =>
            prev.map(item => item.id === id ? { ...item, loaded, total } : item)
          );
        })
          .then(async () => {
            setUploadItems(prev =>
              prev.map(item => item.id === id ? { ...item, status: 'done', loaded: item.total } : item)
            );
            queryClient.invalidateQueries({ queryKey: ['client-files'] });
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
          })
          .catch(() => {
            setUploadItems(prev =>
              prev.map(item => item.id === id ? { ...item, status: 'error' } : item)
            );
            toast.error(`Upload fehlgeschlagen: ${file.name}`);
          });
      })
    );

    // Auto-clear done items after 2.5s
    setTimeout(() => {
      setUploadItems(prev => prev.filter(item => item.status !== 'done'));
    }, 2500);
  }

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
          {isUploading ? 'Wird hochgeladen...' : 'Dateien hochladen'}
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
          multiple
          className="hidden"
          onChange={handleFileSelected}
        />
      </div>

      {/* Upload progress bars */}
      {uploadItems.length > 0 && (
        <div className="mt-2 flex flex-col gap-0.5">
          {uploadItems.map(item => (
            <UploadProgressBar key={item.id} item={item} />
          ))}
        </div>
      )}

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
