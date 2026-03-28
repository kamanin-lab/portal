import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Loading03Icon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import { SideSheet } from '@/shared/components/ui/SideSheet';
import { Button } from '@/shared/components/ui/button';
import type { Project } from '../types/project';
import { useUploadFileByPath } from '../hooks/useNextcloudFiles';
import { UploadDropZone } from './UploadDropZone';
import { UploadFolderSelector } from './UploadFolderSelector';

interface UploadSheetProps {
  project: Project;
  open: boolean;
  onClose: () => void;
}

export function UploadSheet({ project, open, onClose }: UploadSheetProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedChapter, setSelectedChapter] = useState('');
  const [selectedSubfolder, setSelectedSubfolder] = useState('');

  const uploadPath = selectedSubfolder
    ? `${selectedChapter}/${selectedSubfolder}`
    : selectedChapter;

  const upload = useUploadFileByPath(project.id, uploadPath);

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

  return (
    <SideSheet open={open} onClose={onClose} title="Datei hochladen">
      <div className="p-6">
        <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-[-0.02em] mb-6">
          Datei hochladen
        </h2>

        <div className="flex flex-col gap-4">
          <UploadDropZone
            selectedFile={selectedFile}
            onFileSelect={setSelectedFile}
          />

          <UploadFolderSelector
            project={project}
            selectedChapter={selectedChapter}
            onChapterChange={setSelectedChapter}
            selectedSubfolder={selectedSubfolder}
            onSubfolderChange={setSelectedSubfolder}
          />

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={onClose}>
              Abbrechen
            </Button>
            <Button
              variant="accent"
              onClick={handleUpload}
              disabled={!selectedFile || !selectedChapter || upload.isPending}
            >
              {upload.isPending ? <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" /> : null}
              Hochladen
            </Button>
          </div>
        </div>
      </div>
    </SideSheet>
  );
}
