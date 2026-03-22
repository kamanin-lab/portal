import { useState } from 'react';
import type { Project, FileItem } from '../../types/project';
import { ActivityFeed } from './UpdatesFeed';
import { MessagesTab } from './MessagesTab';
import { FilesTab } from './FilesTab';
import { useProjectComments } from '../../hooks/useProjectComments';
import { useProjectActivity } from '../../hooks/useProjectActivity';

type Tab = 'updates' | 'dateien' | 'nachrichten';

interface OverviewTabsProps {
  project: Project;
  onOpenStep?: (stepId: string) => void;
}

export function OverviewTabs({ project: p, onOpenStep }: OverviewTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('updates');

  // Single source of comments — passed to both ActivityFeed and MessagesTab
  const { data: comments = [], isLoading: commentsLoading } = useProjectComments(p);
  const { events } = useProjectActivity(p, comments);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'updates', label: 'Aktivit\u00e4t' },
    { id: 'dateien', label: 'Dateien' },
    { id: 'nachrichten', label: 'Nachrichten' },
  ];

  const allFiles: FileItem[] = p.chapters.flatMap(ch =>
    ch.steps.flatMap(s => s.files)
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Tab bar */}
      <div className="flex gap-0 border-b border-[var(--border)] flex-shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-[20px] py-[10px] text-[12.5px] font-medium border-b-2 transition-all duration-150 cursor-pointer select-none ${
              activeTab === tab.id
                ? 'text-[var(--text-primary)] border-b-[var(--text-primary)] font-semibold'
                : 'text-[var(--text-tertiary)] border-b-transparent hover:text-[var(--text-primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 pt-[14px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {activeTab === 'updates' && (
          <ActivityFeed events={events} project={p} isLoading={commentsLoading} onOpenStep={onOpenStep} />
        )}
        {activeTab === 'dateien' && <FilesTab files={allFiles} />}
        {activeTab === 'nachrichten' && (
          <MessagesTab comments={comments} isLoading={commentsLoading} />
        )}
      </div>
    </div>
  );
}
