import { EmptyState } from '@/shared/components/common/EmptyState';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { ContentContainer } from '@/shared/components/layout/ContentContainer';
import { linkifyText } from '@/shared/lib/linkify';
import type { ProjectComment } from '../../hooks/useProjectComments';

interface MessagesPageProps {
  comments: ProjectComment[];
  isLoading: boolean;
}

function formatCommentTime(isoDate: string): string {
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

function CommentItem({ comment }: { comment: ProjectComment }) {
  const isTeam = !comment.isFromPortal;
  const initial = comment.authorName.charAt(0).toUpperCase();
  const avatarBg = isTeam ? 'var(--accent)' : 'var(--phase-1)';

  return (
    <div className="flex gap-2.5 py-2">
      <div
        className="w-[28px] h-[28px] rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: avatarBg, color: 'var(--text-inverse)', fontSize: '10px', fontWeight: 700 }}
      >
        {initial}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs font-semibold text-[var(--text-primary)]">{comment.authorName}</span>
          <span className="text-2xs text-[var(--text-tertiary)] whitespace-nowrap">{formatCommentTime(comment.createdAt)}</span>
        </div>
        <p className="text-body text-[var(--text-secondary)] leading-[1.5] break-words">
          {linkifyText(comment.text)}
        </p>
      </div>
    </div>
  );
}

export function MessagesPage({ comments, isLoading }: MessagesPageProps) {
  if (isLoading) {
    return (
      <ContentContainer width="narrow">
        <div className="p-6 max-[768px]:p-4">
          <h1 className="text-xl font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-5">
            Nachrichten
          </h1>
          <LoadingSkeleton lines={4} height="48px" />
        </div>
      </ContentContainer>
    );
  }

  // Group comments by taskId (step)
  const groupMap = new Map<string, { stepTitle: string; chapterTitle: string; comments: ProjectComment[] }>();
  for (const c of comments) {
    const existing = groupMap.get(c.taskId);
    if (existing) {
      existing.comments.push(c);
    } else {
      groupMap.set(c.taskId, {
        stepTitle: c.stepTitle,
        chapterTitle: c.chapterTitle,
        comments: [c],
      });
    }
  }
  const groups = Array.from(groupMap.values());

  return (
    <ContentContainer width="narrow">
      <div className="p-6 max-[768px]:p-4">
        <h1 className="text-xl font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-5">
          Nachrichten
        </h1>

        {groups.length === 0 && <EmptyState message="Noch keine Nachrichten." />}

        {groups.map((group, idx) => (
          <div key={idx} className="mb-7">
            <div className="text-xxs font-semibold text-[var(--text-secondary)] uppercase tracking-[0.04em] mb-3 pb-2 border-b border-[var(--border-light)]">
              {group.chapterTitle} · {group.stepTitle}
            </div>
            <div className="flex flex-col gap-2.5 px-1">
              {group.comments.map(comment => (
                <CommentItem key={comment.id} comment={comment} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </ContentContainer>
  );
}
