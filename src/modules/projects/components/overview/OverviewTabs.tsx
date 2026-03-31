import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { Project } from '../../types/project';
import { ActivityFeed } from './UpdatesFeed';
import { MessagesTab } from './MessagesTab';
import { FilesTab } from './FilesTab';
import { useProjectComments } from '../../hooks/useProjectComments';
import { useProjectActivity } from '../../hooks/useProjectActivity';
import { useProjectFileActivity, useSyncFileActivity } from '../../hooks/useProjectFileActivity';
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';

interface OverviewTabsProps {
  project: Project;
  onOpenStep?: (stepId: string) => void;
}

export function OverviewTabs({ project: p, onOpenStep }: OverviewTabsProps) {
  const [activeTab, setActiveTab] = useState('updates');
  // Single source of comments — passed to both ActivityFeed and MessagesTab
  const { data: comments = [], isLoading: commentsLoading } = useProjectComments(p);
  const { data: fileEvents = [] } = useProjectFileActivity(p.id);
  const { events } = useProjectActivity(p, comments, fileEvents);

  // Sync Nextcloud-direct file activity on mount / project change
  const syncFileActivity = useSyncFileActivity(p.id);
  useEffect(() => { syncFileActivity.mutate(); }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
        <TabsList className="flex-shrink-0">
          <TabsTrigger value="updates" className="px-5 py-2.5">Aktivit&auml;t</TabsTrigger>
          <TabsTrigger value="dateien" className="px-5 py-2.5">Dateien</TabsTrigger>
          <TabsTrigger value="nachrichten" className="px-5 py-2.5">Nachrichten</TabsTrigger>
        </TabsList>

        <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {activeTab === 'updates' && (
                <ActivityFeed events={events} project={p} isLoading={commentsLoading} onOpenStep={onOpenStep} />
              )}
              {activeTab === 'dateien' && (
                <FilesTab project={p} />
              )}
              {activeTab === 'nachrichten' && (
                <MessagesTab comments={comments} isLoading={commentsLoading} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </Tabs>
    </div>
  );
}
