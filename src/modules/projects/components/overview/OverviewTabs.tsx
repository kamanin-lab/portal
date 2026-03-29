import type { Project } from '../../types/project';
import { ActivityFeed } from './UpdatesFeed';
import { MessagesTab } from './MessagesTab';
import { FilesTab } from './FilesTab';
import { useProjectComments } from '../../hooks/useProjectComments';
import { useProjectActivity } from '../../hooks/useProjectActivity';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/components/ui/tabs';

interface OverviewTabsProps {
  project: Project;
  onOpenStep?: (stepId: string) => void;
}

export function OverviewTabs({ project: p, onOpenStep }: OverviewTabsProps) {
  // Single source of comments — passed to both ActivityFeed and MessagesTab
  const { data: comments = [], isLoading: commentsLoading } = useProjectComments(p);
  const { events } = useProjectActivity(p, comments);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <Tabs defaultValue="updates" className="flex-1 min-h-0 flex flex-col">
        <TabsList className="flex-shrink-0">
          <TabsTrigger value="updates" className="px-5 py-2.5">Aktivit&auml;t</TabsTrigger>
          <TabsTrigger value="dateien" className="px-5 py-2.5">Dateien</TabsTrigger>
          <TabsTrigger value="nachrichten" className="px-5 py-2.5">Nachrichten</TabsTrigger>
        </TabsList>

        <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <TabsContent value="updates">
            <ActivityFeed events={events} project={p} isLoading={commentsLoading} onOpenStep={onOpenStep} />
          </TabsContent>
          <TabsContent value="dateien">
            <FilesTab projectConfigId={p.id} />
          </TabsContent>
          <TabsContent value="nachrichten">
            <MessagesTab comments={comments} isLoading={commentsLoading} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
