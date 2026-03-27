import { useState, useCallback } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { createClientFolder } from '../hooks/useClientFiles';

interface CreateFolderInputProps {
  currentSubPath: string;
  onSuccess: () => void;
  onClose: () => void;
}

export function CreateFolderInput({ currentSubPath, onSuccess, onClose }: CreateFolderInputProps) {
  const [folderName, setFolderName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = useCallback(async () => {
    const trimmed = folderName.trim();
    if (!trimmed) return;

    const fullPath = currentSubPath ? `${currentSubPath}/${trimmed}` : trimmed;

    setIsCreating(true);
    try {
      await createClientFolder(fullPath);
      toast.success('Ordner erstellt');
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
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Check size={14} />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onClose}
        disabled={isCreating}
      >
        <X size={14} />
      </Button>
    </div>
  );
}
