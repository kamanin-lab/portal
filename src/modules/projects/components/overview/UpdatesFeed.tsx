import { useState } from 'react';
import type { Project } from '../../types/project';
import type { ActivityEvent } from '../../hooks/useProjectActivity';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { Button } from '@/shared/components/ui/button';
import { StatusActivityItem, CommentActivityItem } from './ActivityItems';

interface ActivityFeedProps {
  events: ActivityEvent[];
  project?: Project;
  isLoading?: boolean;
  onOpenStep?: (stepId: string) => void;
}

const PAGE_SIZE = 15;

export function ActivityFeed({ events, project, isLoading, onOpenStep }: ActivityFeedProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (isLoading) {
    return <LoadingSkeleton lines={4} height="40px" />;
  }

  if (events.length === 0) {
    return (
      <p className="text-[12.5px] text-text-tertiary px-[8px] py-[7px]">
        Noch keine Aktivitaeten.
      </p>
    );
  }

  const visible = events.slice(0, visibleCount);
  const hasMore = visibleCount < events.length;

  return (
    <div className="flex flex-col">
      {visible.map(event => (
        <ActivityItem key={event.id} event={event} project={project} onOpenStep={onOpenStep} />
      ))}
      {hasMore && (
        <Button
          onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
          variant="outline"
          size="sm"
          className="mt-[8px] self-center text-[12.5px]"
        >
          Mehr anzeigen
        </Button>
      )}
    </div>
  );
}

/** Keep the old named export for backward compatibility */
export { ActivityFeed as UpdatesFeed };

function ActivityItem({ event, project, onOpenStep }: {
  event: ActivityEvent;
  project?: Project;
  onOpenStep?: (stepId: string) => void;
}) {
  if (event.type === 'comment') {
    return <CommentActivityItem event={event} />;
  }
  return <StatusActivityItem event={event} project={project} onOpenStep={onOpenStep} />;
}
