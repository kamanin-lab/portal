import { HugeiconsIcon } from '@hugeicons/react';
import { Folder01Icon, ArrowRight01Icon, Delete02Icon } from '@hugeicons/core-free-icons';
import { useState, useCallback } from 'react';
import { useClientFiles, useDeleteClientItem } from '../hooks/useClientFiles';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { ClientActionBar } from './ClientActionBar';
import { ClientFileRow } from './ClientFileRow';
import { ConfirmDialog } from '@/shared/components/common/ConfirmDialog';
import { toast } from 'sonner';

interface ClientFolderViewProps {
  pathSegments: string[];
  onNavigate: (newSegments: string[]) => void;
}

export function ClientFolderView({ pathSegments, onNavigate }: ClientFolderViewProps) {
  const subPath = pathSegments.length > 0 ? pathSegments.join('/') : undefined;
  const { files, isLoading, error, refetch } = useClientFiles(subPath);

  const folders = files.filter((f) => f.type === 'folder');
  const fileItems = files.filter((f) => f.type === 'file');
  const isRoot = pathSegments.length === 0;

  const deleteItem = useDeleteClientItem();
  const [pendingDelete, setPendingDelete] = useState<{ path: string; name: string; type: 'file' | 'folder' } | null>(null);

  const handleActionSuccess = useCallback(() => {
    refetch();
  }, [refetch]);

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    const label = pendingDelete.type === 'folder' ? 'Ordner' : 'Datei';
    try {
      await deleteItem.mutateAsync(pendingDelete.path);
      toast.success(`${label} gelöscht`);
    } catch (err) {
      toast.error('Löschen fehlgeschlagen', { description: (err as Error).message });
    } finally { setPendingDelete(null); }
  }

  return (
    <>
      {/* Breadcrumbs — only when inside a subfolder */}
      {!isRoot && <ClientBreadcrumbs pathSegments={pathSegments} onNavigate={onNavigate} />}

      {/* Action bar — upload + create folder (hidden at root) */}
      {isRoot ? (
        <p className="text-body text-[var(--text-secondary)] mb-4">
          Öffnen Sie einen Ordner, um Dateien hochzuladen und Unterordner zu verwalten.
        </p>
      ) : (
        <ClientActionBar currentSubPath={subPath ?? ''} onSuccess={handleActionSuccess} />
      )}

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton lines={4} height="40px" />
      ) : error ? (
        <EmptyState message="Dateien konnten nicht geladen werden." />
      ) : (
        <>
          {/* Subfolders */}
          {folders.length > 0 && (
            isRoot ? (
              <div className="grid grid-cols-3 gap-2.5 max-[768px]:grid-cols-2">
                {folders.map((f) => (
                  <button
                    key={f.path || f.name}
                    onClick={() => onNavigate([...pathSegments, f.name])}
                    className="p-4 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] text-left transition-all hover:-translate-y-px hover:border-[var(--accent)]"
                  >
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon icon={Folder01Icon} size={16} className="text-[var(--accent)] flex-shrink-0" />
                      <span className="text-body font-semibold text-[var(--text-primary)]">
                        {f.name}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-0.5 mb-3">
                {folders.map((f) => (
                  <div key={f.path || f.name} className="group flex items-center rounded-[var(--r-sm)] hover:bg-[var(--surface-hover)] transition-colors">
                    <button
                      onClick={() => onNavigate([...pathSegments, f.name])}
                      className="flex items-center gap-2.5 px-3 py-2.5 flex-1 min-w-0 text-left"
                    >
                      <HugeiconsIcon icon={Folder01Icon} size={16} className="text-[var(--accent)] flex-shrink-0" />
                      <span className="text-body font-medium text-[var(--text-primary)] truncate">{f.name}</span>
                    </button>
                    <button
                      onClick={() => setPendingDelete({ path: f.path, name: f.name, type: 'folder' })}
                      className="px-3 py-2.5 text-[var(--text-tertiary)] hover:text-red-500"
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Files */}
          {fileItems.length > 0 && (
            <div className="flex flex-col gap-0.5 mb-3">
              {fileItems.map((f) => (
                <ClientFileRow
                  key={f.path || f.name}
                  file={f}
                  onDelete={isRoot ? undefined : () => setPendingDelete({ path: f.path, name: f.name, type: 'file' })}
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {folders.length === 0 && fileItems.length === 0 && (
            <EmptyState message={isRoot ? 'Keine Dateien vorhanden.' : 'Dieser Ordner ist leer.'} />
          )}
        </>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete?.type === 'folder' ? 'Ordner löschen?' : 'Datei löschen?'}
        message={`„${pendingDelete?.name ?? ''}" wird endgültig gelöscht und kann nicht wiederhergestellt werden.`}
        confirmLabel="Löschen" onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)} destructive
      />
    </>
  );
}

function ClientBreadcrumbs({ pathSegments, onNavigate }: { pathSegments: string[]; onNavigate: (s: string[]) => void }) {
  return (
    <nav className="flex items-center gap-1 text-body mb-4 flex-wrap">
      <button
        onClick={() => onNavigate([])}
        className="text-[var(--accent)] hover:underline transition-colors"
      >
        Dateien
      </button>
      {pathSegments.map((seg, idx) => (
        <span key={idx} className="flex items-center gap-1">
          <HugeiconsIcon icon={ArrowRight01Icon} size={12} className="text-[var(--text-tertiary)]" />
          {idx === pathSegments.length - 1 ? (
            <span className="text-[var(--text-primary)] font-medium">{seg}</span>
          ) : (
            <button
              onClick={() => onNavigate(pathSegments.slice(0, idx + 1))}
              className="text-[var(--accent)] hover:underline transition-colors"
            >
              {seg}
            </button>
          )}
        </span>
      ))}
    </nav>
  );
}
