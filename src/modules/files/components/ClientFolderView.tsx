import { Folder, ChevronRight } from 'lucide-react';
import { useCallback } from 'react';
import { useClientFiles } from '../hooks/useClientFiles';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { ClientActionBar } from './ClientActionBar';
import { ClientFileRow } from './ClientFileRow';

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

  const handleActionSuccess = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <>
      {/* Breadcrumbs — only when inside a subfolder */}
      {!isRoot && (
        <nav className="flex items-center gap-[4px] text-[13px] mb-[16px] flex-wrap">
          <button
            onClick={() => onNavigate([])}
            className="text-[var(--accent)] hover:underline transition-colors"
          >
            Dateien
          </button>
          {pathSegments.map((seg, idx) => (
            <span key={idx} className="flex items-center gap-[4px]">
              <ChevronRight size={12} className="text-[var(--text-tertiary)]" />
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
      )}

      {/* Action bar — upload + create folder */}
      <ClientActionBar currentSubPath={subPath ?? ''} onSuccess={handleActionSuccess} />

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
              <div className="grid grid-cols-3 gap-[10px] max-[768px]:grid-cols-2">
                {folders.map((f) => (
                  <button
                    key={f.path || f.name}
                    onClick={() => onNavigate([...pathSegments, f.name])}
                    className="p-[16px] rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] text-left transition-all hover:-translate-y-px hover:border-[var(--accent)]"
                  >
                    <div className="flex items-center gap-[8px]">
                      <Folder size={16} className="text-[var(--accent)] flex-shrink-0" />
                      <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                        {f.name}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-[2px] mb-[12px]">
                {folders.map((f) => (
                  <button
                    key={f.path || f.name}
                    onClick={() => onNavigate([...pathSegments, f.name])}
                    className="flex items-center gap-[10px] px-[12px] py-[10px] rounded-[var(--r-sm)] hover:bg-[var(--surface-hover)] transition-colors text-left"
                  >
                    <Folder size={16} className="text-[var(--accent)] flex-shrink-0" />
                    <span className="text-[13px] font-medium text-[var(--text-primary)]">
                      {f.name}
                    </span>
                  </button>
                ))}
              </div>
            )
          )}

          {/* Files */}
          {fileItems.length > 0 && (
            <div className="flex flex-col gap-[2px] mb-[12px]">
              {fileItems.map((f) => (
                <ClientFileRow key={f.path || f.name} file={f} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {folders.length === 0 && fileItems.length === 0 && (
            <EmptyState message={isRoot ? 'Keine Dateien vorhanden.' : 'Dieser Ordner ist leer.'} />
          )}
        </>
      )}
    </>
  );
}
