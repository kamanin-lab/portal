import type { Project } from '../../types/project';
import { PhaseTimeline } from './PhaseTimeline';

interface ContextStripProps {
  project: Project;
  onChapterClick?: (chapterId: string) => void;
}

export function ContextStrip({ project, onChapterClick }: ContextStripProps) {
  return (
    <div className="flex-shrink-0 mb-6">
      <PhaseTimeline project={project} onChapterClick={onChapterClick} />
    </div>
  );
}
