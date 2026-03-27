import {
  CheckCircle, AlertCircle, Clock, Circle,
  PauseCircle, XCircle, MessageSquare,
} from 'lucide-react';
import type { Project } from '../../types/project';
import type { ActivityEvent } from '../../hooks/useProjectActivity';
import { linkifyText } from '@/shared/lib/linkify';

/* -- Status Icon helper ---------------------------------------------- */

export function getStatusIcon(rawStatus?: string) {
  const s = (rawStatus || '').toLowerCase().trim();
  if (['approved', 'complete', 'done'].includes(s))
    return { icon: CheckCircle, bg: 'var(--committed-bg)', color: 'var(--phase-4)' };
  if (s === 'client review')
    return { icon: AlertCircle, bg: 'var(--phase-3-light)', color: 'var(--phase-3)' };
  if (['in progress', 'internal review', 'rework'].includes(s))
    return { icon: Clock, bg: 'var(--phase-2-light)', color: 'var(--phase-2)' };
  if (s === 'to do')
    return { icon: Circle, bg: 'var(--surface-active)', color: 'var(--text-tertiary)' };
  if (s === 'on hold')
    return { icon: PauseCircle, bg: 'var(--awaiting-bg)', color: 'var(--awaiting)' };
  if (['canceled', 'cancelled'].includes(s))
    return { icon: XCircle, bg: 'var(--destructive-bg)', color: 'var(--destructive)' };
  return { icon: CheckCircle, bg: 'var(--committed-bg)', color: 'var(--phase-4)' };
}

/* -- Status Change Item ---------------------------------------------- */

function findStepIdByTitle(title: string, project: Project): string | null {
  const word = title.toLowerCase().split(' ')[0];
  for (const ch of project.chapters) {
    for (const step of ch.steps) {
      if (step.title.toLowerCase().includes(word)) return step.id;
    }
  }
  return null;
}

export function StatusActivityItem({ event, project, onOpenStep }: {
  event: ActivityEvent;
  project?: Project;
  onOpenStep?: (stepId: string) => void;
}) {
  const cfg = getStatusIcon(event.rawStatus);
  const Icon = cfg.icon;
  const stepId = project && onOpenStep ? findStepIdByTitle(event.text, project) : null;
  const isClickable = !!stepId;

  return (
    <div
      className={`flex gap-2.5 items-center px-2 py-2 rounded-[var(--r-sm)] transition-colors duration-[120ms] hover:bg-surface-hover ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
      onClick={isClickable ? () => onOpenStep!(stepId!) : undefined}
    >
      <div
        className="w-[26px] h-[26px] rounded-[6px] flex items-center justify-center flex-shrink-0"
        style={{ background: cfg.bg, color: cfg.color }}
      >
        <Icon size={13} />
      </div>
      <div className="flex-1 min-w-0 flex items-baseline gap-2">
        <span className="text-body text-text-primary font-medium leading-[1.35]">
          {event.text}
        </span>
        <span className="text-2xs text-text-tertiary whitespace-nowrap flex-shrink-0">
          {event.timestamp}
        </span>
      </div>
    </div>
  );
}

/* -- Comment Item ---------------------------------------------------- */

export function CommentActivityItem({ event }: { event: ActivityEvent }) {
  const contextLabel = event.chapterTitle
    ? `${event.chapterTitle} — ${event.stepTitle}`
    : event.stepTitle;

  return (
    <div className="flex gap-2.5 px-2 py-2 rounded-[var(--r-sm)] transition-colors duration-[120ms] hover:bg-surface-hover">
      <div
        className="w-[26px] h-[26px] rounded-[6px] flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--phase-1-light)', color: 'var(--phase-1)' }}
      >
        <MessageSquare size={13} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-baseline gap-1.5">
          {event.author && (
            <span className="text-xs font-semibold text-text-primary">
              {event.author}
            </span>
          )}
          <span className="text-2xs text-text-tertiary whitespace-nowrap">
            {event.timestamp}
          </span>
        </div>
        <p className="text-body text-text-secondary leading-[1.4] line-clamp-2 break-words">
          {linkifyText(event.text)}
        </p>
        {contextLabel && (
          <span className="text-2xs text-text-tertiary mt-0.5 truncate">
            {contextLabel}
          </span>
        )}
      </div>
    </div>
  );
}
