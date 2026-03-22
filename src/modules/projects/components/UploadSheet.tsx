import { useState, useRef } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SideSheet } from '@/shared/components/ui/SideSheet';
import type { Project } from '../types/project';
import { useNextcloudFilesByPath, useUploadFileByPath, useCreateFolder } from '../hooks/useNextcloudFiles';

interface UploadSheetProps {
  project: Project;
  open: boolean;
  onClose: () => void;
}

export function UploadSheet({ project, open, onClose }: UploadSheetProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedChapter, setSelectedChapter] = useState('');
  const [selectedSubfolder, setSelectedSubfolder] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build chapter folder names
  const chapterFolders = project.chapters.map((ch) => ({
    label: ch.title,
    value: `${String(ch.order).padStart(2, '0')}_${ch.title}`,
  }));

  // Load subfolders for selected chapter
  const { files: chapterContents, isLoading: loadingSubfolders } = useNextcloudFilesByPath(
    project.id,
    selectedChapter,
  );
  const subfolders = chapterContents.filter((f) => f.type === 'folder');

  // Upload target path
  const uploadPath = selectedSubfolder
    ? `${selectedChapter}/${selectedSubfolder}`
    : selectedChapter;

  const upload = useUploadFileByPath(project.id, uploadPath);
  const createFolder = useCreateFolder(project.id);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile || !selectedChapter) return;
    try {
      await upload.mutateAsync(selectedFile);
      toast.success('Datei hochgeladen', { description: selectedFile.name });
      setSelectedFile(null);
      onClose();
    } catch (err) {
      toast.error('Upload fehlgeschlagen', {
        description: (err as Error).message || 'Bitte erneut versuchen.',
      });
    }
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim() || !selectedChapter) return;
    setIsCreatingFolder(true);
    try {
      const folderPath = `${selectedChapter}/${newFolderName.trim()}`;
      await createFolder.mutateAsync(folderPath);
      setSelectedSubfolder(newFolderName.trim());
      setNewFolderName('');
      toast.success('Ordner erstellt');
    } catch {
      toast.error('Ordner konnte nicht erstellt werden');
    }
    setIsCreatingFolder(false);
  }

  return (
    <SideSheet open={open} onClose={onClose} title="Datei hochladen">
      <div className="p-6">
        <h2 className="text-[18px] font-bold text-[var(--text-primary)] tracking-[-0.02em] mb-6">
          Datei hochladen
        </h2>

        <div className="flex flex-col gap-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-[var(--r-md)] p-8 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-[var(--accent)] bg-[var(--accent-light)]'
                : selectedFile
                  ? 'border-[var(--committed)] bg-[#F0FDF4]'
                  : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            <Upload size={22} className="mx-auto mb-3 opacity-50" />
            {selectedFile ? (
              <p className="text-[13px] font-medium text-[var(--text-primary)]">{selectedFile.name}</p>
            ) : (
              <p className="text-[13px] text-[var(--text-secondary)]">
                Dateien hierher ziehen oder <strong className="text-[var(--accent)]">klicken</strong>
              </p>
            )}
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); }}
            />
          </div>

          {/* Chapter selector */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
              Ordner
            </label>
            <select
              value={selectedChapter}
              onChange={(e) => { setSelectedChapter(e.target.value); setSelectedSubfolder(''); }}
              className="w-full px-[12px] py-[8px] text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] outline-none focus:border-[var(--accent)] transition-colors"
            >
              <option value="">{'\u2014 Ordner w\u00E4hlen \u2014'}</option>
              {chapterFolders.map((cf) => (
                <option key={cf.value} value={cf.value}>{cf.label}</option>
              ))}
            </select>
          </div>

          {/* Subfolder selector (only when chapter selected and has subfolders) */}
          {selectedChapter && (
            loadingSubfolders ? (
              <div className="text-[12px] text-[var(--text-tertiary)]">Wird geladen...</div>
            ) : subfolders.length > 0 ? (
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                  Unterordner (optional)
                </label>
                <select
                  value={selectedSubfolder}
                  onChange={(e) => setSelectedSubfolder(e.target.value)}
                  className="w-full px-[12px] py-[8px] text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] outline-none focus:border-[var(--accent)] transition-colors"
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
                className="flex-1 px-[10px] py-[6px] text-[12px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] outline-none focus:border-[var(--accent)] transition-colors"
              />
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || isCreatingFolder}
                className="px-[10px] py-[6px] text-[11px] font-semibold text-[var(--accent)] border border-[var(--accent)] rounded-[var(--r-sm)] hover:bg-[var(--accent)] hover:text-white disabled:opacity-50 transition-colors"
              >
                {isCreatingFolder ? <Loader2 size={12} className="animate-spin" /> : 'Erstellen'}
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-[14px] py-[8px] text-[13px] text-[var(--text-secondary)] border border-[var(--border)] bg-[var(--surface)] rounded-[var(--r-sm)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              onClick={handleUpload}
              disabled={!selectedFile || !selectedChapter || upload.isPending}
              className="px-[16px] py-[8px] text-[13px] font-semibold text-white bg-[var(--accent)] rounded-[var(--r-sm)] hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 cursor-pointer"
            >
              {upload.isPending ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
              Hochladen
            </button>
          </div>
        </div>
      </div>
    </SideSheet>
  );
}
