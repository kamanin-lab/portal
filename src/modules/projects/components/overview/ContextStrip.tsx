import type { Project } from '../../types/project';
import { generateNarrative } from '../../lib/helpers';
import { PhaseTimeline } from './PhaseTimeline';

interface ContextStripProps {
  project: Project;
  onChapterClick?: (chapterId: string) => void;
}

export function ContextStrip({ project, onChapterClick }: ContextStripProps) {
  const narrative = generateNarrative(project);
  const { teamWorkingOn } = project;

  return (
    <div className="flex-shrink-0 mb-[22px] pb-[14px] border-b border-[var(--border-light)]">
      <PhaseTimeline project={project} onChapterClick={onChapterClick} />

      {/* Narrative */}
      <p className="text-[13px] text-[var(--text-secondary)] leading-[1.55] mb-[6px]">
        {narrative}
      </p>

      {/* Team status line */}
      <div className="flex items-center gap-[6px] text-[11.5px] text-[var(--text-secondary)]">
        <span
          className="w-[6px] h-[6px] rounded-full bg-[var(--committed)] flex-shrink-0"
        />
        <span>
          Team arbeitet an{' '}
          <strong className="text-[var(--text-primary)] font-medium">
            {teamWorkingOn.task}
          </strong>
          {' '}· ETA:{' '}
          <strong className="text-[var(--text-primary)] font-medium">
            {teamWorkingOn.eta}
          </strong>
          {' '}· {teamWorkingOn.lastUpdate}
        </span>
      </div>
    </div>
  );
}
