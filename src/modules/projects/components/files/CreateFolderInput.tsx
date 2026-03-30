import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { FolderAddIcon, Loading03Icon } from '@hugeicons/core-free-icons';
import { Input } from '@/shared/components/ui/input';
import { Button } from '@/shared/components/ui/button';

interface CreateFolderInputProps {
  onSubmit: (name: string) => Promise<void>;
  isLoading: boolean;
}

const INVALID_CHARS = /[/\\:*?"<>|%]/;

export function CreateFolderInput({ onSubmit, isLoading }: CreateFolderInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  function validate(val: string): string {
    if (!val.trim()) return 'Name darf nicht leer sein';
    if (val.startsWith('.')) return 'Name darf nicht mit einem Punkt beginnen';
    if (val.includes('..')) return 'Ungültiger Name';
    if (INVALID_CHARS.test(val)) return 'Ungültige Zeichen im Namen';
    return '';
  }

  async function handleSubmit() {
    const err = validate(name);
    if (err) { setError(err); return; }
    await onSubmit(name.trim());
    setName('');
    setError('');
    setIsOpen(false);
  }

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        variant="ghost"
        size="sm"
        className="text-accent hover:text-accent-hover text-xs gap-1 flex-shrink-0"
      >
        <HugeiconsIcon icon={FolderAddIcon} size={14} />
        <span className="hidden sm:inline">Neuen Ordner erstellen</span>
        <span className="sm:hidden">Ordner</span>
      </Button>
    );
  }

  return (
    <div className="flex-shrink-0">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={name}
          onChange={(e) => { setName(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') setIsOpen(false); }}
          placeholder="Ordnername..."
          className="w-[180px] max-[768px]:w-[120px]"
        />
        <Button
          onClick={handleSubmit}
          disabled={isLoading || !name.trim()}
          variant="accent"
          size="sm"
        >
          {isLoading ? <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" /> : 'Erstellen'}
        </Button>
        <Button
          onClick={() => { setIsOpen(false); setName(''); setError(''); }}
          variant="ghost"
          size="sm"
        >
          Abbrechen
        </Button>
      </div>
      {error && <p className="text-xxs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
