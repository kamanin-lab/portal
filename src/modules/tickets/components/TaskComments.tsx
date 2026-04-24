import { useEffect, useRef } from 'react';
import { MessageBubble } from '@/shared/components/common/MessageBubble';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { CommentInput } from './CommentInput';
import { useTaskComments, usePostComment } from '../hooks/useTaskComments';
import { dict } from '../lib/dictionary';

/* ── TaskCommentsList — read-only message list ───────────────────────────── */

interface TaskCommentsListProps {
  taskId: string;
  onRead?: () => void;
  clientBubbleStyle?: 'solid' | 'light';
  /** When true, scroll to bottom once after initial load (chat UX). Default false. */
  autoScrollOnLoad?: boolean;
}

export function TaskCommentsList({
  taskId,
  onRead,
  clientBubbleStyle = 'light',
  autoScrollOnLoad = false,
}: TaskCommentsListProps) {
  const { data: comments = [], isLoading, error } = useTaskComments(taskId);
  const calledOnRead = useRef(false);
  const hasScrolled = useRef(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    calledOnRead.current = false;
    hasScrolled.current = false;
  }, [taskId]);

  useEffect(() => {
    if (isLoading || error || calledOnRead.current) return;
    calledOnRead.current = true;
    onRead?.();
  }, [error, isLoading, onRead]);

  // Scroll to bottom only once on initial load — only when autoScrollOnLoad is true.
  useEffect(() => {
    if (!autoScrollOnLoad) return;
    if (hasScrolled.current || isLoading || comments.length === 0) return;
    hasScrolled.current = true;
    commentsEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [autoScrollOnLoad, comments, isLoading]);

  return (
    <div className="pt-2 flex flex-col gap-3">
      <h3 className="text-body font-semibold text-text-secondary uppercase tracking-[0.04em]">
        {dict.labels.commentsTitle}
      </h3>

      <div className="flex flex-col gap-3.5 px-1">
        {isLoading ? (
          <LoadingSkeleton lines={2} height="56px" />
        ) : comments.length === 0 ? (
          <EmptyState message={dict.labels.noComments} />
        ) : (
          <>
            {[...comments].reverse().map(comment => {
              const isClient = comment.isFromPortal;
              return (
                <MessageBubble
                  key={comment.id}
                  role={isClient ? 'client' : 'team'}
                  content={comment.text}
                  senderName={comment.author.name}
                  timestamp={comment.created_at}
                  clientBubbleStyle={clientBubbleStyle}
                />
              );
            })}
            <div ref={commentsEndRef} />
          </>
        )}
      </div>
    </div>
  );
}

/* ── TaskCommentComposer — standalone comment composer ───────────────────── */

interface TaskCommentComposerProps {
  taskId: string;
  placeholder?: string;
  showAttachment?: boolean;
  minRows?: number;
  maxRows?: number;
}

export function TaskCommentComposer({
  taskId,
  placeholder,
  showAttachment,
  minRows,
  maxRows,
}: TaskCommentComposerProps) {
  const { mutateAsync: postComment, isPending: isSending } = usePostComment();

  async function handleSend(text: string, files?: import('../types/tasks').FileData[]) {
    await postComment({ taskId, comment: text, files });
  }

  return (
    <CommentInput
      taskId={taskId}
      onSend={handleSend}
      isSending={isSending}
      placeholder={placeholder}
      showAttachment={showAttachment}
      minRows={minRows}
      maxRows={maxRows}
    />
  );
}

/* ── TaskComments — backward-compat wrapper (combines list + composer) ──── */

interface TaskCommentsProps {
  taskId: string;
  onRead?: () => void;
  clientBubbleStyle?: 'solid' | 'light';
}

/**
 * @deprecated Use `TaskCommentsList` + `TaskCommentComposer` separately.
 * Kept for backward compatibility during migration.
 */
export function TaskComments({ taskId, onRead, clientBubbleStyle = 'light' }: TaskCommentsProps) {
  return (
    <div className="flex flex-col gap-3">
      <TaskCommentsList
        taskId={taskId}
        onRead={onRead}
        clientBubbleStyle={clientBubbleStyle}
        autoScrollOnLoad={true}
      />
      <TaskCommentComposer taskId={taskId} />
    </div>
  );
}
