import { useState } from 'react';
import {
  CheckCircle, AlertCircle, Clock, Circle,
  PauseCircle, XCircle, MessageSquare,
} from 'lucide-react';
import type { Project } from '../../types/project';
import type { ActivityEvent } from '../../hooks/useProjectActivity';
import { linkifyText } from '@/shared/lib/linkify';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';

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
      <p className="text-[12.5px] text-[var(--text-tertiary)] px-[8px] py-[7px]">
        Noch keine Aktivit\u00e4ten.
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
        <button
          onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
          className="mt-[8px] px-[14px] py-[7px] text-[12.5px] font-medium text-[var(--text-secondary)] border border-[var(--border)] bg-white/60 rounded-[var(--r-sm)] self-center transition-all duration-150 hover:bg-white hover:border-[var(--text-tertiary)] cursor-pointer"
        >
          Mehr anzeigen
        </button>
      )}
    </div>
  );
}

/** Keep the old named export for backward compatibility if anything imports UpdatesFeed */
export { ActivityFeed as UpdatesFeed };

/* ── Activity Item ──────────────────────────────────────────── */

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

/* ── Status Change Item ─────────────────────────────────────── */

function getStatusIcon(rawStatus?: string) {
  const s = (rawStatus || '').toLowerCase().trim();
  if (['approved', 'complete', 'done'].includes(s))
    return { icon: CheckCircle, bg: '#ECFDF5', color: '#059669' };
  if (s === 'client review')
    return { icon: AlertCircle, bg: '#FFFBEB', color: '#D97706' };
  if (['in progress', 'internal review', 'rework'].includes(s))
    return { icon: Clock, bg: '#EFF6FF', color: '#2563EB' };
  if (s === 'to do')
    return { icon: Circle, bg: 'var(--surface-active)', color: 'var(--text-tertiary)' };
  if (s === 'on hold')
    return { icon: PauseCircle, bg: '#FFF7ED', color: '#EA580C' };
  if (['canceled', 'cancelled'].includes(s))
    return { icon: XCircle, bg: '#FEF2F2', color: '#DC2626' };
  return { icon: CheckCircle, bg: '#ECFDF5', color: '#059669' };
}

function findStepIdByTitle(title: string, project: Project): string | null {
  const word = title.toLowerCase().split(' ')[0];
  for (const ch of project.chapters) {
    for (const step of ch.steps) {
      if (step.title.toLowerCase().includes(word)) return step.id;
    }
  }
  return null;
}

function StatusActivityItem({ event, project, onOpenStep }: {
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
      className={`flex gap-[10px] items-center px-[8px] py-[7px] rounded-[var(--r-sm)] transition-colors duration-[120ms] hover:bg-[var(--surface-hover)] ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
      onClick={isClickable ? () => onOpenStep!(stepId!) : undefined}
    >
      <div
        className="w-[26px] h-[26px] rounded-[6px] flex items-center justify-center flex-shrink-0"
        style={{ background: cfg.bg, color: cfg.color }}
      >
        <Icon size={13} />
      </div>
      <div className="flex-1 min-w-0 flex items-baseline gap-[8px]">
        <span className="text-[12.5px] text-[var(--text-primary)] font-medium leading-[1.35]">
          {event.text}
        </span>
        <span className="text-[10px] text-[var(--text-tertiary)] whitespace-nowrap flex-shrink-0">
          {event.timestamp}
        </span>
      </div>
    </div>
  );
}

/* ── Comment Item ───────────────────────────────────────────── */

function CommentActivityItem({ event }: { event: ActivityEvent }) {
  const contextLabel = event.chapterTitle
    ? `${event.chapterTitle} — ${event.stepTitle}`
    : event.stepTitle;

  return (
    <div className="flex gap-[10px] px-[8px] py-[7px] rounded-[var(--r-sm)] transition-colors duration-[120ms] hover:bg-[var(--surface-hover)]">
      <div
        className="w-[26px] h-[26px] rounded-[6px] flex items-center justify-center flex-shrink-0"
        style={{ background: '#F5F3FF', color: '#7C3AED' }}
      >
        <MessageSquare size={13} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-[1px]">
        <div className="flex items-baseline gap-[6px]">
          {event.author && (
            <span className="text-[12px] font-semibold text-[var(--text-primary)]">
              {event.author}
            </span>
          )}
          <span className="text-[10px] text-[var(--text-tertiary)] whitespace-nowrap">
            {event.timestamp}
          </span>
        </div>
        <p className="text-[12.5px] text-[var(--text-secondary)] leading-[1.4] line-clamp-2 break-words">
          {linkifyText(event.text)}
        </p>
        {contextLabel && (
          <span className="text-[10px] text-[var(--text-tertiary)] mt-[1px] truncate">
            {contextLabel}
          </span>
        )}
      </div>
    </div>
  );
}
