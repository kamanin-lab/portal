import { useState } from 'react';
import { Folder, FolderOpen } from 'lucide-react';
import { ContentContainer } from '@/shared/components/layout/ContentContainer';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { useClientFiles } from '../hooks/useClientFiles';
import { ClientFolderView } from '../components/ClientFolderView';

/** Top-level folder definitions for the client portal root. */
const CLIENT_FOLDERS = [
  { name: 'projekte', label: 'Projekte' },
  { name: 'aufgaben', label: 'Aufgaben' },
  { name: 'dokumente', label: 'Dokumente' },
  { name: 'branding', label: 'Branding' },
  { name: 'uploads', label: 'Uploads' },
] as const;

export function DateienPage() {
  const [pathSegments, setPathSegments] = useState<string[]>([]);
  const { notConfigured, isLoading } = useClientFiles();

  if (isLoading) {
    return (
      <ContentContainer width="narrow" className="p-6 max-[768px]:p-4">
        <LoadingSkeleton lines={5} height="56px" />
      </ContentContainer>
    );
  }

  if (notConfigured) {
    return (
      <ContentContainer width="narrow" className="p-6 max-[768px]:p-4">
        <EmptyState
          icon={<FolderOpen size={28} />}
          message="Dateien sind noch nicht konfiguriert."
        />
      </ContentContainer>
    );
  }

  return (
    <ContentContainer width="narrow">
      <div className="p-[24px] max-[768px]:p-[16px]">
        <h1 className="text-[1.2rem] font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-[20px]">
          Dateien
        </h1>

        {pathSegments.length > 0 ? (
          <ClientFolderView
            pathSegments={pathSegments}
            onNavigate={setPathSegments}
          />
        ) : (
          <ClientFolderGrid onSelect={(folder) => setPathSegments([folder])} />
        )}
      </div>
    </ContentContainer>
  );
}

// ---------------------------------------------------------------------------
// ClientFolderGrid — root view showing top-level portal folder cards
// ---------------------------------------------------------------------------

interface ClientFolderGridProps {
  onSelect: (folderName: string) => void;
}

function ClientFolderGrid({ onSelect }: ClientFolderGridProps) {
  return (
    <div className="grid grid-cols-3 gap-[10px] max-[768px]:grid-cols-2">
      {CLIENT_FOLDERS.map((folder) => (
        <button
          key={folder.name}
          onClick={() => onSelect(folder.name)}
          className="p-[16px] rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] text-left transition-all hover:-translate-y-px hover:border-[var(--accent)]"
        >
          <div className="flex items-center gap-[8px]">
            <Folder size={16} className="text-[var(--accent)] flex-shrink-0" />
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">
              {folder.label}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
