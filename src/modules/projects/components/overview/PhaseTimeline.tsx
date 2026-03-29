import type { Project } from '../../types/project';
import { getChapterStatus } from '../../lib/helpers';
import { useBreakpoint } from '@/shared/hooks/useBreakpoint';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { PhaseNode } from './PhaseNode';
import { PhaseConnector } from './PhaseConnector';

interface PhaseTimelineProps {
  project: Project;
  onChapterClick?: (chapterId: string) => void;
}

export function PhaseTimeline({ project, onChapterClick }: PhaseTimelineProps) {
  const chapters = project.chapters;
  const { isMobile } = useBreakpoint();

  const timeline = (
    <div className="flex">
      {chapters.map((chapter, idx) => {
        const status = getChapterStatus(chapter, project);
        const isLast = idx === chapters.length - 1;
        return (
          <div
            key={chapter.id}
            className={`relative ${isLast ? '' : isMobile ? 'flex-shrink-0 min-w-[130px]' : 'flex-1 min-w-0'}`}
          >
            <PhaseNode
              chapter={chapter}
              status={status}
              onClick={() => onChapterClick?.(chapter.id)}
              showTooltip={!isMobile}
            />
            {/* Connector line at indicator center height */}
            {!isLast && (
              <div className="absolute h-[2px]" style={{ top: 15, left: 36, right: 0 }}>
                <PhaseConnector chapter={chapter} status={status} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const container = "mb-3 px-3 py-2 bg-[var(--surface)] border border-[var(--border-light)] rounded-[var(--r-md)]";

  if (isMobile) {
    return (
      <div className={`${container} overflow-x-auto`}>
        {timeline}
      </div>
    );
  }

  return (
    <div className={container}>
      <TooltipProvider delayDuration={300}>
        {timeline}
      </TooltipProvider>
    </div>
  );
}
