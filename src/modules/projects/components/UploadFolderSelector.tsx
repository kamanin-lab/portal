import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Loading03Icon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import { Button } from '@/shared/components/ui/button';
import type { Project } from '../types/project';
import { useNextcloudFilesByPath, useCreateFolder } from '../hooks/useNextcloudFiles';

interface UploadFolderSelectorProps {
  project: Project;
  selectedChapter: string;
  onChapterChange: (value: string) => void;
  selectedSubfolder: string;
  onSubfolderChange: (value: string) => void;
}

export function UploadFolderSelector({
  project,
  selectedChapter,
  onChapterChange,
  selectedSubfolder,
  onSubfolderChange,
}: UploadFolderSelectorProps) {
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const chapterFolders = project.chapters.map((ch) => ({
    label: ch.title,
    value: `${String(ch.order).padStart(2, '0')}_${ch.title}`,
  }));

  const { files: chapterContents, isLoading: loadingSubfolders } = useNextcloudFilesByPath(
    project.id,
    selectedChapter,
  );
  const subfolders = chapterContents.filter((f) => f.type === 'folder');

  const createFolder = useCreateFolder(project.id);

  async function handleCreateFolder() {
    if (!newFolderName.trim() || !selectedChapter) return;
    setIsCreatingFolder(true);
    try {
      const folderPath = `${selectedChapter}/${newFolderName.trim()}`;
      await createFolder.mutateAsync(folderPath);
      onSubfolderChange(newFolderName.trim());
      setNewFolderName('');
      toast.success('Ordner erstellt');
    } catch {
      toast.error('Ordner konnte nicht erstellt werden');
    }
    setIsCreatingFolder(false);
  }

  return (
    <>
      {/* Chapter selector */}
      <div>
        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
          Ordner
        </label>
        <select
          value={selectedChapter}
          onChange={(e) => { onChapterChange(e.target.value); onSubfolderChange(''); }}
          className="w-full px-3 py-2 text-body bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] outline-none focus:border-[var(--accent)] transition-colors"
        >
          <option value="">{'\u2014 Ordner w\u00E4hlen \u2014'}</option>
          {chapterFolders.map((cf) => (
            <option key={cf.value} value={cf.value}>{cf.label}</option>
          ))}
        </select>
      </div>

      {/* Subfolder selector */}
      {selectedChapter && (
        loadingSubfolders ? (
          <div className="text-xs text-[var(--text-tertiary)]">Wird geladen...</div>
        ) : subfolders.length > 0 ? (
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Unterordner (optional)
            </label>
            <select
              value={selectedSubfolder}
              onChange={(e) => onSubfolderChange(e.target.value)}
              className="w-full px-3 py-2 text-body bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] outline-none focus:border-[var(--accent)] transition-colors"
            >
              <option value="">{'\u2014 Hauptordner \u2014'}</option>
              {subfolders.map((sf) => (
                <option key={sf.name} value={sf.name}>{sf.name}</option>
              ))}
            </select>
          </div>
        ) : null
      )}

      {/* Create subfolder */}
      {selectedChapter && (
        <div className="flex items-center gap-2">
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); }}
            placeholder="Neuer Unterordner..."
            className="flex-1 px-2.5 py-1.5 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] outline-none focus:border-[var(--accent)] transition-colors"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreateFolder}
            disabled={!newFolderName.trim() || isCreatingFolder}
          >
            {isCreatingFolder ? <HugeiconsIcon icon={Loading03Icon} size={12} className="animate-spin" /> : 'Erstellen'}
          </Button>
        </div>
      )}
    </>
  );
}
