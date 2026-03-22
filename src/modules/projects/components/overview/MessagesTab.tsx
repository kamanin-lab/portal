import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { linkifyText } from '@/shared/lib/linkify';
import type { ProjectComment } from '../../hooks/useProjectComments';

const PAGE_SIZE = 10;

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

interface MessagesTabProps {
  comments: ProjectComment[];
  isLoading: boolean;
}

export function MessagesTab({ comments, isLoading }: MessagesTabProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (isLoading) {
    return <LoadingSkeleton lines={4} height="48px" />;
  }

  if (comments.length === 0) {
    return <EmptyState message="Noch keine Nachrichten." icon={<MessageSquare size={28} />} />;
  }

  const visible = comments.slice(0, visibleCount);
  const hasMore = visibleCount < comments.length;

  return (
    <div className="flex flex-col">
      {visible.map(comment => (
        <CommentFeedItem key={comment.id} comment={comment} />
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

function CommentFeedItem({ comment }: { comment: ProjectComment }) {
  const isTeam = !comment.isFromPortal;
  const initial = comment.authorName.charAt(0).toUpperCase();
  const avatarBg = isTeam ? 'var(--accent)' : 'var(--phase-1)';
  const contextLabel = comment.chapterTitle
    ? `${comment.chapterTitle} \u2014 ${comment.stepTitle}`
    : comment.stepTitle;

  return (
    <div className="flex gap-[10px] px-[6px] py-[8px] rounded-[var(--r-sm)] transition-colors duration-[120ms] hover:bg-[var(--surface-hover)]">
      {/* Avatar */}
      <div
        className="w-[28px] h-[28px] rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: avatarBg, color: 'var(--text-inverse)', fontSize: '10px', fontWeight: 700 }}
      >
        {initial}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
        {/* Header: name + time */}
        <div className="flex items-baseline gap-[6px]">
          <span className="text-[12px] font-semibold text-[var(--text-primary)]">
            {comment.authorName}
          </span>
          <span className="text-[10px] text-[var(--text-tertiary)] whitespace-nowrap">
            {formatCommentTime(comment.createdAt)}
          </span>
        </div>

        {/* Comment text (truncated to ~2 lines) */}
        <p className="text-[12.5px] text-[var(--text-secondary)] leading-[1.4] line-clamp-2 break-words">
          {linkifyText(comment.text)}
        </p>

        {/* Step/chapter context tag */}
        <span className="text-[10px] text-[var(--text-tertiary)] mt-[1px] truncate">
          {contextLabel}
        </span>
      </div>
    </div>
  );
}
