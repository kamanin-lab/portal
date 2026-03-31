import { useState, useEffect } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { FolderOpenIcon } from '@hugeicons/core-free-icons';
import { ContentContainer } from '@/shared/components/layout/ContentContainer';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { useClientFiles, useClientFileActivity, useSyncClientFileActivity, downloadClientFile } from '../hooks/useClientFiles';
import type { ClientFileActivityRecord } from '../hooks/useClientFiles';
import { ClientFolderView } from '../components/ClientFolderView';
import { FileActivityItem } from '@/modules/projects/components/overview/ActivityItems';
import type { ActivityEvent } from '@/modules/projects/hooks/useProjectActivity';
import { formatRelativeTime } from '@/shared/lib/date-utils';

function toActivityEvent(r: ClientFileActivityRecord): ActivityEvent {
  return {
    id: `client-file-${r.id}`,
    type: 'file_activity',
    text: r.event_type === 'file_uploaded'
      ? `Datei hinzugefügt: ${r.name}`
      : `Ordner erstellt: ${r.name}`,
    timestamp: formatRelativeTime(r.created_at),
    sortDate: r.created_at,
    fileEventType: r.event_type,
    filePath: r.path ?? undefined,
    actorLabel: r.actor_label ?? undefined,
  };
}

export function DateienPage() {
  const [pathSegments, setPathSegments] = useState<string[]>([]);
  const { notConfigured, isLoading } = useClientFiles();
  const { data: activityRecords = [] } = useClientFileActivity();
  const syncActivity = useSyncClientFileActivity();

  useEffect(() => { syncActivity.mutate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
          icon={<HugeiconsIcon icon={FolderOpenIcon} size={28} />}
          message="Dateien sind noch nicht konfiguriert."
        />
      </ContentContainer>
    );
  }

  const activityEvents = activityRecords.map(toActivityEvent);

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

        {activityEvents.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1 px-2">
              Letzte Aktivität
            </p>
            <div className="flex flex-col">
              {activityEvents.slice(0, 10).map(event => (
                <FileActivityItem
                  key={event.id}
                  event={event}
                  onDownload={event.fileEventType === 'file_uploaded' && event.filePath
                    ? () => downloadClientFile(event.filePath!)
                    : undefined
                  }
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </ContentContainer>
  );
}
