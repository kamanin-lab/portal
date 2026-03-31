import { useState, useCallback } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Tick01Icon, MultiplicationSignIcon, Loading03Icon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { createClientFolder } from '../hooks/useClientFiles';
import { supabase } from '@/shared/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

interface CreateFolderInputProps {
  currentSubPath: string;
  onSuccess: () => void;
  onClose: () => void;
}

export function CreateFolderInput({ currentSubPath, onSuccess, onClose }: CreateFolderInputProps) {
  const [folderName, setFolderName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const queryClient = useQueryClient();

  const handleCreate = useCallback(async () => {
    const trimmed = folderName.trim();
    if (!trimmed) return;

    const fullPath = currentSubPath ? `${currentSubPath}/${trimmed}` : trimmed;

    setIsCreating(true);
    try {
      await createClientFolder(fullPath);
      toast.success('Ordner erstellt');
      // Log folder activity (silent — never blocks UI)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          const folderDisplayName = fullPath.split('/').pop() || fullPath;
          await supabase.from('client_file_activity').insert({
            profile_id: session.user.id,
            event_type: 'folder_created' as const,
            name: folderDisplayName,
            path: fullPath,
            source: 'portal' as const,
          });
          queryClient.invalidateQueries({ queryKey: ['client-file-activity'] });
        }
      } catch {
        // Silent — activity logging must never block folder creation
      }
      setFolderName('');
      onClose();
      onSuccess();
    } catch (err) {
      toast.error('Ordner konnte nicht erstellt werden', {
        description: (err as Error).message || 'Bitte erneut versuchen.',
      });
    } finally {
      setIsCreating(false);
    }
  }, [folderName, currentSubPath, onSuccess, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreate();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [handleCreate, onClose]);

  return (
    <div className="flex items-center gap-1.5">
      <Input
        autoFocus
        value={folderName}
        onChange={(e) => setFolderName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ordnername..."
        className="max-w-[260px] h-8 text-xs"
        disabled={isCreating}
      />
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handleCreate}
        disabled={!folderName.trim() || isCreating}
      >
        {isCreating ? (
          <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />
        ) : (
          <HugeiconsIcon icon={Tick01Icon} size={14} />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onClose}
        disabled={isCreating}
      >
        <HugeiconsIcon icon={MultiplicationSignIcon} size={14} />
      </Button>
    </div>
  );
}
