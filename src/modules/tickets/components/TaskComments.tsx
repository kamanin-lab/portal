import { useEffect, useRef } from 'react';
import { MessageBubble } from '@/shared/components/common/MessageBubble';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { CommentInput } from './CommentInput';
import { useTaskComments, usePostComment } from '../hooks/useTaskComments';
import { dict } from '../lib/dictionary';

interface TaskCommentsProps {
  taskId: string;
  onRead?: () => void;
  clientBubbleStyle?: 'solid' | 'light';
}

export function TaskComments({ taskId, onRead, clientBubbleStyle = 'light' }: TaskCommentsProps) {
  const { data: comments = [], isLoading, error } = useTaskComments(taskId);
  const { mutateAsync: postComment, isPending: isSending } = usePostComment();
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

  // Scroll to bottom only once on initial load — never on subsequent updates
  // so users can scroll up to read history without being pulled back down.
  useEffect(() => {
    if (hasScrolled.current || isLoading || comments.length === 0) return;
    hasScrolled.current = true;
    commentsEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [comments, isLoading]);

  async function handleSend(text: string, files?: import('../types/tasks').FileData[]) {
    await postComment({ taskId, comment: text, files });
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 pt-2 gap-3">
      <h3 className="text-body font-semibold text-text-secondary uppercase tracking-[0.04em] shrink-0">
        {dict.labels.commentsTitle}
      </h3>

      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-3.5 px-1" style={{ scrollbarWidth: 'thin' }}>
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

      <CommentInput taskId={taskId} onSend={handleSend} isSending={isSending} />
    </div>
  );
}
