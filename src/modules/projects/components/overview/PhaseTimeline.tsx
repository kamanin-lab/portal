import type { Project } from '../../types/project';
import { getChapterStatus } from '../../lib/helpers';
import { PhaseNode } from './PhaseNode';

interface PhaseTimelineProps {
  project: Project;
  onChapterClick?: (chapterId: string) => void;
}

export function PhaseTimeline({ project, onChapterClick }: PhaseTimelineProps) {
  const chapters = project.chapters;

  return (
    <div
      className="flex items-center gap-0 mb-3 px-[6px] py-[8px] bg-[var(--surface)] border border-[var(--border-light)] rounded-[var(--r-md)]"
      style={{ flexShrink: 0 }}
    >
      {chapters.map((chapter, idx) => {
        const status = getChapterStatus(chapter, project);
        const isLast = idx === chapters.length - 1;
        const prevCompleted = idx > 0 && getChapterStatus(chapters[idx - 1], project) === 'completed';

        return (
          <div key={chapter.id} className="flex items-center flex-1">
            <PhaseNode
              chapter={chapter}
              status={status}
              onClick={() => onChapterClick?.(chapter.id)}
            />
            {!isLast && (
              <div
                className={`w-[28px] h-[2px] rounded-[1px] flex-shrink-0 transition-all duration-200 ${
                  prevCompleted ? 'bg-[var(--committed)] opacity-100' : 'bg-[var(--border)] opacity-40'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
