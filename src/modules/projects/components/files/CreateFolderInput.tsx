import { useState } from 'react';
import { FolderPlus, Loader2 } from 'lucide-react';
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
        className="text-accent hover:text-accent-hover mt-[8px] p-0 h-auto text-[12px]"
      >
        <FolderPlus size={14} />
        Neuen Ordner erstellen
      </Button>
    );
  }

  return (
    <>
      <div className="flex items-center gap-[8px] mt-[8px]">
        <Input
          autoFocus
          value={name}
          onChange={(e) => { setName(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') setIsOpen(false); }}
          placeholder="Ordnername..."
          className="flex-1"
        />
        <Button
          onClick={handleSubmit}
          disabled={isLoading || !name.trim()}
          variant="accent"
          size="sm"
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : 'Erstellen'}
        </Button>
        <Button
          onClick={() => { setIsOpen(false); setName(''); setError(''); }}
          variant="ghost"
          size="sm"
        >
          Abbrechen
        </Button>
      </div>
      {error && <p className="text-[11px] text-red-500 mt-[4px]">{error}</p>}
    </>
  );
}
