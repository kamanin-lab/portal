import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { ContentContainer } from '@/shared/components/layout/ContentContainer';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { useClientFiles } from '../hooks/useClientFiles';
import { ClientFolderView } from '../components/ClientFolderView';

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
      <div className="p-6 max-[768px]:p-4">
        <h1 className="text-xl font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-5">
          Dateien
        </h1>

        <ClientFolderView
          pathSegments={pathSegments}
          onNavigate={setPathSegments}
        />
      </div>
    </ContentContainer>
  );
}
