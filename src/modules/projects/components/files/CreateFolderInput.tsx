import { useState } from 'react';
import { FolderPlus, Loader2 } from 'lucide-react';

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
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-[6px] text-[12px] text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors mt-[8px]"
      >
        <FolderPlus size={14} />
        Neuen Ordner erstellen
      </button>
    );
  }

  return (
    <>
      <div className="flex items-center gap-[8px] mt-[8px]">
        <input
          autoFocus
          value={name}
          onChange={(e) => { setName(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') setIsOpen(false); }}
          placeholder="Ordnername..."
          className="flex-1 px-[10px] py-[6px] text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] outline-none focus:border-[var(--accent)] transition-colors"
        />
        <button
          onClick={handleSubmit}
          disabled={isLoading || !name.trim()}
          className="px-[12px] py-[6px] text-[12px] font-semibold text-white bg-[var(--accent)] rounded-[var(--r-sm)] hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : 'Erstellen'}
        </button>
        <button
          onClick={() => { setIsOpen(false); setName(''); setError(''); }}
          className="px-[8px] py-[6px] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          Abbrechen
        </button>
      </div>
      {error && <p className="text-[11px] text-red-500 mt-[4px]">{error}</p>}
    </>
  );
}
