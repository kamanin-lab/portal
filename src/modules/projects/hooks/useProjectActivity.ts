import { useMemo } from 'react';
import type { Project } from '../types/project';
import type { ProjectComment } from './useProjectComments';
import type { FileActivityRecord } from './useProjectFileActivity';

export interface ActivityEvent {
  id: string;
  type: 'status_change' | 'comment' | 'file_activity';
  text: string;
  author?: string;
  timestamp: string;
  /** ISO string for sorting */
  sortDate: string;
  stepTitle?: string;
  chapterTitle?: string;
  rawStatus?: string;
  fileEventType?: 'file_uploaded' | 'folder_created';
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

function fileEventsToActivity(records: FileActivityRecord[]): ActivityEvent[] {
  return records.map(r => ({
    id: `file-${r.id}`,
    type: 'file_activity' as const,
    text: r.event_type === 'file_uploaded'
      ? `Datei hinzugefügt: ${r.name}`
      : `Ordner erstellt: ${r.name}`,
    timestamp: formatRelativeTime(r.created_at),
    sortDate: r.created_at,
    fileEventType: r.event_type,
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

    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return isoDate;
  }
}

/**
 * Combines project status-change updates with comment events and file
 * activity events into a unified, reverse-chronologically sorted activity feed.
 *
 * Comments and file events are accepted as parameters to avoid duplicate
 * Realtime subscriptions — the caller (OverviewTabs) owns the hook instances.
 */
export function useProjectActivity(
  project: Project | null,
  comments: ProjectComment[],
  fileEvents: FileActivityRecord[] = [],
) {
  const events = useMemo(() => {
    if (!project) return [];

    const statusEvents = updatesToEvents(project);
    const commentEvents = commentsToEvents(comments);
    const fileActivityEvents = fileEventsToActivity(fileEvents);

    return [...statusEvents, ...commentEvents, ...fileActivityEvents].sort(
      (a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime(),
    );
  }, [project, comments, fileEvents]);

  return {
    events,
  };
}
