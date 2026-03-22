import { useMemo } from 'react';
import type { Project } from '../types/project';
import type { ProjectComment } from './useProjectComments';

export interface ActivityEvent {
  id: string;
  type: 'status_change' | 'comment';
  text: string;
  author?: string;
  timestamp: string;
  /** ISO string for sorting */
  sortDate: string;
  stepTitle?: string;
  chapterTitle?: string;
  rawStatus?: string;
}

function updatesToEvents(project: Project): ActivityEvent[] {
  return project.updates.map((u, idx) => ({
    id: `update-${idx}`,
    type: 'status_change' as const,
    text: u.text,
    timestamp: u.time,
    sortDate: u.rawTimestamp || '1970-01-01T00:00:00.000Z',
    rawStatus: u.rawStatus,
  }));
}

function commentsToEvents(comments: ProjectComment[]): ActivityEvent[] {
  return comments.map(c => ({
    id: `comment-${c.id}`,
    type: 'comment' as const,
    text: c.text,
    author: c.authorName,
    timestamp: formatRelativeTime(c.createdAt),
    sortDate: c.createdAt,
    stepTitle: c.stepTitle,
    chapterTitle: c.chapterTitle,
  }));
}

function formatRelativeTime(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'gerade eben';
    if (diffMin < 60) return `vor ${diffMin} Min.`;

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `vor ${diffHours} Std.`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `vor ${diffDays} ${diffDays === 1 ? 'Tag' : 'Tagen'}`;

    return date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return isoDate;
  }
}

/**
 * Combines project status-change updates with comment events into a
 * unified, reverse-chronologically sorted activity feed.
 *
 * Comments are accepted as a parameter to avoid duplicate Realtime
 * subscriptions — the caller (OverviewTabs) owns the single
 * useProjectComments hook instance.
 */
export function useProjectActivity(project: Project | null, comments: ProjectComment[]) {
  const events = useMemo(() => {
    if (!project) return [];

    const statusEvents = updatesToEvents(project);
    const commentEvents = commentsToEvents(comments);

    return [...statusEvents, ...commentEvents].sort(
      (a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime(),
    );
  }, [project, comments]);

  return {
    events,
  };
}
