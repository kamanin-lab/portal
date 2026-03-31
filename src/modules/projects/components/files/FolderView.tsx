import { HugeiconsIcon } from '@hugeicons/react';
import { Folder01Icon, ArrowRight01Icon, Delete02Icon } from '@hugeicons/core-free-icons';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { useState } from 'react';
import type { Project } from '../../types/project';
import { useNextcloudFilesByPath, useCreateFolder, useDeleteItem } from '../../hooks/useNextcloudFiles';
import { ConfirmDialog } from '@/shared/components/common/ConfirmDialog';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { FileRow } from './FileRow';
import { FileUpload } from './FileUpload';
import { CreateFolderInput } from './CreateFolderInput';

interface FolderViewProps {
  project: Project;
  pathSegments: string[];
  onNavigate: (newSegments: string[]) => void;
}

export function FolderView({ project, pathSegments, onNavigate }: FolderViewProps) {
  const subPath = pathSegments.join('/');
  const { files, isLoading, error } = useNextcloudFilesByPath(project.id, subPath);
  const createFolder = useCreateFolder(project.id);
  const deleteItem = useDeleteItem(project.id);
  const [pendingDelete, setPendingDelete] = useState<{ path: string; name: string; type: 'file' | 'folder' } | null>(null);

  const folders = files.filter((f) => f.type === 'folder');
  const fileItems = files.filter((f) => f.type === 'file');

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    try {
      await deleteItem.mutateAsync(pendingDelete.path);
      toast.success(`${pendingDelete.type === 'folder' ? 'Ordner' : 'Datei'} gelöscht`);
    } catch (err) {
      toast.error('Löschen fehlgeschlagen', { description: (err as Error).message });
    } finally {
      setPendingDelete(null);
    }
  }

  async function handleCreateFolder(name: string) {
    try {
      const folderPath = subPath ? `${subPath}/${name}` : name;
      await createFolder.mutateAsync(folderPath);
      toast.success('Ordner erstellt', { description: name });
    } catch (err) {
      toast.error('Ordner konnte nicht erstellt werden', {
        description: (err as Error).message,
      });
    }
  }

  return (
    <div className="mt-4">
      {/* Row 1: Breadcrumbs + Create folder button */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <Breadcrumbs pathSegments={pathSegments} onNavigate={onNavigate} />
        <CreateFolderInput
          onSubmit={handleCreateFolder}
          isLoading={createFolder.isPending}
        />
      </div>

      {/* Row 2: Upload zone */}
      <div className="mb-5">
        <FileUpload projectConfigId={project.id} subPath={subPath} />
      </div>

      {/* Row 3: Content list */}
      {isLoading ? (
        <LoadingSkeleton lines={4} height="40px" />
      ) : error ? (
        <EmptyState message="Dateien konnten nicht geladen werden." />
      ) : folders.length === 0 && fileItems.length === 0 ? (
        <EmptyState message="Dieser Ordner ist leer." />
      ) : (
        <motion.div
          className="flex flex-col gap-0.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          {folders.map((f, i) => (
            <motion.div
              key={f.path}
              className="group flex items-center rounded-[var(--r-sm)] hover:bg-[var(--surface-hover)] transition-colors"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: i * 0.03 }}
            >
              <button
                onClick={() => onNavigate([...pathSegments, f.name])}
                className="flex items-center gap-2.5 px-3 py-2.5 flex-1 min-w-0 text-left"
              >
                <HugeiconsIcon icon={Folder01Icon} size={16} className="text-[var(--accent)] flex-shrink-0" />
                <span className="text-body font-medium text-[var(--text-primary)] truncate">{f.name}</span>
              </button>
              <button
                onClick={() => setPendingDelete({ path: f.path, name: f.name, type: 'folder' })}
                className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-2.5 text-[var(--text-tertiary)] hover:text-red-500"
              >
                <HugeiconsIcon icon={Delete02Icon} size={14} />
              </button>
            </motion.div>
          ))}
          {fileItems.map((f, i) => (
            <motion.div
              key={f.path}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: (folders.length + i) * 0.03 }}
            >
              <FileRow
                file={f}
                projectConfigId={project.id}
                onDelete={() => setPendingDelete({ path: f.path, name: f.name, type: 'file' })}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete?.type === 'folder' ? 'Ordner löschen?' : 'Datei löschen?'}
        message={`„${pendingDelete?.name ?? ''}" wird endgültig gelöscht und kann nicht wiederhergestellt werden.`}
        confirmLabel="Löschen"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
        destructive
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Breadcrumbs — extracted for readability
// ---------------------------------------------------------------------------

function Breadcrumbs({
  pathSegments,
  onNavigate,
}: {
  pathSegments: string[];
  onNavigate: (s: string[]) => void;
}) {
  return (
    <nav className="flex items-center gap-1 text-body flex-wrap min-w-0">
      <button
        onClick={() => onNavigate([])}
        className="text-[var(--accent)] hover:underline transition-colors whitespace-nowrap"
      >
        Dateien
      </button>
      {pathSegments.map((seg, idx) => (
        <span key={idx} className="flex items-center gap-1 min-w-0">
          <HugeiconsIcon icon={ArrowRight01Icon} size={12} className="text-[var(--text-tertiary)] flex-shrink-0" />
          {idx === pathSegments.length - 1 ? (
            <span className="text-[var(--text-primary)] font-medium truncate">{seg}</span>
          ) : (
            <button
              onClick={() => onNavigate(pathSegments.slice(0, idx + 1))}
              className="text-[var(--accent)] hover:underline transition-colors truncate"
            >
              {seg}
            </button>
          )}
        </span>
      ))}
    </nav>
  );
}
